"use client";

import {
  memo,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { m } from "framer-motion";
import { Bot, Send, Square, Trash2, X } from "lucide-react";
import { PRONOUNS } from "@/lib/knowledge";
import {
  buildLocalFallbackAnswer,
  matchInstantAnswer,
} from "@/lib/instantAnswers";

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
}

const EASE = [0.19, 1, 0.22, 1] as const;
const MAX_CHARS = 500;
const SESSION_CHAT_KEY = "manikyam-agent-chat-v2";
const THINKING_LABEL_DELAY_MS = 2_000;
const CLIENT_FIRST_TOKEN_TIMEOUT_MS = 6_000;
const INSTANT_TYPING_DOTS_MS = 250;
const INSTANT_CHAR_MS = 10;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const SUGGESTION_CHIPS = [
  `${cap(PRONOUNS.possessive)} projects`,
  "Skills & tools",
  "Internships",
  `How to contact ${PRONOUNS.object}`,
] as const;

export const SEED_GREETING_MESSAGE: ChatMessage = {
  id: "seed-greeting",
  role: "model",
  text: "Hi! I'm Manikyam's personal agent. What would you like to know about Manikyam?",
};

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith("/")) return !trimmed.startsWith("//");
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === "https:" ||
      parsed.protocol === "http:" ||
      parsed.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenRegex =
    /(\*\*[^*\n]+?\*\*|\[[^\]]+?\]\((?:https?:\/\/|mailto:|\/)[^)\s]+?\)|https?:\/\/[^\s)]+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${idx++}`}>{token.slice(2, -2)}</strong>
      );
    } else if (token.startsWith("[")) {
      const sep = token.indexOf("](");
      const label = token.slice(1, sep);
      const href = token.slice(sep + 2, -1);
      if (isSafeHref(href)) {
        nodes.push(
          <a
            key={`${keyPrefix}-a-${idx++}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="agent-md-link"
          >
            {label}
          </a>
        );
      } else {
        nodes.push(label);
      }
    } else if (isSafeHref(token)) {
      const cleanUrl = token.replace(/[.,;!?]+$/, "");
      const trailing = token.slice(cleanUrl.length);
      nodes.push(
        <a
          key={`${keyPrefix}-u-${idx++}`}
          href={cleanUrl}
          target="_blank"
          rel="noreferrer"
          className="agent-md-link"
        >
          {cleanUrl}
        </a>
      );
      if (trailing) nodes.push(trailing);
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function SafeMarkdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (keyBase: number) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${keyBase}`} className="agent-md-list">
        {listItems.map((item, idx) => (
          <li key={`li-${keyBase}-${idx}`}>
            {renderInlineMarkdown(item, `li-${keyBase}-${idx}`)}
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((rawLine, lineIdx) => {
    const trimmed = rawLine.trim();
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
      return;
    }

    flushList(lineIdx);
    if (trimmed.length === 0) return;

    blocks.push(
      <p key={`p-${lineIdx}`} className="agent-md-p">
        {renderInlineMarkdown(trimmed, `p-${lineIdx}`)}
      </p>
    );
  });

  flushList(lines.length);
  return <>{blocks}</>;
}

// Lightweight incremental pass while tokens are streaming
function StreamingMarkdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  return (
    <>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        return (
          <p key={`sp-${idx}`} className="agent-md-p">
            {trimmed.replace(/\*\*/g, "")}
          </p>
        );
      })}
    </>
  );
}

interface MessageRowProps {
  msg: ChatMessage;
  isStreamingMsg: boolean;
  isTypewriting: boolean;
  onSkipTypewriter?: () => void;
}

const MessageRow = memo(function MessageRow({
  msg,
  isStreamingMsg,
  isTypewriting,
  onSkipTypewriter,
}: MessageRowProps) {
  if (msg.role === "user") {
    return (
      <div className="agent-msg agent-msg-user">
        <p className="agent-msg-user-text">{msg.text}</p>
      </div>
    );
  }

  return (
    <div
      className="agent-msg-row"
      onClick={isTypewriting ? onSkipTypewriter : undefined}
      title={isTypewriting ? "Click to show full answer" : undefined}
    >
      <span className="agent-msg-bot" aria-hidden="true">
        <Bot size={14} strokeWidth={1.7} />
      </span>
      <div className="agent-msg agent-msg-model">
        {isStreamingMsg ? (
          <StreamingMarkdown content={msg.text} />
        ) : (
          <SafeMarkdown content={msg.text} />
        )}
      </div>
    </div>
  );
});

interface AgentChatPanelProps {
  reducedMotion: boolean;
  pendingPrompt: { id: number; text: string } | null;
  onConsumePendingPrompt: () => void;
  onClose: () => void;
}

export default function AgentChatPanel({
  reducedMotion,
  pendingPrompt,
  onConsumePendingPrompt,
  onClose,
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = window.sessionStorage.getItem(SESSION_CHAT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (m): m is ChatMessage =>
              Boolean(
                m &&
                  typeof m === "object" &&
                  typeof m.id === "string" &&
                  (m.role === "user" || m.role === "model") &&
                  typeof m.text === "string"
              )
          );
          if (valid.length > 0) return valid.slice(-17);
        }
      }
    } catch {
      // Ignore restricted sessionStorage errors
    }
    return [SEED_GREETING_MESSAGE];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [typewritingMsgId, setTypewritingMsgId] = useState<string | null>(null);
  const [awaitingFirstToken, setAwaitingFirstToken] = useState(false);
  const [showThinkingLabel, setShowThinkingLabel] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesBoxRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const typewriterControlRef = useRef<{
    cancel: () => void;
    finishNow: () => void;
  } | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  // Focus input on mount
  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(focusTimer);
  }, []);

  // Switch typing dots to "Thinking..." after 2 seconds while waiting for first token
  useEffect(() => {
    if (!awaitingFirstToken) {
      setShowThinkingLabel(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowThinkingLabel(true);
    }, THINKING_LABEL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [awaitingFirstToken]);

  // Persist messages to sessionStorage
  useEffect(() => {
    try {
      const hasUserTurn = messages.some((m) => m.role === "user");
      if (hasUserTurn) {
        window.sessionStorage.setItem(
          SESSION_CHAT_KEY,
          JSON.stringify(messages.slice(-17))
        );
      } else {
        window.sessionStorage.removeItem(SESSION_CHAT_KEY);
      }
    } catch {
      // Ignore storage write errors
    }
  }, [messages]);

  // Auto-scroll on new messages unless visitor scrolled up
  useEffect(() => {
    if (!isNearBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: reducedMotion || streaming ? "auto" : "smooth",
    });
  }, [messages, awaitingFirstToken, showThinkingLabel, reducedMotion, streaming]);

  // Escape closes chat
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const stopStreaming = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    typewriterControlRef.current?.cancel();
    typewriterControlRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setStreamingMsgId(null);
    setTypewritingMsgId(null);
    setAwaitingFirstToken(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, [stopStreaming]);

  const handleMessagesScroll = () => {
    const box = messagesBoxRef.current;
    if (!box) return;
    const distanceFromBottom =
      box.scrollHeight - box.scrollTop - box.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 48;
  };

  const runInstantAnswer = useCallback(
    (assistantId: string, fullText: string) => {
      let stopped = false;
      let dotsTimer: number | null = null;
      let charRaf: number | null = null;

      const finishNow = () => {
        if (stopped) return;
        stopped = true;
        if (dotsTimer !== null) window.clearTimeout(dotsTimer);
        if (charRaf !== null) window.cancelAnimationFrame(charRaf);
        typewriterControlRef.current = null;
        setAwaitingFirstToken(false);
        setStreamingMsgId(null);
        setTypewritingMsgId(null);
        setStreaming(false);
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === assistantId);
          if (exists) {
            return prev.map((m) =>
              m.id === assistantId ? { ...m, text: fullText } : m
            );
          }
          return [...prev, { id: assistantId, role: "model", text: fullText }];
        });
      };

      const cancel = () => {
        stopped = true;
        if (dotsTimer !== null) window.clearTimeout(dotsTimer);
        if (charRaf !== null) window.cancelAnimationFrame(charRaf);
      };

      typewriterControlRef.current = { cancel, finishNow };

      dotsTimer = window.setTimeout(() => {
        if (stopped) return;
        setAwaitingFirstToken(false);
        setStreamingMsgId(assistantId);
        setTypewritingMsgId(assistantId);

        if (reducedMotion) {
          finishNow();
          return;
        }

        const initialSlice = fullText.slice(0, 2);
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "model", text: initialSlice },
        ]);

        const revealStart = performance.now();
        let lastLen = initialSlice.length;

        const step = () => {
          if (stopped) return;
          const elapsed = performance.now() - revealStart;
          const targetLen = Math.min(
            fullText.length,
            2 + Math.floor(elapsed / INSTANT_CHAR_MS)
          );
          if (targetLen > lastLen) {
            lastLen = targetLen;
            const snapshot = fullText.slice(0, targetLen);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: snapshot } : m
              )
            );
          }
          if (targetLen >= fullText.length) {
            stopped = true;
            typewriterControlRef.current = null;
            setStreamingMsgId(null);
            setTypewritingMsgId(null);
            setStreaming(false);
            return;
          }
          charRaf = window.requestAnimationFrame(step);
        };

        charRaf = window.requestAnimationFrame(step);
      }, INSTANT_TYPING_DOTS_MS);
    },
    [reducedMotion]
  );

  const sendMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim().slice(0, MAX_CHARS);
      if (!trimmed || streaming) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: "user",
        text: trimmed,
      };
      const assistantId = `m-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      const historyForApi = messagesRef.current
        .filter((m) => m.id !== SEED_GREETING_MESSAGE.id)
        .concat(userMsg)
        .slice(-8)
        .map((m) => ({ role: m.role, text: m.text }));

      isNearBottomRef.current = true;
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setStreaming(true);
      setAwaitingFirstToken(true);

      // Keep focus on input
      inputRef.current?.focus();

      // 1. Instant local match (zero network call)
      const instant = matchInstantAnswer(trimmed);
      if (instant) {
        runInstantAnswer(assistantId, instant);
        return;
      }

      // 2. Streaming API call with 6s first-token timeout
      const controller = new AbortController();
      abortRef.current = controller;
      let clientTimedOut = false;
      const firstTokenTimer = window.setTimeout(() => {
        clientTimedOut = true;
        controller.abort();
      }, CLIENT_FIRST_TOKEN_TIMEOUT_MS);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyForApi }),
          signal: controller.signal,
        });

        if (!res.ok) {
          window.clearTimeout(firstTokenTimer);
          let errMsg = buildLocalFallbackAnswer(trimmed);
          try {
            const data = (await res.json()) as { error?: string };
            if (data.error) errMsg = data.error;
          } catch {
            // Keep local fallback
          }
          setAwaitingFirstToken(false);
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "model", text: errMsg },
          ]);
          return;
        }

        if (!res.body) {
          window.clearTimeout(firstTokenTimer);
          const text = (await res.text()).trim() || buildLocalFallbackAnswer(trimmed);
          setAwaitingFirstToken(false);
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "model", text },
          ]);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let addedBubble = false;
        let receivedFirst = false;
        let dirty = false;

        const flushFrame = () => {
          rafIdRef.current = null;
          if (!dirty) return;
          dirty = false;
          const snapshot = accumulated;
          if (!addedBubble) {
            addedBubble = true;
            setAwaitingFirstToken(false);
            setStreamingMsgId(assistantId);
            setMessages((prev) => [
              ...prev,
              { id: assistantId, role: "model", text: snapshot },
            ]);
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: snapshot } : m
              )
            );
          }
        };

        const scheduleFlush = () => {
          dirty = true;
          if (rafIdRef.current === null) {
            rafIdRef.current = window.requestAnimationFrame(flushFrame);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;

          if (!receivedFirst) {
            receivedFirst = true;
            window.clearTimeout(firstTokenTimer);
          }
          accumulated += chunk;
          scheduleFlush();
        }

        const tail = decoder.decode();
        if (tail) {
          if (!receivedFirst) {
            receivedFirst = true;
            window.clearTimeout(firstTokenTimer);
          }
          accumulated += tail;
        }

        window.clearTimeout(firstTokenTimer);
        if (rafIdRef.current !== null) {
          window.cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        const finalText =
          accumulated.trim() ? accumulated : buildLocalFallbackAnswer(trimmed);

        setAwaitingFirstToken(false);
        setStreamingMsgId(null);
        setMessages((prev) => {
          if (addedBubble) {
            return prev.map((m) =>
              m.id === assistantId ? { ...m, text: finalText } : m
            );
          }
          return [...prev, { id: assistantId, role: "model", text: finalText }];
        });
      } catch (err) {
        window.clearTimeout(firstTokenTimer);
        if (rafIdRef.current !== null) {
          window.cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        setAwaitingFirstToken(false);
        setStreamingMsgId(null);

        const isAbort = (err as { name?: string })?.name === "AbortError";
        if (!isAbort || clientTimedOut) {
          const fallback = buildLocalFallbackAnswer(trimmed);
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "model", text: fallback },
          ]);
        }
      } finally {
        window.clearTimeout(firstTokenTimer);
        abortRef.current = null;
        setStreaming(false);
        setStreamingMsgId(null);
        setAwaitingFirstToken(false);
      }
    },
    [streaming, runInstantAnswer]
  );

  // Trigger pending prompt passed from greeting / section alert
  useEffect(() => {
    if (!pendingPrompt) return;
    onConsumePendingPrompt();
    void sendMessage(pendingPrompt.text);
  }, [pendingPrompt, onConsumePendingPrompt, sendMessage]);

  const handleClear = () => {
    stopStreaming();
    isNearBottomRef.current = true;
    setMessages([SEED_GREETING_MESSAGE]);
    try {
      window.sessionStorage.removeItem(SESSION_CHAT_KEY);
    } catch {
      // Ignore storage remove errors
    }
    inputRef.current?.focus();
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const hasUserSentMessage = messages.some((m) => m.role === "user");

  return (
    <m.section
      className="agent-panel"
      role="dialog"
      aria-modal="false"
      aria-label="Manikyam's Agent chat"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
      transition={{ duration: reducedMotion ? 0.16 : 0.38, ease: EASE }}
    >
      <header className="agent-panel-head">
        <div className="agent-panel-id">
          <div className="agent-head-bot" aria-hidden="true">
            <Bot size={18} strokeWidth={1.7} />
          </div>
          <div>
            <h2 className="agent-panel-title">Manikyam&apos;s Agent</h2>
            <p className="agent-panel-status">
              <span className="agent-status-dot" aria-hidden="true" />
              <span>Online</span>
            </p>
          </div>
        </div>

        <div className="agent-panel-actions">
          <button
            type="button"
            className="agent-icon-btn"
            onClick={handleClear}
            aria-label="Clear chat"
            title="Clear chat"
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Clear</span>
          </button>
          <button
            type="button"
            className="agent-icon-btn"
            onClick={onClose}
            aria-label="Close chat"
            title="Close chat"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        ref={messagesBoxRef}
        className="agent-messages"
        onScroll={handleMessagesScroll}
      >
        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            isStreamingMsg={msg.id === streamingMsgId}
            isTypewriting={msg.id === typewritingMsgId}
            onSkipTypewriter={() => typewriterControlRef.current?.finishNow()}
          />
        ))}

        {!hasUserSentMessage && (
          <div className="agent-panel-chips">
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className="agent-chip"
                onClick={() => void sendMessage(chip)}
                disabled={streaming}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {awaitingFirstToken && (
          <div
            className="agent-msg-row"
            aria-label={showThinkingLabel ? "Agent is thinking" : "Agent is typing"}
          >
            <span className="agent-msg-bot" aria-hidden="true">
              <Bot size={14} strokeWidth={1.7} />
            </span>
            <div className="agent-msg agent-msg-model agent-typing">
              {showThinkingLabel ? (
                <span className="agent-thinking-text">Thinking...</span>
              ) : (
                <>
                  <span className="agent-typing-dot" />
                  <span className="agent-typing-dot" />
                  <span className="agent-typing-dot" />
                </>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="agent-form" onSubmit={handleFormSubmit}>
        <div className="agent-input-wrap">
          <textarea
            ref={inputRef}
            className="agent-input"
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask about projects, UVM, internships..."
            rows={1}
            maxLength={MAX_CHARS}
            aria-label="Message Manikyam's agent"
          />
          {streaming ? (
            <button
              type="button"
              className="agent-send-btn is-stop"
              onClick={stopStreaming}
              aria-label="Stop response"
              title="Stop response"
            >
              <Square size={12} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              className="agent-send-btn"
              disabled={!input.trim() || streaming}
              aria-label="Send message"
              title="Send"
            >
              <Send size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="agent-form-meta">
          <span className="agent-disclaimer">
            Answers from portfolio info
          </span>
          <span className="agent-char-count">
            {input.length}/{MAX_CHARS}
          </span>
        </div>
      </form>
    </m.section>
  );
}
