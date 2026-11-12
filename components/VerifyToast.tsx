"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";

const EASE = [0.19, 1, 0.22, 1] as const;
const DURATION_MS = 5000;

export interface VerifyToastProps {
  open: boolean;
  toastKey: number;
  reducedMotion: boolean;
  onDismiss: () => void;
}

export default function VerifyToast({
  open,
  toastKey,
  reducedMotion,
  onDismiss,
}: VerifyToastProps) {
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const lastRef = useRef(0);
  const barRef = useRef<HTMLSpanElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const setPauseState = (next: boolean) => {
    pausedRef.current = next;
    lastRef.current = performance.now();
    setPaused(next);
  };

  // Reset pause when a new toast instance opens
  useEffect(() => {
    if (open) {
      setPauseState(false);
    }
  }, [open, toastKey]);

  // Escape key dismissal without stealing focus
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismissRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Synchronized 5s countdown + hairline progress bar (pauses cleanly on hover/focus)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let elapsed = 0;
    lastRef.current = performance.now();
    let rafId = 0;

    if (barRef.current) {
      barRef.current.style.transform = "scaleX(1)";
    }

    const onVisibilityChange = () => {
      lastRef.current = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(1000, Math.max(0, now - lastRef.current));
      lastRef.current = now;

      if (!pausedRef.current && !document.hidden) {
        elapsed += dt;
        const remainRatio = Math.max(0, 1 - elapsed / DURATION_MS);
        if (barRef.current) {
          barRef.current.style.transform = `scaleX(${remainRatio})`;
        }
        if (elapsed >= DURATION_MS) {
          onDismissRef.current();
          return;
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [open, toastKey]);

  return (
    <div
      className="vtoast-region"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence mode="wait">
        {open && (
          <m.div
            key={toastKey}
            className={`vtoast${paused ? " is-paused" : ""}`}
            initial={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 18 }
            }
            animate={
              reducedMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0 }
            }
            exit={
              reducedMotion
                ? { opacity: 0, transition: { duration: 0.25 } }
                : {
                    opacity: 0,
                    y: -8,
                    transition: { duration: 0.6, ease: EASE },
                  }
            }
            transition={
              reducedMotion
                ? { duration: 0.25 }
                : { duration: 1.2, ease: EASE }
            }
            onMouseEnter={() => setPauseState(true)}
            onMouseLeave={() => setPauseState(false)}
          >
            <span className="vtoast-diamond" aria-hidden="true">
              <svg
                className="vtoast-check"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
              >
                <m.path
                  d="M2.5 7.4L5.6 10.4L11.5 3.6"
                  stroke="var(--amber)"
                  strokeWidth="1.35"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                  initial={reducedMotion ? false : { pathLength: 0, opacity: 0.4 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { duration: 0.7, delay: 0.18, ease: EASE }
                  }
                />
              </svg>
            </span>

            <div className="vtoast-body">
              <p className="vtoast-title">VERIFICATION COMPLETED</p>
              <p className="vtoast-msg">Welcome to Manikyam&apos;s portfolio.</p>
              <p className="vtoast-uvm">UVM_INFO · TEST PASSED</p>
            </div>

            <button
              type="button"
              className="vtoast-close"
              aria-label="Dismiss notification"
              onClick={onDismiss}
              onFocus={() => setPauseState(true)}
              onBlur={() => setPauseState(false)}
            >
              <X size={13} strokeWidth={1.5} />
            </button>

            <span className="vtoast-bar-track" aria-hidden="true">
              <span ref={barRef} className="vtoast-bar-fill" />
            </span>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

