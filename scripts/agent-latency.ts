const BASE_URL = process.env.AGENT_BASE_URL ?? "http://localhost:3000";

const SAMPLE_QUESTIONS = [
  "What did she verify in the AXI-to-OCP project?",
  "How did she achieve 60/60 scoreboard passes on APB?",
  "What was her work at URSC ISRO Bengaluru?",
  "What is the difference between her UVM monitor and scoreboard?",
  "What did she verify in the AXI-to-OCP project?", // Repeated to verify LRU cache hit
];

interface SampleResult {
  question: string;
  ttfbMs: number;
  totalMs: number;
  source: string;
  model: string;
  serverTiming: string;
  chars: number;
}

async function measureQuestion(question: string): Promise<SampleResult> {
  const startedAt = performance.now();
  const res = await fetch(`${BASE_URL}/api/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      messages: [{ role: "user", text: question }],
    }),
  });

  const source = res.headers.get("X-Agent-Source") ?? "unknown";
  const model = res.headers.get("X-Agent-Model") ?? "unknown";
  const serverTiming = res.headers.get("Server-Timing") ?? "";

  if (!res.body) {
    const text = await res.text();
    const totalMs = performance.now() - startedAt;
    return {
      question,
      ttfbMs: totalMs,
      totalMs,
      source,
      model,
      serverTiming,
      chars: text.length,
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let ttfbMs = 0;
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk && ttfbMs === 0) {
      ttfbMs = performance.now() - startedAt;
    }
    fullText += chunk;
  }
  fullText += decoder.decode();

  const totalMs = performance.now() - startedAt;
  if (ttfbMs === 0) ttfbMs = totalMs;

  return {
    question,
    ttfbMs,
    totalMs,
    source,
    model,
    serverTiming,
    chars: fullText.length,
  };
}

async function main() {
  const warmRes = await fetch(`${BASE_URL}/api/agent?warm=1`);
  const warmJson = (await warmRes.json()) as { model?: string; warmed?: boolean };
  console.log(
    `Warm-up: status=${warmRes.status} model=${warmJson.model ?? "unknown"} Server-Timing=${warmRes.headers.get("Server-Timing") ?? ""}`
  );

  const results: SampleResult[] = [];
  for (let i = 0; i < SAMPLE_QUESTIONS.length; i++) {
    const res = await measureQuestion(SAMPLE_QUESTIONS[i]);
    results.push(res);
    console.log(
      `[${i + 1}] source=${res.source} model=${res.model} ttfb=${res.ttfbMs.toFixed(1)}ms total=${res.totalMs.toFixed(1)}ms chars=${res.chars} | ${res.serverTiming}`
    );
  }

  const avgTtfb =
    results.reduce((acc, r) => acc + r.ttfbMs, 0) / results.length;
  const avgTotal =
    results.reduce((acc, r) => acc + r.totalMs, 0) / results.length;

  console.log(
    `\nAverage (n=${results.length}): TTFB=${avgTtfb.toFixed(1)}ms, Total=${avgTotal.toFixed(1)}ms`
  );
}

main().catch((err) => {
  console.error("Latency check failed:", err);
  process.exitCode = 1;
});

