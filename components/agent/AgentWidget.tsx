"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, m } from "framer-motion";
import { Bot, X } from "lucide-react";
import { PRONOUNS } from "@/lib/knowledge";
import { useSectionObserver } from "@/lib/useSectionObserver";

const AgentAvatar = dynamic(() => import("./AgentAvatar"), { ssr: false });
const AgentChatPanel = dynamic(() => import("./AgentChatPanel"), { ssr: false });

const LOTTIE_NUDGE_MODE: "first-section" | "every-section" | "off" =
  "every-section";
const SECTION_NUDGES = true;

const EASE = [0.19, 1, 0.22, 1] as const;

const SESSION_GREETED_KEY = "manikyam-agent-greeted";
const SESSION_OPENED_KEY = "manikyam-agent-opened";
const SESSION_NUDGED_KEY = "manikyam-agent-nudged-sections";
const SESSION_NUDGES_MUTED_KEY = "manikyam-agent-nudges-muted";
const SESSION_LOTTIE_SECTION_KEY = "manikyam-agent-lottie-section-done";

// <= 45 chars: 42 chars
const GREETING_TEXT = "Hi! I'm Manikyam's agent. Ask me anything.";

type LottiePhase = "idle" | "greeting" | "section" | "leaving" | "done";

interface SectionNudgeConfig {
  id: string;
  nudge: string;
  prompt: string;
}

const SECTION_NUDGES_LIST: SectionNudgeConfig[] = [
  {
    id: "skills",
    nudge: `Hello! Ask me about ${PRONOUNS.possessive} skills.`,
    prompt: `Tell me about ${PRONOUNS.possessive} technical skills and verification tools.`,
  },
  {
    id: "how",
    nudge: `Hello! Ask me how ${PRONOUNS.subject} verifies.`,
    prompt: `How does ${PRONOUNS.subject} verify protocols like APB and AXI?`,
  },
  {
    id: "work",
    nudge: "Hello! Want a summary of a project?",
    prompt: `Summarize ${PRONOUNS.possessive} verification and RTL projects.`,
  },
  {
    id: "experience",
    nudge: `Hello! Ask me about ${PRONOUNS.possessive} internships.`,
    prompt: `Tell me about ${PRONOUNS.possessive} internships.`,
  },
  {
    id: "recognition",
    nudge: `Hello! Ask me about ${PRONOUNS.possessive} certs.`,
    prompt: `Tell me about ${PRONOUNS.possessive} certifications and fellowships.`,
  },
  {
    id: "contact",
    nudge: `Hello! I can share how to reach ${PRONOUNS.object}.`,
    prompt: `How can I contact ${PRONOUNS.object}?`,
  },
];

const SECTION_IDS = SECTION_NUDGES_LIST.map((s) => s.id);

export default function AgentWidget() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isShortViewport, setIsShortViewport] = useState(false);
  const [lottiePhase, setLottiePhase] = useState<LottiePhase>("idle");
  const [lottieBubbleText, setLottieBubbleText] = useState<string | null>(null);
  const [lottieSectionPrompt, setLottieSectionPrompt] = useState<string | null>(
    null
  );

  const [chatOpen, setChatOpen] = useState(false);
  const [hasRequestedChat, setHasRequestedChat] = useState(false);
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<{
    id: number;
    text: string;
  } | null>(null);

  const [activeNudge, setActiveNudge] = useState<SectionNudgeConfig | null>(
    null
  );
  const [nudgesMuted, setNudgesMuted] = useState(false);

  const botBtnRef = useRef<HTMLButtonElement | null>(null);
  const warmedApiRef = useRef(false);
  const pageReadyForLottieRef = useRef(false);
  const lastScrollAtRef = useRef<number>(0);
  const scrollIdleTimerRef = useRef<number | null>(null);
  const pendingScrollEntryRef = useRef<string | null>(null);

  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const lottiePhaseRef = useRef(lottiePhase);
  lottiePhaseRef.current = lottiePhase;
  const nudgesMutedRef = useRef(nudgesMuted);
  nudgesMutedRef.current = nudgesMuted;

  const seenSectionsRef = useRef<Set<string>>(new Set());
  const lastNudgeAtRef = useRef<number>(0);
  const lottieSectionUsedRef = useRef(false);

  // Sync data attribute for TubesBackground pause while chat covers hero
  useEffect(() => {
    document.documentElement.dataset.agentChatOpen = chatOpen
      ? "true"
      : "false";
  }, [chatOpen]);

  const warmAgentRoute = useCallback(() => {
    if (warmedApiRef.current) return;
    warmedApiRef.current = true;
    void fetch("/api/agent?warm=1", { method: "GET", keepalive: true }).catch(
      () => {
        // Ignore warm-up errors
      }
    );
  }, []);

  // Idle prefetch of lottie_light + wave.json + route warm-up after window load
  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const triggerPrefetch = () => {
      if (cancelled) return;
      warmAgentRoute();
      void import("./AgentAvatar").then((mod) => {
        if (!cancelled) void mod.prefetchAgentLottie();
      });
    };

    const scheduleIdle = () => {
      if (cancelled) return;
      const w = window as Window & {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number }
        ) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (typeof w.requestIdleCallback === "function") {
        idleId = w.requestIdleCallback(triggerPrefetch, { timeout: 1500 });
      } else {
        timeoutId = window.setTimeout(triggerPrefetch, 400);
      }
    };

    if (document.readyState === "complete") {
      scheduleIdle();
    } else {
      window.addEventListener("load", scheduleIdle, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleIdle);
      const w = window as Window & {
        cancelIdleCallback?: (id: number) => void;
      };
      if (idleId !== null && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [warmAgentRoute]);

  // Hydrate sessionStorage, media queries & initial greeting
  useEffect(() => {
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const shortMq = window.matchMedia("(max-height: 639px)");

    const syncMotion = () => setReducedMotion(motionMq.matches);
    const syncHeight = () => setIsShortViewport(shortMq.matches);

    syncMotion();
    syncHeight();

    motionMq.addEventListener("change", syncMotion);
    shortMq.addEventListener("change", syncHeight);

    let alreadyGreeted = false;
    try {
      alreadyGreeted =
        window.sessionStorage.getItem(SESSION_GREETED_KEY) === "1";
      setHasOpenedChat(
        window.sessionStorage.getItem(SESSION_OPENED_KEY) === "1"
      );
      setNudgesMuted(
        window.sessionStorage.getItem(SESSION_NUDGES_MUTED_KEY) === "1"
      );
      lottieSectionUsedRef.current =
        window.sessionStorage.getItem(SESSION_LOTTIE_SECTION_KEY) === "1";

      const savedNudged = window.sessionStorage.getItem(SESSION_NUDGED_KEY);
      if (savedNudged) {
        const parsedIds = JSON.parse(savedNudged) as unknown;
        if (Array.isArray(parsedIds)) {
          seenSectionsRef.current = new Set(
            parsedIds.filter((x): x is string => typeof x === "string")
          );
        }
      }
    } catch {
      // Ignore restricted sessionStorage errors
    }

    // Never mount Lottie during page's first 2 seconds
    const minReadyTimer = window.setTimeout(() => {
      pageReadyForLottieRef.current = true;
    }, 2000);

    if (alreadyGreeted) {
      setLottiePhase("done");
      setLottieBubbleText(null);
      return () => {
        window.clearTimeout(minReadyTimer);
        motionMq.removeEventListener("change", syncMotion);
        shortMq.removeEventListener("change", syncHeight);
      };
    }

    let alive = true;
    const appearTimer = window.setTimeout(() => {
      if (!alive || chatOpenRef.current) {
        setLottiePhase("done");
        return;
      }
      setLottiePhase("greeting");
      setLottieBubbleText(GREETING_TEXT);
      setLottieSectionPrompt(null);
      try {
        window.sessionStorage.setItem(SESSION_GREETED_KEY, "1");
      } catch {
        // Ignore storage write errors
      }
    }, 2500);

    return () => {
      alive = false;
      window.clearTimeout(minReadyTimer);
      window.clearTimeout(appearTimer);
      motionMq.removeEventListener("change", syncMotion);
      shortMq.removeEventListener("change", syncHeight);
    };
  }, []);

  // Auto-finish greeting or section Lottie after ~5s
  useEffect(() => {
    if (lottiePhase !== "greeting" && lottiePhase !== "section") return;
    const timer = window.setTimeout(() => {
      setLottieBubbleText(null);
      setLottieSectionPrompt(null);
      setLottiePhase("leaving");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [lottiePhase, lottieBubbleText]);

  // Complete shrink-out -> unmount Lottie completely
  useEffect(() => {
    if (lottiePhase !== "leaving") return;
    const doneDelay = reducedMotion ? 220 : 700;
    const timer = window.setTimeout(() => {
      setLottiePhase("done");
    }, doneDelay);
    return () => window.clearTimeout(timer);
  }, [lottiePhase, reducedMotion]);

  // Auto-dismiss text section nudge after 5s
  useEffect(() => {
    if (!activeNudge) return;
    const timer = window.setTimeout(() => {
      setActiveNudge(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeNudge]);

  // Track scroll timestamp so Lottie / alerts wait for 400ms scroll idle
  useEffect(() => {
    const onScroll = () => {
      lastScrollAtRef.current = Date.now();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const triggerSectionNotice = useCallback((sectionId: string) => {
    if (!SECTION_NUDGES || nudgesMutedRef.current) return;
    if (chatOpenRef.current) return;
    if (lottiePhaseRef.current !== "done" && lottiePhaseRef.current !== "section") return;
    if (!pageReadyForLottieRef.current) return;
    if (seenSectionsRef.current.has(sectionId)) return;

    const now = Date.now();
    if (now - lastNudgeAtRef.current < 2000) return;

    const config = SECTION_NUDGES_LIST.find((s) => s.id === sectionId);
    if (!config) return;

    seenSectionsRef.current.add(sectionId);
    lastNudgeAtRef.current = now;
    try {
      window.sessionStorage.setItem(
        SESSION_NUDGED_KEY,
        JSON.stringify(Array.from(seenSectionsRef.current))
      );
    } catch {
      // Ignore storage write errors
    }

    const canUseLottie =
      LOTTIE_NUDGE_MODE === "every-section" ||
      (LOTTIE_NUDGE_MODE === "first-section" && !lottieSectionUsedRef.current);

    if (canUseLottie) {
      lottieSectionUsedRef.current = true;
      try {
        window.sessionStorage.setItem(SESSION_LOTTIE_SECTION_KEY, "1");
      } catch {
        // Ignore storage write errors
      }
      setActiveNudge(null);
      setLottieSectionPrompt(config.prompt);
      setLottieBubbleText(config.nudge);
      setLottiePhase("section");
    } else {
      setActiveNudge(config);
    }
  }, []);

  const handleSectionIntersect = useCallback(
    (entry: IntersectionObserverEntry) => {
      const sectionId = entry.target.id;
      if (!SECTION_NUDGES || nudgesMutedRef.current) return;
      if (chatOpenRef.current) return;
      if (seenSectionsRef.current.has(sectionId)) return;

      pendingScrollEntryRef.current = sectionId;
      if (scrollIdleTimerRef.current !== null) {
        window.clearTimeout(scrollIdleTimerRef.current);
      }

      const elapsedSinceScroll = Date.now() - lastScrollAtRef.current;
      const waitMs = Math.max(0, 400 - elapsedSinceScroll);
      scrollIdleTimerRef.current = window.setTimeout(() => {
        scrollIdleTimerRef.current = null;
        const targetId = pendingScrollEntryRef.current;
        pendingScrollEntryRef.current = null;
        if (targetId) triggerSectionNotice(targetId);
      }, waitMs);
    },
    [triggerSectionNotice]
  );

  useSectionObserver({
    ids: SECTION_IDS,
    threshold: 0,
    rootMargin: "-28% 0px -28% 0px",
    onIntersect: handleSectionIntersect,
    enabled: SECTION_NUDGES && !nudgesMuted,
  });

  useEffect(() => {
    return () => {
      if (scrollIdleTimerRef.current !== null) {
        window.clearTimeout(scrollIdleTimerRef.current);
      }
    };
  }, []);

  const markChatOpened = useCallback(() => {
    setHasRequestedChat(true);
    setHasOpenedChat(true);
    setActiveNudge(null);
    setLottieBubbleText(null);
    setLottieSectionPrompt(null);
    if (lottiePhaseRef.current === "greeting" || lottiePhaseRef.current === "section") {
      setLottiePhase("leaving");
    } else if (lottiePhaseRef.current === "idle") {
      setLottiePhase("done");
    }
    try {
      window.sessionStorage.setItem(SESSION_OPENED_KEY, "1");
      window.sessionStorage.setItem(SESSION_GREETED_KEY, "1");
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const openChatWithPrompt = useCallback(
    (promptText?: string) => {
      markChatOpened();
      setChatOpen(true);
      if (promptText) {
        setPendingPrompt({ id: Date.now(), text: promptText });
      }
    },
    [markChatOpened]
  );

  const handleCloseChat = useCallback(() => {
    setChatOpen(false);
    window.requestAnimationFrame(() => {
      botBtnRef.current?.focus();
    });
  }, []);

  const handleDismissLottie = () => {
    setLottieBubbleText(null);
    setLottieSectionPrompt(null);
    setLottiePhase("leaving");
  };

  const handleStopNudges = () => {
    setActiveNudge(null);
    setNudgesMuted(true);
    try {
      window.sessionStorage.setItem(SESSION_NUDGES_MUTED_KEY, "1");
    } catch {
      // Ignore storage write errors
    }
  };

  const isLottieMounted =
    lottiePhase === "greeting" ||
    lottiePhase === "section" ||
    lottiePhase === "leaving";
  const showBotButton = lottiePhase === "idle" || lottiePhase === "done";
  const isSectionLottie = lottiePhase === "section";

  return (
    <aside className="agent-dock" aria-label="Personal AI Assistant">
      <AnimatePresence>
        {hasRequestedChat && chatOpen && (
          <AgentChatPanel
            reducedMotion={reducedMotion}
            pendingPrompt={pendingPrompt}
            onConsumePendingPrompt={() => setPendingPrompt(null)}
            onClose={handleCloseChat}
          />
        )}
      </AnimatePresence>

      {/* Compact greeting or section-alert bubble beside Lottie */}
      <AnimatePresence>
        {!chatOpen &&
          !isShortViewport &&
          (lottiePhase === "greeting" || lottiePhase === "section") &&
          lottieBubbleText && (
            <m.div
              className="agent-bubble agent-bubble-compact"
              role="region"
              aria-label={isSectionLottie ? "Section assistant alert" : "Agent greeting"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <button
                type="button"
                className="agent-bubble-close"
                onClick={handleDismissLottie}
                aria-label="Dismiss greeting"
              >
                <X size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="agent-bubble-trigger"
                onClick={() =>
                  openChatWithPrompt(lottieSectionPrompt ?? undefined)
                }
              >
                <p className="agent-bubble-line">{lottieBubbleText}</p>
              </button>
            </m.div>
          )}
      </AnimatePresence>

      {/* Text-only section nudge beside Bot button */}
      <AnimatePresence>
        {!chatOpen &&
          !isShortViewport &&
          lottiePhase === "done" &&
          activeNudge && (
            <m.div
              key={activeNudge.id}
              className="agent-bubble agent-bubble-nudge"
              role="region"
              aria-label="Section assistant suggestion"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: reducedMotion ? 0.16 : 0.35, ease: EASE }}
            >
              <button
                type="button"
                className="agent-bubble-close"
                onClick={handleStopNudges}
                aria-label="Stop section nudges"
                title="Don't show section tips"
              >
                <X size={12} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="agent-nudge-trigger"
                onClick={() => openChatWithPrompt(activeNudge.prompt)}
              >
                {activeNudge.nudge}
              </button>
            </m.div>
          )}
      </AnimatePresence>

      {/* Waving girl character (greeting or one-time section alert), completely unmounted after leaving */}
      {isLottieMounted && (
        <m.button
          type="button"
          className="agent-avatar-btn"
          onClick={() => openChatWithPrompt(lottieSectionPrompt ?? undefined)}
          aria-label="Chat with Manikyam's agent"
          initial={
            reducedMotion
              ? { opacity: 0 }
              : isSectionLottie
                ? { opacity: 0, scale: 0.3, x: 18, y: 18 }
                : { opacity: 0, y: 120 }
          }
          animate={
            lottiePhase === "leaving"
              ? reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.3, x: 18, y: 18 }
              : { opacity: 1, scale: 1, x: 0, y: 0 }
          }
          transition={{
            duration:
              lottiePhase === "leaving"
                ? reducedMotion
                  ? 0.2
                  : 0.7
                : reducedMotion
                  ? 0.25
                  : isSectionLottie
                    ? 0.6
                    : 1.2,
            ease: EASE,
          }}
        >
          <AgentAvatar />
        </m.button>
      )}

      {/* Permanent 56px rotated-diamond Bot button */}
      {showBotButton && (
        <m.div
          className="agent-bot-wrap"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reducedMotion ? 0.16 : 0.45, ease: EASE }}
        >
          {!chatOpen && !reducedMotion && (
            <span className="agent-bot-pulse" aria-hidden="true" />
          )}
          <button
            ref={botBtnRef}
            type="button"
            className={`agent-bot-btn ${chatOpen ? "is-open" : ""}`}
            onMouseEnter={warmAgentRoute}
            onFocus={warmAgentRoute}
            onTouchStart={warmAgentRoute}
            onClick={() => {
              if (chatOpen) {
                handleCloseChat();
              } else {
                openChatWithPrompt();
              }
            }}
            aria-label="Chat with Manikyam's agent"
            aria-expanded={chatOpen}
          >
            <span className="agent-bot-icon" aria-hidden="true">
              {chatOpen ? (
                <X size={20} strokeWidth={1.75} />
              ) : (
                <Bot size={22} strokeWidth={1.6} />
              )}
            </span>
          </button>
          {!hasOpenedChat && !chatOpen && (
            <span className="agent-bot-badge" aria-hidden="true" />
          )}
        </m.div>
      )}
    </aside>
  );
}
