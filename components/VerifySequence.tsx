"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { m, useAnimate } from "framer-motion";

export const PERSIST_VERIFIED = true;

// Single speed multiplier: 0.5 halves speed (~14.4s total); 1.0 restores original ~7.2s pace.
const SPEED = 0.5;

const LAUNCH_DELAY_MS = (1.2 / SPEED) * 1000; // 2.4s at SPEED=0.5
const TRAVEL_S = 0.65 / SPEED; // 1.3s per gap
const DWELL_S = 0.45 / SPEED; // 0.9s per heading
const RING_DURATION_S = 0.8 / SPEED; // 1.6s ring pulse
export const NAV_SWEEP_DURATION_S = 0.55 / SPEED; // 1.1s sweep + underline draw
const TRACE_LINGER_S = 1.2 / SPEED; // 2.4s trace linger
const END_FLARE_S = 0.5 / SPEED; // 1.0s end flare
const TOAST_DELAY_MS = (0.4 / SPEED) * 1000; // 0.8s after end flare

const EASE_TRAVEL = [0.65, 0, 0.35, 1] as const;
const EASE_OUT = [0.19, 1, 0.22, 1] as const;
const LINK_COUNT = 5;

interface Point {
  x: number;
  y: number;
  leftX: number;
}

interface MeasuredCoords {
  pin: { x: number; y: number };
  waypoints: Point[];
}

interface RingBurst {
  idx: number;
  x: number;
  y: number;
}

export interface VerifySequenceProps {
  runId: number;
  reducedMotion: boolean;
  isMobile: boolean;
  headerRef: RefObject<HTMLElement>;
  rightPinRef: RefObject<SVGCircleElement>;
  linkRefs: RefObject<(HTMLAnchorElement | null)[]>;
  onLinkVerified: (index: number) => void;
  onComplete: () => void;
}

export default function VerifySequence({
  runId,
  reducedMotion,
  isMobile,
  headerRef,
  rightPinRef,
  linkRefs,
  onLinkVerified,
  onComplete,
}: VerifySequenceProps) {
  const [scope, animate] = useAnimate();
  const cometRef = useRef<HTMLSpanElement | null>(null);
  const traceRef = useRef<HTMLSpanElement | null>(null);
  const coordsRef = useRef<MeasuredCoords | null>(null);
  const [ringBursts, setRingBursts] = useState<RingBurst[]>([]);

  const measureCoords = useCallback((): MeasuredCoords | null => {
    const header = headerRef.current;
    const pinEl = rightPinRef.current;
    const links = linkRefs.current;
    if (!header || !pinEl || !links) return null;

    const hRect = header.getBoundingClientRect();
    const pRect = pinEl.getBoundingClientRect();
    const pin = {
      x: pRect.left + pRect.width / 2 - hRect.left,
      y: pRect.top + pRect.height / 2 - hRect.top,
    };

    const waypoints: Point[] = [];
    for (let i = 0; i < LINK_COUNT; i++) {
      const el = links[i];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      waypoints.push({
        x: r.left + r.width / 2 - hRect.left,
        y: r.top + r.height / 2 - hRect.top,
        leftX: r.left - hRect.left,
      });
    }

    const next = { pin, waypoints };
    coordsRef.current = next;
    return next;
  }, [headerRef, rightPinRef, linkRefs]);

  // Keep link & pin positions fresh across mount, fonts loaded, and ResizeObserver.
  useEffect(() => {
    let alive = true;
    measureCoords();

    const header = headerRef.current;
    const ro =
      typeof ResizeObserver !== "undefined" && header
        ? new ResizeObserver(() => {
            if (alive) measureCoords();
          })
        : null;
    if (ro && header) ro.observe(header);

    const onResize = () => {
      if (alive) measureCoords();
    };
    window.addEventListener("resize", onResize, { passive: true });

    const fontsReady = document.fonts?.ready;
    if (fontsReady) {
      fontsReady.then(() => {
        if (alive) measureCoords();
      });
    }

    return () => {
      alive = false;
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [measureCoords, headerRef, runId]);

  useEffect(() => {
    let alive = true;
    const timers = new Set<number>();
    const activeControls: Array<{ stop: () => void }> = [];

    const waitMs = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.add(id);
      });

    setRingBursts([]);

    if (reducedMotion) {
      for (let i = 0; i < LINK_COUNT; i++) {
        onLinkVerified(i);
      }
      onComplete();
      return () => {
        alive = false;
      };
    }

    if (isMobile) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!alive) return;
        onComplete();
      }, 1800);
      timers.add(id);
      return () => {
        alive = false;
        timers.forEach((t) => window.clearTimeout(t));
      };
    }

    const runSequence = async () => {
      const comet = cometRef.current;
      const trace = traceRef.current;
      if (comet) {
        comet.style.opacity = "0";
      }
      if (trace) {
        trace.style.opacity = "0";
        trace.style.transform = "translateY(-0.5px) scaleX(0)";
      }

      await waitMs(LAUNCH_DELAY_MS);
      if (!alive) return;

      let coords = measureCoords() ?? coordsRef.current;
      if (!coords) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (!alive) return;
        coords = measureCoords() ?? coordsRef.current;
      }
      if (!coords || !cometRef.current || !traceRef.current) {
        onComplete();
        return;
      }

      const startPin = coords.pin;
      const waypoints = coords.waypoints;
      const cometEl = cometRef.current;
      const traceEl = traceRef.current;
      const maxSpan = Math.max(1, waypoints[waypoints.length - 1].x - startPin.x);
      const lineY = waypoints[0]?.y ?? startPin.y;

      // Snap comet & trace directly to right-side center chip pin using transforms only
      traceEl.style.left = `${startPin.x}px`;
      traceEl.style.top = `${lineY}px`;
      traceEl.style.width = `${maxSpan}px`;
      traceEl.style.transformOrigin = "0 50%";

      const snapComet = animate(
        cometEl,
        { x: startPin.x, y: lineY, scale: 1, opacity: 0 },
        { duration: 0 }
      );
      const snapTrace = animate(
        traceEl,
        { scaleX: 0, opacity: 0 },
        { duration: 0 }
      );
      await Promise.all([snapComet, snapTrace]);
      if (!alive) return;

      const initComet = animate(
        cometEl,
        { opacity: 1 },
        { duration: 0.16, ease: EASE_OUT }
      );
      const initTrace = animate(
        traceEl,
        { opacity: 0.85 },
        { duration: 0.16, ease: EASE_OUT }
      );
      activeControls.push(initComet, initTrace);
      await Promise.all([initComet, initTrace]);
      if (!alive) return;

      // Single continuous timeline across all 5 headings (TRAVEL_S + DWELL_S per stop)
      const totalDurationS = LINK_COUNT * (TRAVEL_S + DWELL_S);
      const xKeyframes: number[] = [startPin.x];
      const scaleKeyframes: number[] = [0];
      const times: number[] = [0];
      const easings: Array<typeof EASE_TRAVEL | "linear"> = [];

      let elapsedS = 0;
      for (let i = 0; i < LINK_COUNT; i++) {
        const wpX = waypoints[i].x;
        const scaleVal = Math.max(0, Math.min(1, (wpX - startPin.x) / maxSpan));

        elapsedS += TRAVEL_S;
        xKeyframes.push(wpX);
        scaleKeyframes.push(scaleVal);
        times.push(elapsedS / totalDurationS);
        easings.push(EASE_TRAVEL);

        elapsedS += DWELL_S;
        xKeyframes.push(wpX);
        scaleKeyframes.push(scaleVal);
        times.push(Math.min(1, elapsedS / totalDurationS));
        easings.push("linear");
      }

      const swept = new Array<boolean>(LINK_COUNT).fill(false);
      const rung = new Array<boolean>(LINK_COUNT).fill(false);

      const moveComet = animate(
        cometEl,
        { x: xKeyframes },
        {
          duration: totalDurationS,
          times,
          ease: easings,
          onUpdate: (latestX) => {
            if (!alive || typeof latestX !== "number") return;
            for (let i = 0; i < LINK_COUNT; i++) {
              if (!swept[i] && latestX >= waypoints[i].leftX) {
                swept[i] = true;
                onLinkVerified(i);
              }
              if (!rung[i] && latestX >= waypoints[i].x - 1.5) {
                rung[i] = true;
                setRingBursts((prev) => [
                  ...prev,
                  { idx: i, x: waypoints[i].x, y: waypoints[i].y },
                ]);
              }
            }
          },
        }
      );

      const growTrace = animate(
        traceEl,
        { scaleX: scaleKeyframes },
        {
          duration: totalDurationS,
          times,
          ease: easings,
        }
      );

      activeControls.push(moveComet, growTrace);
      await Promise.all([moveComet, growTrace]);
      if (!alive) return;

      // Ensure final link is marked verified even if sub-pixel rounding occurred
      for (let i = 0; i < LINK_COUNT; i++) {
        if (!swept[i]) {
          swept[i] = true;
          onLinkVerified(i);
        }
      }

      // End flare after CONTACT; hairline trace lingers smoothly behind
      const flareComet = animate(
        cometEl,
        { scale: 1.9, opacity: 0 },
        { duration: END_FLARE_S, ease: EASE_OUT }
      );
      const fadeTrace = animate(
        traceEl,
        { opacity: 0 },
        { duration: TRACE_LINGER_S, ease: EASE_OUT }
      );
      activeControls.push(flareComet, fadeTrace);
      await flareComet;
      if (!alive) return;

      await waitMs(TOAST_DELAY_MS);
      if (!alive) return;
      onComplete();
    };

    runSequence();

    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
      activeControls.forEach((c) => c.stop());
    };
  }, [
    runId,
    reducedMotion,
    isMobile,
    measureCoords,
    animate,
    onLinkVerified,
    onComplete,
  ]);

  if (reducedMotion || isMobile) {
    return null;
  }

  return (
    <div ref={scope} className="vseq-layer" aria-hidden="true">
      <span ref={traceRef} className="vseq-trace" />
      <span ref={cometRef} className="vseq-comet">
        <span className="vseq-trail" />
        <span className="vseq-node" />
      </span>
      {ringBursts.map((ring) => (
        <m.span
          key={`${runId}-${ring.idx}`}
          className="vseq-ring"
          style={{ left: ring.x, top: ring.y }}
          initial={{ width: 6, height: 6, opacity: 0.65 }}
          animate={{ width: 30, height: 30, opacity: 0 }}
          transition={{ duration: RING_DURATION_S, ease: EASE_OUT }}
        />
      ))}
    </div>
  );
}
