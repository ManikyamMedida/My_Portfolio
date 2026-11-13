"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  m,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowUpRight, Play } from "lucide-react";
import { profile } from "@/lib/data";
import type { MotionOverride } from "./TubesBackground";

const TubesBackground = dynamic(() => import("./TubesBackground"), {
  ssr: false,
});

const EASE = [0.19, 1, 0.22, 1] as const;
const MOTION_STORAGE_KEY = "tubes-motion";
const PARALLAX_SPRING = { stiffness: 90, damping: 20, mass: 1 } as const;
const BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==";

export interface HeroProps {
  portraitSrc?: string | null;
}

export default function Hero({ portraitSrc = null }: HeroProps) {
  const heroRef = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotion();
  const [osReduced, setOsReduced] = useState(false);
  const [motionOverride, setMotionOverride] = useState<MotionOverride>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [hasFinePointer, setHasFinePointer] = useState(false);
  const [mountTubes, setMountTubes] = useState(false);
  const [tubesReady, setTubesReady] = useState(false);

  // Pointer parallax motion values + springs (disabled on touch devices & reduced motion)
  const rawPx = useMotionValue(0);
  const rawPy = useMotionValue(0);
  const rawRot = useMotionValue(0);
  const rawGx = useMotionValue(0);
  const rawGy = useMotionValue(0);

  const portraitX = useSpring(rawPx, PARALLAX_SPRING);
  const portraitY = useSpring(rawPy, PARALLAX_SPRING);
  const portraitRotate = useSpring(rawRot, PARALLAX_SPRING);
  const glowX = useSpring(rawGx, PARALLAX_SPRING);
  const glowY = useSpring(rawGy, PARALLAX_SPRING);

  // Scroll drift: portrait drifts up 40px over the hero's height
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const scrollDriftY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  // Mount Three.js TubesBackground after window load + requestIdleCallback
  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const triggerMount = () => {
      if (!cancelled) setMountTubes(true);
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

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MOTION_STORAGE_KEY);
      if (saved === "full" || saved === "calm") {
        setMotionOverride(saved);
      }
    } catch {
      // Ignore storage access errors in restricted contexts
    }

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactMql = window.matchMedia("(max-width: 1100px)");
    const fineMql = window.matchMedia("(hover: hover) and (pointer: fine)");

    const syncMotion = () => setOsReduced(mql.matches);
    const syncCompact = () => setIsCompact(compactMql.matches);
    const syncFine = () => setHasFinePointer(fineMql.matches);

    syncMotion();
    syncCompact();
    syncFine();

    mql.addEventListener("change", syncMotion);
    compactMql.addEventListener("change", syncCompact);
    fineMql.addEventListener("change", syncFine);
    return () => {
      mql.removeEventListener("change", syncMotion);
      compactMql.removeEventListener("change", syncCompact);
      fineMql.removeEventListener("change", syncFine);
    };
  }, []);

  useEffect(() => {
    if (reduce || !hasFinePointer) {
      rawPx.set(0);
      rawPy.set(0);
      rawRot.set(0);
      rawGx.set(0);
      rawGy.set(0);
      return;
    }

    const onPointerMove = (e: PointerEvent) => {
      if (
        e.pointerType &&
        e.pointerType !== "mouse" &&
        e.pointerType !== "pen"
      ) {
        return;
      }
      const w = Math.max(window.innerWidth, 1);
      const h = Math.max(window.innerHeight, 1);
      const nx = Math.max(-1, Math.min(1, (e.clientX / w) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, (e.clientY / h) * 2 - 1));

      rawPx.set(-nx * 10);
      rawPy.set(-ny * 10);
      rawRot.set(-nx * 0.4);
      rawGx.set(-nx * 18);
      rawGy.set(-ny * 18);
    };

    const onPointerLeave = () => {
      rawPx.set(0);
      rawPy.set(0);
      rawRot.set(0);
      rawGx.set(0);
      rawGy.set(0);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [reduce, hasFinePointer, rawPx, rawPy, rawRot, rawGx, rawGy]);

  const effectiveMode: "full" | "calm" =
    motionOverride ?? (osReduced ? "calm" : "full");

  const toggleMotionMode = () => {
    const next: "full" | "calm" = effectiveMode === "calm" ? "full" : "calm";
    setMotionOverride(next);
    try {
      window.localStorage.setItem(MOTION_STORAGE_KEY, next);
    } catch {
      // Ignore storage access errors
    }
  };

  const isJpg = Boolean(portraitSrc && portraitSrc.toLowerCase().endsWith(".jpg"));

  return (
    <section id="top" ref={heroRef} className="hero">
      <div className="tubes-placeholder" aria-hidden="true" />
      {mountTubes && (
        <div className={`tubes-fade ${tubesReady ? "is-ready" : ""}`}>
          <TubesBackground
            motionOverride={motionOverride}
            anchor={isCompact ? { x: 0.5, y: 0.5 } : { x: 0.34, y: 0.5 }}
            figureWidth={isCompact ? 0.7 : 0.36}
            onFirstFrame={() => setTubesReady(true)}
          />
        </div>
      )}

      <div className="hero-stage">
        {/* LEFT ZONE: HERO COPY & CTAs (LCP-safe: opacity 1 in SSR HTML, CSS-only transform entrance) */}
        <div className="hero-content hero-core">
          <p className="hero-eyebrow hero-lcp-rise">
            {profile.name} &nbsp;·&nbsp; Design Verification Engineer
          </p>

          <h1 className="hero-title hero-lcp-rise">
            <span className="hero-title-sans">Verification</span>
            <span className="hero-title-serif">Engineer.</span>
          </h1>

          <p className="hero-sub hero-lcp-rise">
            Building deterministic UVM and SystemVerilog testbenches for APB,
            AXI and Ethernet silicon — catching subtle protocol bugs before
            tape-out.
          </p>

          <div className="hero-cta hero-lcp-rise">
            <a className="btn" href="#work">
              SEE MY WORKS
            </a>
            <a
              className="hero-video-btn"
              href={profile.resume}
              target="_blank"
              rel="noreferrer"
            >
              <span className="hero-play-ring" aria-hidden="true">
                <Play size={12} fill="currentColor" />
              </span>
              <span>VIEW RESUME</span>
            </a>
          </div>
        </div>

        {/* RIGHT ZONE: PORTRAIT CUTOUT */}
        <div className="hero-portrait-zone">
          {/* Warm radial rim glow behind shoulders & head */}
          <m.div
            className="hero-portrait-glow-pos"
            style={reduce ? undefined : { x: glowX, y: glowY }}
            aria-hidden="true"
          >
            <m.span
              className="hero-portrait-glow"
              animate={reduce ? undefined : { opacity: [0.8, 1, 0.8] }}
              transition={
                reduce
                  ? undefined
                  : { duration: 6, repeat: Infinity, ease: "easeInOut" }
              }
            />
          </m.div>

          {/* Scroll drift container -> entrance -> pointer parallax */}
          <m.div
            className="hero-portrait-scroll"
            style={reduce ? undefined : { y: scrollDriftY }}
          >
            <div className="hero-portrait-enter hero-lcp-rise">
              <m.div
                className="hero-portrait-frame"
                style={
                  reduce
                    ? undefined
                    : { x: portraitX, y: portraitY, rotate: portraitRotate }
                }
              >
                {portraitSrc ? (
                  <div className="hero-portrait-organic-wrap">
                    <Image
                      src={portraitSrc}
                      alt={profile.name}
                      width={894}
                      height={1202}
                      priority
                      sizes="(min-width:1100px) 42vw, 80vw"
                      placeholder="blur"
                      blurDataURL={BLUR_DATA_URL}
                      className="hero-portrait-img"
                    />
                    <div className="hero-portrait-aura" aria-hidden="true" />
                    <div className="hero-portrait-edge-blend" aria-hidden="true" />
                  </div>
                ) : (
                  <svg
                    className="hero-portrait-img hero-portrait-silhouette"
                    viewBox="0 0 420 525"
                    width="420"
                    height="525"
                    fill="none"
                    role="img"
                    aria-label={`${profile.name} silhouette`}
                  >
                    <defs>
                      <linearGradient
                        id="heroSilBody"
                        x1="0.5"
                        y1="0"
                        x2="0.5"
                        y2="1"
                      >
                        <stop offset="0%" stopColor="#1c1813" />
                        <stop offset="45%" stopColor="#12100d" />
                        <stop offset="100%" stopColor="#080808" />
                      </linearGradient>
                      <linearGradient
                        id="heroSilRim"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0.6"
                      >
                        <stop offset="0%" stopColor="rgba(197,160,89,0.22)" />
                        <stop offset="45%" stopColor="rgba(232,208,163,0.08)" />
                        <stop
                          offset="100%"
                          stopColor="rgba(197,160,89,0.03)"
                        />
                      </linearGradient>
                    </defs>
                    <path
                      d="M44 525 C50 422 92 368 158 346 L176 318 L244 318 L262 346 C328 368 370 422 376 525 Z"
                      fill="url(#heroSilBody)"
                      stroke="url(#heroSilRim)"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M178 326 L178 278 C154 260 144 226 144 182 C144 126 172 90 210 90 C248 90 276 126 276 182 C276 226 266 260 242 278 L242 326 Z"
                      fill="url(#heroSilBody)"
                      stroke="url(#heroSilRim)"
                      strokeWidth="1.2"
                    />
                  </svg>
                )}

                <span className="hero-portrait-grain" aria-hidden="true" />
              </m.div>
            </div>
          </m.div>
        </div>
      </div>

      {/* TECHNICAL FOOTER */}
      <div className="hero-content hero-foot hero-lcp-rise">
        <div className="hero-status">
          <div className="hero-status-line">
            <span className="hero-rule-sm" aria-hidden="true" />
            <span className="hero-status-label">
              SENSORY ENGINE ACTIVE &nbsp;·&nbsp; OPEN TO WORK
            </span>
            <span className="hero-status-sep" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              className="hero-motion-toggle"
              aria-pressed={effectiveMode === "calm"}
              aria-label={`Motion mode: ${effectiveMode === "calm" ? "Calm" : "Full"}. Toggle between Full and Calm motion.`}
              onClick={toggleMotionMode}
            >
              <span>MOTION: </span>
              <span className={effectiveMode === "full" ? "is-active" : undefined}>
                FULL
              </span>
              <span> / </span>
              <span className={effectiveMode === "calm" ? "is-active" : undefined}>
                CALM
              </span>
            </button>
          </div>
          <p className="hero-status-hint">
            MOVE CURSOR TO STEER 3D FILAMENT &nbsp;·&nbsp; CLICK BACKGROUND TO
            SHIFT LIGHT INTENSITY
          </p>
        </div>

        <div className="hero-links">
          <a href="#work">
            <span>PROJECTS</span>
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <span className="hero-rule-lg" aria-hidden="true" />
          <a href={profile.github} target="_blank" rel="noreferrer">
            <span>GITHUB</span>
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <span className="hero-rule-lg" aria-hidden="true" />
          <a href={profile.linkedin} target="_blank" rel="noreferrer">
            <span>LINKEDIN</span>
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
