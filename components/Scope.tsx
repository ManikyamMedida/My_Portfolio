"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  m,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";

/* Timing diagram of two APB transfers: a write with one wait state, then a read. */
const X0 = 116;
const W = 880;
const N = 12;
const CW = W / N;
const ROW = 46;
const TOP = 40;
const EASE = [0.19, 1, 0.22, 1] as const;

const lvl = (i: number, v: number) => TOP + i * ROW + (v ? 0 : 22);
const px = (c: number) => X0 + c * CW;

const DIGITAL_SIGNALS: { name: string; values: number[]; mobile: boolean }[] = [
  { name: "PSEL", values: [0, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0], mobile: true },
  { name: "PENABLE", values: [0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0], mobile: true },
  { name: "PWRITE", values: [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], mobile: false },
];

const BUS_SIGNALS: {
  name: string;
  segs: [number, number, string][];
  mobile: boolean;
}[] = [
  { name: "PADDR", segs: [[1, 4, "0x10"], [5, 7, "0x14"]], mobile: true },
  { name: "PWDATA", segs: [[1, 4, "0xA5"]], mobile: false },
];

const READY_VALUES = [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];

const clkPath = (() => {
  let d = `M ${X0} ${lvl(0, 0)}`;
  for (let c = 0; c < N; c++) {
    d += ` V ${lvl(0, 1)} H ${px(c) + CW / 2} V ${lvl(0, 0)} H ${px(c + 1)}`;
  }
  return d;
})();

const digPath = (row: number, v: number[]) => {
  let d = `M ${X0} ${lvl(row, v[0])}`;
  for (let c = 1; c < N; c++) {
    if (v[c] !== v[c - 1]) d += ` H ${px(c)} V ${lvl(row, v[c])}`;
  }
  return d + ` H ${X0 + W}`;
};

function phaseSentence(c: number): string {
  switch (c) {
    case 1:
      return "Setup: the master presents address 0x10 and data 0xA5.";
    case 2:
      return "Access: PREADY is low, so the slave inserts a wait state.";
    case 3:
      return "PREADY rises and the write completes.";
    case 5:
      return "A read follows at 0x14.";
    default:
      return "The transfer completes and the bus idles.";
  }
}

const REDUCED_PHASES = [
  "Cycle 1 — Setup: the master presents address 0x10 and data 0xA5.",
  "Cycle 2 — Access: PREADY is low, so the slave inserts a wait state.",
  "Cycle 3 — PREADY rises and the write completes.",
  "Cycle 5 — A read follows at 0x14.",
  "Cycle 6+ — The transfer completes and the bus idles.",
];

export default function Scope() {
  const outerRef = useRef<HTMLElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const inView = useInView(waveRef, { once: true, amount: 0.25 });

  const [isMobile, setIsMobile] = useState(false);
  const [cycle, setCycle] = useState(reduce ? 3 : 0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const { scrollYProgress } = useScroll({
    target: outerRef,
    offset: ["start start", "end end"],
  });

  const cursorX = useTransform(
    scrollYProgress,
    [0, 1],
    [X0 + CW * 0.5, X0 + W - CW * 0.5]
  );

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (reduce) return;
    const next = Math.max(0, Math.min(N - 1, Math.floor(latest * N)));
    setCycle(next);
  });

  const visibleDigitals = DIGITAL_SIGNALS.filter((s) => !isMobile || s.mobile);
  const visibleBuses = BUS_SIGNALS.filter((s) => !isMobile || s.mobile);

  const rowCount = 1 + visibleDigitals.length + visibleBuses.length + 1; // PCLK + digitals + buses + PREADY
  const readyRow = 1 + visibleDigitals.length + visibleBuses.length;
  const H = TOP + rowCount * ROW + 36;

  const isEdgeChanged = (values: number[], c: number) =>
    c > 0 ? values[c] !== values[c - 1] : values[0] === 1;

  const readyIsHigh = READY_VALUES[cycle] === 1;
  const displayCycle = reduce ? 3 : cycle;
  const staticCursorX = px(3) + CW * 0.5;

  const drawTrace = (i: number) => ({
    initial: { pathLength: reduce ? 1 : 0 },
    animate: { pathLength: inView || reduce ? 1 : 0 },
    transition: {
      duration: reduce ? 0 : 1.2,
      delay: reduce ? 0 : i * 0.08,
      ease: EASE,
    },
  });

  return (
    <section
      id="how"
      ref={outerRef}
      className={`verify-outer ${reduce ? "is-reduced" : ""}`}
    >
      <div className={`verify-sticky ${reduce ? "is-reduced" : ""}`}>
        <div className="wrap verify-wrap">
          <header className="ed-head">
            <div className="ed-head-left">
              <span className="ed-eyebrow">
                <span className="ed-eyebrow-rule" aria-hidden="true" />
                <span>HOW I VERIFY</span>
              </span>
              <h2 className="ed-title">Every transfer checked, cycle by cycle</h2>
            </div>
            <p className="ed-sub">
              An APB write with a wait state, then a read: the kind of scenario
              my scoreboards and assertions check.
            </p>
          </header>

          <div
            ref={waveRef}
            className={`verify-stage ${isMobile ? "is-mobile" : ""}`}
          >
            <div className="verify-copy">
              <span className="verify-cycle">cycle {displayCycle} / 11</span>
              <AnimatePresence mode="wait">
                <m.p
                  key={phaseSentence(displayCycle)}
                  className="verify-sentence"
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
                >
                  {phaseSentence(displayCycle)}
                </m.p>
              </AnimatePresence>

              {reduce && (
                <ul className="verify-reduced-list">
                  {REDUCED_PHASES.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>

            <figure
              className="verify-wave"
              aria-label="Scroll-driven APB timing diagram"
            >
              <svg
                viewBox={`0 0 ${X0 + W + 12} ${H}`}
                role="img"
                aria-hidden="true"
              >
                {/* Cycle numbers */}
                {Array.from({ length: N }, (_, c) => (
                  <text
                    key={c}
                    x={px(c) + CW / 2}
                    y={H - 8}
                    className={`vw-tick ${c === displayCycle ? "is-active" : ""}`}
                    textAnchor="middle"
                  >
                    {c}
                  </text>
                ))}

                {/* PCLK */}
                <text x={4} y={lvl(0, 0) - 2} className="vw-sig">
                  PCLK
                </text>
                <m.path d={clkPath} className="vw-tr vw-clk" {...drawTrace(0)} />

                {/* Digital signals */}
                {visibleDigitals.map((sig, idx) => {
                  const row = 1 + idx;
                  const active = isEdgeChanged(sig.values, displayCycle);
                  return (
                    <g key={sig.name}>
                      <text
                        x={4}
                        y={lvl(row, 0) - 2}
                        className={`vw-sig ${active ? "is-gold" : ""}`}
                      >
                        {sig.name}
                      </text>
                      <m.path
                        d={digPath(row, sig.values)}
                        className={`vw-tr vw-sig-line ${active ? "is-gold" : ""}`}
                        {...drawTrace(row)}
                      />
                    </g>
                  );
                })}

                {/* Hairline hexagon buses */}
                {visibleBuses.map((bus, bIdx) => {
                  const row = 1 + visibleDigitals.length + bIdx;
                  const mid = TOP + row * ROW + 11;
                  const busChanged = bus.segs.some(
                    ([start, end]) =>
                      displayCycle === start || displayCycle === end
                  );
                  return (
                    <g key={bus.name}>
                      <text
                        x={4}
                        y={mid + 4}
                        className={`vw-sig ${busChanged ? "is-gold" : ""}`}
                      >
                        {bus.name}
                      </text>
                      <m.line
                        x1={X0}
                        x2={X0 + W}
                        y1={mid}
                        y2={mid}
                        className="vw-tr vw-idle"
                        {...drawTrace(row)}
                      />
                      {bus.segs.map(([a, z, label]) => {
                        const segActive = displayCycle >= a && displayCycle < z;
                        return (
                          <g key={label}>
                            <path
                              d={`M ${px(a)} ${mid} L ${px(a) + 6} ${mid - 11} H ${px(z) - 6} L ${px(z)} ${mid} L ${px(z) - 6} ${mid + 11} H ${px(a) + 6} Z`}
                              className={`vw-bus ${segActive ? "is-gold" : ""}`}
                            />
                            <text
                              x={(px(a) + px(z)) / 2}
                              y={mid + 4}
                              className="vw-val"
                              textAnchor="middle"
                            >
                              {label}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* PREADY (gold when high) */}
                <text
                  x={4}
                  y={lvl(readyRow, 0) - 2}
                  className={`vw-sig ${readyIsHigh ? "is-gold" : ""}`}
                >
                  PREADY
                </text>
                <m.path
                  d={digPath(readyRow, READY_VALUES)}
                  className={`vw-tr vw-sig-line ${readyIsHigh ? "is-gold" : ""}`}
                  {...drawTrace(readyRow)}
                />

                {/* Current cycle cursor */}
                <m.line
                  x1={0}
                  x2={0}
                  y1={TOP - 16}
                  y2={H - 26}
                  className="vw-cursor"
                  style={{ x: reduce ? staticCursorX : cursorX }}
                />
              </svg>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
