"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { m, useScroll, useSpring } from "framer-motion";
import { profile } from "@/lib/data";
import { useSectionObserver } from "@/lib/useSectionObserver";
import ChipLogo from "@/components/ChipLogo";
import VerifyToast from "@/components/VerifyToast";

const VerifySequence = dynamic(() => import("@/components/VerifySequence"), {
  ssr: false,
});

const NAV_SWEEP_DURATION_S = 1.1;
const PERSIST_VERIFIED = true;

const links = [
  ["skills", "Skills"],
  ["work", "Projects"],
  ["experience", "Experience"],
  ["recognition", "Certifications"],
] as const;

const LINK_IDS = links.map(([id]) => id);
const TOTAL_LINKS = links.length + 1; // 4 center links + CONTACT
const INITIAL_VERIFIED: boolean[] = Array(TOTAL_LINKS).fill(false);

export default function Nav() {
  const [active, setActive] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mountSequence, setMountSequence] = useState(false);
  const [runId, setRunId] = useState(1);
  const [verified, setVerified] = useState<boolean[]>(INITIAL_VERIFIED);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastKey, setToastKey] = useState(0);

  const headerRef = useRef<HTMLElement | null>(null);
  const rightPinRef = useRef<SVGCircleElement | null>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 24,
    restDelta: 0.001,
  });

  // Live prefers-reduced-motion and <900px viewport listeners (SSR-safe inside useEffect).
  useEffect(() => {
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileMq = window.matchMedia("(max-width: 899px)");

    const syncMotion = () => setReducedMotion(motionMq.matches);
    const syncMobile = () => setIsMobile(mobileMq.matches);

    syncMotion();
    syncMobile();

    motionMq.addEventListener("change", syncMotion);
    mobileMq.addEventListener("change", syncMobile);
    return () => {
      motionMq.removeEventListener("change", syncMotion);
      mobileMq.removeEventListener("change", syncMobile);
    };
  }, []);

  // Initialize VerifySequence particle overlay on idle after window load
  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const triggerMount = () => {
      if (!cancelled) setMountSequence(true);
    };

    const scheduleIdle = () => {
      if (cancelled) return;
      const w = window as Window & {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number }
        ) => number;
      };
      if (typeof w.requestIdleCallback === "function") {
        idleId = w.requestIdleCallback(triggerMount, { timeout: 1200 });
      } else {
        timeoutId = window.setTimeout(triggerMount, 200);
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
  }, []);

  const handleNavIntersect = useCallback((entry: IntersectionObserverEntry) => {
    setActive(entry.target.id);
  }, []);

  // Shared IntersectionObserver hook for active-section scrollspy
  useSectionObserver({
    ids: LINK_IDS,
    rootMargin: "-45% 0px -50% 0px",
    onIntersect: handleNavIntersect,
  });

  const handleLinkVerified = useCallback((idx: number) => {
    setVerified((prev) => {
      if (prev[idx]) return prev;
      const next = [...prev];
      next[idx] = true;
      return next;
    });
  }, []);

  const handleSequenceComplete = useCallback(() => {
    if (!PERSIST_VERIFIED) {
      setVerified(INITIAL_VERIFIED);
    }
    setToastKey((k) => k + 1);
    setToastOpen(true);
  }, []);

  const handleReplay = useCallback(() => {
    setToastOpen(false);
    setMountSequence(true);
    if (!reducedMotion) {
      setVerified(INITIAL_VERIFIED);
    }
    setRunId((id) => id + 1);
  }, [reducedMotion]);

  const handleDismissToast = useCallback(() => {
    setToastOpen(false);
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className="nav"
        style={{ "--vseq-sweep": `${NAV_SWEEP_DURATION_S}s` } as CSSProperties}
      >
        {mountSequence && (
          <VerifySequence
            runId={runId}
            reducedMotion={reducedMotion}
            isMobile={isMobile}
            headerRef={headerRef}
            rightPinRef={rightPinRef}
            linkRefs={linkRefs}
            onLinkVerified={handleLinkVerified}
            onComplete={handleSequenceComplete}
          />
        )}

        <div className="nav-in">
          <div className="brand">
            <ChipLogo
              runId={runId}
              reducedMotion={reducedMotion}
              onReplay={handleReplay}
              rightPinRef={rightPinRef}
            />
            <a href="#top" className="brand-name" aria-label={profile.name}>
              {profile.name}
            </a>
          </div>

          <nav className="nav-center" aria-label="Sections">
            {links.map(([id, label], idx) => {
              const isVerified = verified[idx];
              const isActive = active === id;
              return (
                <a
                  key={id}
                  ref={(el) => {
                    linkRefs.current[idx] = el;
                  }}
                  href={`#${id}`}
                  className={[
                    "nav-link",
                    isActive ? "on" : "",
                    isVerified ? "is-verified" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span className="nav-lbl">{label}</span>
                  <span className="nav-link-line" aria-hidden="true" />
                </a>
              );
            })}
          </nav>

          <a
            ref={(el) => {
              linkRefs.current[links.length] = el;
            }}
            className={[
              "nav-contact",
              "nav-link",
              verified[links.length] ? "is-verified" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            href="#contact"
          >
            <span className="nav-lbl">CONTACT</span>
            <span className="nav-link-line" aria-hidden="true" />
          </a>
        </div>
        <m.div className="progress" style={{ scaleX }} />
      </header>

      <VerifyToast
        open={toastOpen}
        toastKey={toastKey}
        reducedMotion={reducedMotion}
        onDismiss={handleDismissToast}
      />
    </>
  );
}
