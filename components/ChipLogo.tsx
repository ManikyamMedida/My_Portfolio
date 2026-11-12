"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { m } from "framer-motion";

const EASE = [0.19, 1, 0.22, 1] as const;
const MAX_PARTICLES = 18;
const CANVAS_SIZE = 120;

interface PinDef {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  nx: number;
  ny: number;
}

// 12 clockwise chip leads starting top-left; index 4 is the right-side center pin.
const PINS: readonly PinDef[] = [
  { x1: 10, y1: 7.5, x2: 10, y2: 3.2, nx: 10, ny: 2.3 },
  { x1: 14, y1: 7.5, x2: 14, y2: 3.2, nx: 14, ny: 2.3 },
  { x1: 18, y1: 7.5, x2: 18, y2: 3.2, nx: 18, ny: 2.3 },
  { x1: 20.5, y1: 10, x2: 24.8, y2: 10, nx: 25.7, ny: 10 },
  { x1: 20.5, y1: 14, x2: 24.8, y2: 14, nx: 25.7, ny: 14 },
  { x1: 20.5, y1: 18, x2: 24.8, y2: 18, nx: 25.7, ny: 18 },
  { x1: 18, y1: 20.5, x2: 18, y2: 24.8, nx: 18, ny: 25.7 },
  { x1: 14, y1: 20.5, x2: 14, y2: 24.8, nx: 14, ny: 25.7 },
  { x1: 10, y1: 20.5, x2: 10, y2: 24.8, nx: 10, ny: 25.7 },
  { x1: 7.5, y1: 18, x2: 3.2, y2: 18, nx: 2.3, ny: 18 },
  { x1: 7.5, y1: 14, x2: 3.2, y2: 14, nx: 2.3, ny: 14 },
  { x1: 7.5, y1: 10, x2: 3.2, y2: 10, nx: 2.3, ny: 10 },
];

interface BreatheSpec {
  duration: number;
  delay: number;
}

interface StarParticle {
  angle: number;
  dir: 1 | -1; // 1 = outward (70%), -1 = inward (30%)
  radius: number;
  startRadius: number;
  endRadius: number;
  speed: number;
  size: number;
  age: number;
  life: number;
  tone: "hot" | "amber" | "gold";
}

function createPrng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ChipLogoProps {
  runId: number;
  reducedMotion: boolean;
  onReplay: () => void;
  rightPinRef?: RefObject<SVGCircleElement>;
}

export default function ChipLogo({
  runId,
  reducedMotion,
  onReplay,
  rightPinRef,
}: ChipLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [breatheSpecs, setBreatheSpecs] = useState<BreatheSpec[] | null>(null);

  // Seeded node breathing timings generated strictly on client after mount / replay.
  useEffect(() => {
    if (reducedMotion) {
      setBreatheSpecs(null);
      return;
    }
    const rand = createPrng(104729 + runId * 7919);
    const specs: BreatheSpec[] = PINS.map((_, idx) => ({
      duration: 3.2 + rand() * 1.3,
      delay: 1.2 + idx * 0.06 + rand() * 0.4,
    }));
    setBreatheSpecs(specs);
  }, [runId, reducedMotion]);

  // Ambient / burst radial particle field inside clipped 120x120 canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (reducedMotion) {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      return;
    }

    let alive = true;
    let rafId = 0;
    const rand = createPrng(8191 + runId * 4999);
    const particles: StarParticle[] = [];
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    const startMs = performance.now();
    let lastMs = startMs;
    let spawnAcc = 0;

    const spawnParticle = () => {
      if (particles.length >= MAX_PARTICLES) return;
      const outward = rand() < 0.7;
      const angle = rand() * Math.PI * 2;
      const startRadius = outward ? 19 + rand() * 5 : 46 + rand() * 8;
      const endRadius = outward ? 46 + rand() * 10 : 14 + rand() * 5;
      const life = 1.15 + rand() * 0.85;
      const tonePick = rand();
      const tone: StarParticle["tone"] =
        tonePick < 0.22 ? "hot" : tonePick < 0.68 ? "amber" : "gold";

      particles.push({
        angle,
        dir: outward ? 1 : -1,
        radius: startRadius,
        startRadius,
        endRadius,
        speed: Math.abs(endRadius - startRadius) / life,
        size: 0.7 + rand() * 0.85,
        age: 0,
        life,
        tone,
      });
    };

    const drawParticle = (p: StarParticle) => {
      const u = p.age / p.life;
      const env = Math.sin(u * Math.PI);
      const edgeFade =
        p.radius > 48 ? Math.max(0, 1 - (p.radius - 48) / 10) : 1;
      const alpha = env * edgeFade * 0.82;
      if (alpha <= 0.01) return;

      const x = cx + Math.cos(p.angle) * p.radius;
      const y = cy + Math.sin(p.angle) * p.radius;

      const color =
        p.tone === "hot"
          ? `rgba(255, 243, 214, ${alpha})`
          : p.tone === "amber"
            ? `rgba(224, 146, 42, ${alpha})`
            : `rgba(232, 208, 163, ${alpha * 0.9})`;

      // Soft halo
      const haloR = p.size * 3.4;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, haloR);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(224, 146, 42, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Tiny crisp star cross + core
      ctx.fillStyle = `rgba(255, 243, 214, ${alpha * 0.95})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size * 0.65, 0, Math.PI * 2);
      ctx.fill();

      const arm = p.size * 2.2;
      ctx.strokeStyle = `rgba(255, 243, 214, ${alpha * 0.45})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x - arm, y);
      ctx.lineTo(x + arm, y);
      ctx.moveTo(x, y - arm);
      ctx.lineTo(x, y + arm);
      ctx.stroke();
    };

    const step = (now: number) => {
      if (!alive) return;
      if (document.hidden) {
        lastMs = now;
        rafId = requestAnimationFrame(step);
        return;
      }

      const dt = Math.min(0.05, Math.max(0, (now - lastMs) / 1000));
      lastMs = now;
      const elapsedMs = now - startMs;
      const spawnInterval = elapsedMs < 2000 ? 0.09 : 0.45;
      spawnAcc += dt;

      while (spawnAcc >= spawnInterval) {
        spawnAcc -= spawnInterval;
        spawnParticle();
      }

      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.globalCompositeOperation = "lighter";

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.life) {
          particles.splice(i, 1);
          continue;
        }
        p.radius += p.dir * p.speed * dt;
        drawParticle(p);
      }

      ctx.globalCompositeOperation = "source-over";
      rafId = requestAnimationFrame(step);
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        lastMs = performance.now();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    // Emit initial seed particle right at start of burst
    spawnParticle();
    rafId = requestAnimationFrame(step);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [runId, reducedMotion]);

  return (
    <span className="chip-stage">
      <canvas ref={canvasRef} className="chip-canvas" aria-hidden="true" />
      <button
        type="button"
        className="chip-btn"
        aria-label="Replay welcome sequence"
        onClick={onReplay}
      >
        <svg
          key={runId}
          className="chip-svg"
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          aria-hidden="true"
        >
          {/* Die package outline & inner core reticle */}
          <m.rect
            x="7.5"
            y="7.5"
            width="13"
            height="13"
            stroke="rgba(197, 160, 89, 0.85)"
            strokeWidth="0.95"
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0.35 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 0.75, delay: 0.1, ease: EASE }
            }
          />
          <m.rect
            x="10.75"
            y="10.75"
            width="6.5"
            height="6.5"
            stroke="rgba(224, 146, 42, 0.55)"
            strokeWidth="0.7"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 0.65, delay: 0.35, ease: EASE }
            }
          />
          <m.circle
            cx="14"
            cy="14"
            r="1.35"
            fill="var(--hot)"
            style={{ filter: "drop-shadow(0 0 3px rgba(224,146,42,0.85))" }}
            initial={reducedMotion ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 0.55, delay: 0.45, ease: EASE }
            }
          />

          {/* 12 clockwise pins + glowing r=1.1 tip nodes */}
          {PINS.map((pin, idx) => {
            const breathe = breatheSpecs?.[idx];
            return (
              <g key={idx}>
                <m.line
                  x1={pin.x1}
                  y1={pin.y1}
                  x2={pin.x2}
                  y2={pin.y2}
                  stroke="rgba(197, 160, 89, 0.88)"
                  strokeWidth="0.85"
                  strokeLinecap="square"
                  initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : {
                        duration: 0.48,
                        delay: idx * 0.06,
                        ease: EASE,
                      }
                  }
                />
                <m.circle
                  ref={idx === 4 ? rightPinRef : undefined}
                  cx={pin.nx}
                  cy={pin.ny}
                  r="1.1"
                  fill="var(--hot)"
                  style={{
                    filter: "drop-shadow(0 0 2.5px rgba(224, 146, 42, 0.9))",
                  }}
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.4 }}
                  animate={
                    reducedMotion
                      ? { opacity: 1, scale: 1 }
                      : breathe
                        ? {
                          opacity: [0.65, 1, 0.65],
                          scale: 1,
                        }
                        : { opacity: 1, scale: 1 }
                  }
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : breathe
                        ? {
                          opacity: {
                            duration: breathe.duration,
                            delay: breathe.delay,
                            repeat: Infinity,
                            ease: "easeInOut",
                          },
                          scale: {
                            duration: 0.35,
                            delay: idx * 0.06 + 0.12,
                            ease: EASE,
                          },
                        }
                        : {
                          duration: 0.35,
                          delay: idx * 0.06 + 0.12,
                          ease: EASE,
                        }
                  }
                />
              </g>
            );
          })}
        </svg>
      </button>
    </span>
  );
}
