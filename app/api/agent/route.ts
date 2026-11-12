import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { MEMOIZED_SYSTEM_INSTRUCTION } from "@/lib/agentPrompt";
import { buildLocalFallbackAnswer, normalizeQuery } from "@/lib/instantAnswers";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "bom1";

interface IncomingMessage {
  role: "user" | "model";
  text: string;
}

const STREAM_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
} as const;

const JSON_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

const FIRST_TOKEN_TIMEOUT_MS = 6_000;
const TOTAL_TIMEOUT_MS = 20_000;
const MAX_MODEL_TRIES = 3;

const EXCLUDED_MODEL_TERMS = [
  "pro",
  "image",
  "tts",
  "audio",
  "live",
  "embedding",
  "veo",
  "imagen",
  "vision",
  "robotics",
  "computer-use",
  "native",
];

// Server-side LRU cache for first-turn questions (100 entries, 30 min TTL)
const LRU_MAX_ENTRIES = 100;
const LRU_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  text: string;
  model: string;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();

function getCachedAnswer(key: string): CacheEntry | null {
  if (!key) return null;
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  // Refresh LRU recency
  responseCache.delete(key);
  responseCache.set(key, entry);
  return entry;
}

function setCachedAnswer(key: string, text: string, model: string): void {
  if (!key || !text.trim()) return;
  if (responseCache.has(key)) {
    responseCache.delete(key);
  } else if (responseCache.size >= LRU_MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) {
      responseCache.delete(oldestKey);
    }
  }
  responseCache.set(key, {
    text,
    model,
    expiresAt: Date.now() + LRU_TTL_MS,
  });
}

let cachedClient: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;
let cachedCandidates: string[] = [];
let activeModel: string | null = null;
let modelInitPromise: Promise<string | null> | null = null;
let loggedStartupModel: string | null = null;
const thinkingUnsupportedModels = new Set<string>();

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  if (cachedClient && cachedApiKey === apiKey) return cachedClient;
  cachedApiKey = apiKey;
  cachedClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      retryOptions: {
        attempts: 1, // Disable automatic SDK retries
      },
    },
  });
  return cachedClient;
}

function logChosenModelOnce(model: string): void {
  if (loggedStartupModel === model) return;
  loggedStartupModel = model;
  console.info(`[agent] using model: ${model}`);
}

function extractVersionScore(name: string): number {
  const matches = name.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return 0;
  let best = 0;
  for (const token of matches) {
    const val = Number.parseFloat(token);
    if (Number.isFinite(val) && val > best) {
      best = val;
    }
  }
  return best;
}

function compareModels(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();

  const tier = (s: string) =>
    s.includes("flash-lite") ? 0 : s.includes("flash") ? 1 : 2;
  const tierDiff = tier(al) - tier(bl);
  if (tierDiff !== 0) return tierDiff;

  const isUnstable = (s: string) => s.includes("preview") || s.includes("exp");
  const stabilityDiff = Number(isUnstable(al)) - Number(isUnstable(bl));
  if (stabilityDiff !== 0) return stabilityDiff;

  const versionDiff = extractVersionScore(bl) - extractVersionScore(al);
  if (versionDiff !== 0) return versionDiff;

  return al.localeCompare(bl);
}

async function discoverCandidates(ai: GoogleGenAI): Promise<string[]> {
  const pager = await ai.models.list();
  const eligible: string[] = [];

  for await (const model of pager) {
    const rawName = model.name?.trim();
    if (!rawName) continue;

    const actions = model.supportedActions;
    if (!Array.isArray(actions) || !actions.includes("generateContent")) {
      continue;
    }

    const shortName = rawName.replace(/^models\//, "");
    const lower = shortName.toLowerCase();
    if (EXCLUDED_MODEL_TERMS.some((term) => lower.includes(term))) {
      continue;
    }

    eligible.push(shortName);
  }

  const uniqueSorted = Array.from(new Set(eligible)).sort(compareModels);
  cachedCandidates = uniqueSorted;
  return uniqueSorted;
}

async function ensureModelReady(forceRepick = false): Promise<string | null> {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel && !forceRepick) {
    if (!activeModel) {
      activeModel = envModel;
      logChosenModelOnce(envModel);
    }
    return activeModel;
  }

  if (activeModel && !forceRepick) {
    return activeModel;
  }

  if (modelInitPromise && !forceRepick) {
    return modelInitPromise;
  }

  const ai = getGenAIClient();
  if (!ai) return null;

  modelInitPromise = (async () => {
    try {
      const candidates = await discoverCandidates(ai);
      const chosen = candidates[0] ?? null;
      if (chosen) {
        activeModel = chosen;
        logChosenModelOnce(chosen);
      }
      return chosen;
    } catch {
      return activeModel;
    } finally {
      modelInitPromise = null;
    }
  })();

  return modelInitPromise;
}

// Warm model selection once at module import
void ensureModelReady();

function getErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const record = err as Record<string, unknown>;
  if (typeof record.status === "number") return record.status;
  if (typeof record.code === "number") return record.code;
  return undefined;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.toLowerCase();
  if (typeof err === "string") return err.toLowerCase();
  return "";
}

function isQuotaError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status === 429) return true;
  const msg = getErrorMessage(err);
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit")
  );
}

function isModelUnavailableError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status === 404) return true;
  const msg = getErrorMessage(err);
  return (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("not supported")
  );
}

function isThinkingRejectionError(err: unknown): boolean {
  const status = getErrorStatus(err);
  const msg = getErrorMessage(err);
  if (
    status === 400 ||
    msg.includes("400") ||
    msg.includes("invalid_argument") ||
    msg.includes("invalid argument")
  ) {
    return (
      msg.includes("thinking") ||
      msg.includes("budget") ||
      msg.includes("level")
    );
  }
  return false;
}

function stripControlChars(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return false;
}

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

function formatServerTiming(timings: {
  routeMs: number;
  modelMs: number;
  ttfbMs: number;
  totalMs?: number;
}): string {
  const parts = [
    `route;dur=${timings.routeMs.toFixed(1)}`,
    `model;dur=${timings.modelMs.toFixed(1)}`,
    `ttfb;dur=${timings.ttfbMs.toFixed(1)}`,
  ];
  if (typeof timings.totalMs === "number") {
    parts.push(`total;dur=${timings.totalMs.toFixed(1)}`);
  }
  return parts.join(", ");
}

function logDevTiming(
  model: string,
  source: string,
  timings: { routeMs: number; modelMs: number; ttfbMs: number; totalMs: number }
): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info(
    `[agent] model=${model} source=${source} route=${timings.routeMs.toFixed(1)}ms modelReady=${timings.modelMs.toFixed(1)}ms ttfb=${timings.ttfbMs.toFixed(1)}ms total=${timings.totalMs.toFixed(1)}ms`
  );
}

function createFastTextStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function buildGenerateConfig(
  model: string,
  abortSignal: AbortSignal,
  includeThinking: boolean
): GenerateContentConfig {
  const config: GenerateContentConfig = {
    systemInstruction: MEMOIZED_SYSTEM_INSTRUCTION,
    temperature: 0.3,
    maxOutputTokens: 300,
    abortSignal,
  };

  if (includeThinking && !thinkingUnsupportedModels.has(model)) {
    if (model.toLowerCase().includes("gemini-3")) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
    } else {
      config.thinkingConfig = { thinkingBudget: 0 };
    }
  }

  return config;
}

export async function GET(req: NextRequest) {
  const tStart = performance.now();
  const isWarm = req.nextUrl.searchParams.get("warm") === "1";

  const chosen = (await ensureModelReady()) ?? "local-fallback";
  const modelMs = performance.now() - tStart;

  return NextResponse.json(
    { ok: true, model: chosen, ...(isWarm ? { warmed: true } : {}) },
    {
      status: 200,
      headers: {
        ...JSON_NO_STORE_HEADERS,
        "Server-Timing": `route;dur=0.0, model;dur=${modelMs.toFixed(1)}`,
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const tRouteStart = performance.now();

  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403, headers: JSON_NO_STORE_HEADERS }
    );
  }

  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json(
      { error: rate.message },
      {
        status: 429,
        headers: {
          ...JSON_NO_STORE_HEADERS,
          "Retry-After": String(rate.retryAfterSec),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400, headers: JSON_NO_STORE_HEADERS }
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("messages" in body) ||
    !Array.isArray((body as { messages: unknown }).messages)
  ) {
    return NextResponse.json(
      { error: "Messages array is required." },
      { status: 400, headers: JSON_NO_STORE_HEADERS }
    );
  }

  const rawMessages = (body as { messages: unknown[] }).messages;
  if (rawMessages.length === 0 || rawMessages.length > 8) {
    return NextResponse.json(
      { error: "Messages must contain between 1 and 8 turns." },
      { status: 400, headers: JSON_NO_STORE_HEADERS }
    );
  }

  const sanitized: IncomingMessage[] = [];
  for (const item of rawMessages) {
    if (!item || typeof item !== "object") {
      return NextResponse.json(
        { error: "Invalid message format." },
        { status: 400, headers: JSON_NO_STORE_HEADERS }
      );
    }
    const { role, text } = item as { role?: unknown; text?: unknown };
    if ((role !== "user" && role !== "model") || typeof text !== "string") {
      return NextResponse.json(
        { error: "Invalid message role or text." },
        { status: 400, headers: JSON_NO_STORE_HEADERS }
      );
    }
    const cleaned = stripControlChars(text).trim();
    if (cleaned.length === 0 || cleaned.length > 500) {
      return NextResponse.json(
        { error: "Each message must be between 1 and 500 characters." },
        { status: 400, headers: JSON_NO_STORE_HEADERS }
      );
    }
    sanitized.push({ role, text: cleaned });
  }

  const lastMessage = sanitized[sanitized.length - 1];
  if (lastMessage.role !== "user") {
    return NextResponse.json(
      { error: "Last message must be from user." },
      { status: 400, headers: JSON_NO_STORE_HEADERS }
    );
  }

  const isFirstTurn = sanitized.length === 1;
  const cacheKey = isFirstTurn ? normalizeQuery(lastMessage.text) : "";
  if (cacheKey) {
    const cached = getCachedAnswer(cacheKey);
    if (cached) {
      const now = performance.now();
      const ttfbMs = now - tRouteStart;
      logDevTiming(cached.model, "cache", {
        routeMs: 0,
        modelMs: 0,
        ttfbMs,
        totalMs: ttfbMs,
      });
      return new Response(createFastTextStream(cached.text), {
        status: 200,
        headers: {
          ...STREAM_HEADERS,
          "X-Agent-Source": "cache",
          "X-Agent-Model": cached.model,
          "Server-Timing": formatServerTiming({
            routeMs: 0,
            modelMs: 0,
            ttfbMs,
            totalMs: ttfbMs,
          }),
        },
      });
    }
  }

  const ai = getGenAIClient();
  const initialModel = await ensureModelReady();
  const modelReadyMs = performance.now() - tRouteStart;

  if (!ai || !initialModel) {
    const fallback = buildLocalFallbackAnswer(lastMessage.text);
    const now = performance.now();
    const totalMs = now - tRouteStart;
    logDevTiming("local-fallback", "fallback", {
      routeMs: 0,
      modelMs: modelReadyMs,
      ttfbMs: totalMs,
      totalMs,
    });
    return new Response(createFastTextStream(fallback), {
      status: 200,
      headers: {
        ...STREAM_HEADERS,
        "X-Agent-Source": "fallback",
        "X-Agent-Model": "local-fallback",
        "Server-Timing": formatServerTiming({
          routeMs: 0,
          modelMs: modelReadyMs,
          ttfbMs: totalMs,
          totalMs,
        }),
      },
    });
  }

  const contents = sanitized.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const abortController = new AbortController();
  let firstTokenTimedOut = false;
  const firstTokenTimer = setTimeout(() => {
    firstTokenTimedOut = true;
    abortController.abort();
  }, FIRST_TOKEN_TIMEOUT_MS);
  const totalTimer = setTimeout(() => {
    abortController.abort();
  }, TOTAL_TIMEOUT_MS);

  const cleanupTimers = () => {
    clearTimeout(firstTokenTimer);
    clearTimeout(totalTimer);
  };

  try {
    const candidates: string[] = [initialModel];
    for (const c of cachedCandidates) {
      if (!candidates.includes(c)) candidates.push(c);
    }

    let usedModel = initialModel;
    let iterator: AsyncIterator<{ text?: string }> | null = null;
    let firstText = "";
    let tried = 0;

    for (let i = 0; i < candidates.length && tried < MAX_MODEL_TRIES; i++) {
      if (firstTokenTimedOut || abortController.signal.aborted) break;
      const candidate = candidates[i];
      tried += 1;

      const tryStream = async (includeThinking: boolean) => {
        const stream = await ai.models.generateContentStream({
          model: candidate,
          contents,
          config: buildGenerateConfig(
            candidate,
            abortController.signal,
            includeThinking
          ),
        });
        const iter = stream[Symbol.asyncIterator]();
        let firstChunkText = "";
        while (true) {
          const step = await iter.next();
          if (step.done) break;
          if (step.value?.text) {
            firstChunkText = step.value.text;
            break;
          }
        }
        return { iter, firstChunkText };
      };

      try {
        const result = await tryStream(true);
        iterator = result.iter;
        firstText = result.firstChunkText;
        usedModel = candidate;
        activeModel = candidate;
        break;
      } catch (err) {
        if (firstTokenTimedOut || abortController.signal.aborted) {
          break;
        }
        if (isThinkingRejectionError(err) && !thinkingUnsupportedModels.has(candidate)) {
          thinkingUnsupportedModels.add(candidate);
          try {
            const retryResult = await tryStream(false);
            iterator = retryResult.iter;
            firstText = retryResult.firstChunkText;
            usedModel = candidate;
            activeModel = candidate;
            break;
          } catch (retryErr) {
            err = retryErr;
          }
        }
        if (isQuotaError(err)) {
          break;
        }
        if (isModelUnavailableError(err)) {
          if (i === 0 && tried < MAX_MODEL_TRIES) {
            try {
              const repicked = await discoverCandidates(ai);
              for (const c of repicked) {
                if (!candidates.includes(c)) candidates.push(c);
              }
            } catch {
              // Ignore discovery failure
            }
          }
          continue;
        }
        break;
      }
    }

    if (!iterator || !firstText || firstTokenTimedOut) {
      cleanupTimers();
      const fallback = buildLocalFallbackAnswer(lastMessage.text);
      const totalMs = performance.now() - tRouteStart;
      logDevTiming(usedModel, "fallback", {
        routeMs: 0,
        modelMs: modelReadyMs,
        ttfbMs: totalMs,
        totalMs,
      });
      return new Response(createFastTextStream(fallback), {
        status: 200,
        headers: {
          ...STREAM_HEADERS,
          "X-Agent-Source": "fallback",
          "X-Agent-Model": usedModel,
          "Server-Timing": formatServerTiming({
            routeMs: 0,
            modelMs: modelReadyMs,
            ttfbMs: totalMs,
            totalMs,
          }),
        },
      });
    }

    // First token arrived: clear the 6s first-token timer, keep 20s total cap
    clearTimeout(firstTokenTimer);
    const ttfbMs = performance.now() - tRouteStart;
    const encoder = new TextEncoder();
    const activeIterator = iterator;
    let accumulated = firstText;

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(firstText));
          while (true) {
            const step = await activeIterator.next();
            if (step.done) break;
            const chunkText = step.value?.text;
            if (chunkText) {
              accumulated += chunkText;
              controller.enqueue(encoder.encode(chunkText));
            }
          }
          if (cacheKey && accumulated.trim()) {
            setCachedAnswer(cacheKey, accumulated, usedModel);
          }
          controller.close();
        } catch {
          controller.close();
        } finally {
          clearTimeout(totalTimer);
          const totalMs = performance.now() - tRouteStart;
          logDevTiming(usedModel, "stream", {
            routeMs: 0,
            modelMs: modelReadyMs,
            ttfbMs,
            totalMs,
          });
        }
      },
      cancel() {
        cleanupTimers();
        abortController.abort();
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        ...STREAM_HEADERS,
        "X-Agent-Source": "stream",
        "X-Agent-Model": usedModel,
        "Server-Timing": formatServerTiming({
          routeMs: 0,
          modelMs: modelReadyMs,
          ttfbMs,
        }),
      },
    });
  } catch {
    cleanupTimers();
    const fallback = buildLocalFallbackAnswer(lastMessage.text);
    const totalMs = performance.now() - tRouteStart;
    logDevTiming(initialModel, "fallback", {
      routeMs: 0,
      modelMs: modelReadyMs,
      ttfbMs: totalMs,
      totalMs,
    });
    return new Response(createFastTextStream(fallback), {
      status: 200,
      headers: {
        ...STREAM_HEADERS,
        "X-Agent-Source": "fallback",
        "X-Agent-Model": initialModel,
        "Server-Timing": formatServerTiming({
          routeMs: 0,
          modelMs: modelReadyMs,
          ttfbMs: totalMs,
          totalMs,
        }),
      },
    });
  }
}
