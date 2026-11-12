"use client";

import { useEffect, useState } from "react";
import { m, useReducedMotion } from "framer-motion";

const GOLD = "#c5a059";
const GOLD_SOFT = "#e8d0a3";
const STROKE_IDLE = "rgba(255, 255, 255, 0.28)";
const STROKE_WIRE = "rgba(255, 255, 255, 0.24)";
const FILL_BLOCK = "rgba(255, 255, 255, 0.02)";
const LABEL_COLOR = "rgba(255, 255, 255, 0.55)";
const EASE = [0.19, 1, 0.22, 1] as const;

export interface DiagramProps {
  active: boolean;
}

/* ──────────────────────────────────────────────────────────────────────────
   1) AXI-to-OCP Interconnect: AXI M0, AXI M1, ARBITER, OCP SLAVE
   4px packet dots along 1px paths; both request -> one wire turns gold,
   other waits, then swaps.
   ────────────────────────────────────────────────────────────────────────── */
const AXI_STEP_MS = 1100;
const AXI_STEPS = 6; // 0-2: M0 granted (M1 waits), 3-5: M1 granted (M0 waits)

export function AxiOcpDiagram({ active }: DiagramProps) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active || reduce) {
      setStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % AXI_STEPS);
    }, AXI_STEP_MS);
    return () => window.clearInterval(id);
  }, [active, reduce]);

  const m0Granted = step < 3;
  const m1Granted = step >= 3;
  const subStep = step % 3; // 0: request, 1: arbiter->ocp, 2: complete/swap

  const dot0 =
    subStep === 0
      ? { cx: 196, cy: 96 }
      : subStep === 1
        ? { cx: 344, cy: 150 }
        : { cx: 444, cy: 150 };

  const dot1 =
    subStep === 0
      ? { cx: 196, cy: 204 }
      : subStep === 1
        ? { cx: 344, cy: 150 }
        : { cx: 444, cy: 150 };

  const draw = {
    initial: { pathLength: reduce ? 1 : 0 },
    animate: { pathLength: 1 },
    transition: { duration: reduce ? 0 : 0.8, ease: EASE },
  };

  return (
    <svg
      className="diag-svg"
      viewBox="0 0 560 300"
      role="img"
      aria-label="AXI to OCP interconnect arbitration diagram"
    >
      {/* Blocks */}
      <rect
        x="36"
        y="70"
        width="112"
        height="52"
        rx="6"
        fill={FILL_BLOCK}
        stroke={m0Granted && active ? GOLD : STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="92" y="100" textAnchor="middle" className="diag-lbl">
        AXI M0
      </text>

      <rect
        x="36"
        y="178"
        width="112"
        height="52"
        rx="6"
        fill={FILL_BLOCK}
        stroke={m1Granted && active ? GOLD : STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="92" y="208" textAnchor="middle" className="diag-lbl">
        AXI M1
      </text>

      <rect
        x="224"
        y="112"
        width="116"
        height="76"
        rx="6"
        fill={FILL_BLOCK}
        stroke={active ? "rgba(197, 160, 89, 0.55)" : STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="282" y="154" textAnchor="middle" className="diag-lbl">
        ARBITER
      </text>

      <rect
        x="412"
        y="118"
        width="112"
        height="64"
        rx="6"
        fill={FILL_BLOCK}
        stroke={subStep >= 1 && active ? GOLD : STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="468" y="154" textAnchor="middle" className="diag-lbl">
        OCP SLAVE
      </text>

      {/* 1px Wires */}
      <m.path
        d="M 148 96 H 188 L 224 136"
        fill="none"
        stroke={m0Granted && active ? GOLD : STROKE_WIRE}
        strokeWidth="1"
        {...draw}
      />
      <m.path
        d="M 148 204 H 188 L 224 164"
        fill="none"
        stroke={m1Granted && active ? GOLD : STROKE_WIRE}
        strokeWidth="1"
        {...draw}
      />
      <m.path
        d="M 340 150 H 412"
        fill="none"
        stroke={subStep >= 1 && active ? GOLD : STROKE_WIRE}
        strokeWidth="1"
        {...draw}
      />

      {/* 4px Packet Dots */}
      {active && (
        <>
          <m.circle
            r="2.5"
            fill={m0Granted ? GOLD_SOFT : LABEL_COLOR}
            animate={
              m0Granted
                ? { cx: dot0.cx, cy: dot0.cy, opacity: 1 }
                : { cx: 174, cy: 96, opacity: 0.45 }
            }
            transition={{ duration: reduce ? 0 : 0.75, ease: EASE }}
          />
          <m.circle
            r="2.5"
            fill={m1Granted ? GOLD_SOFT : LABEL_COLOR}
            animate={
              m1Granted
                ? { cx: dot1.cx, cy: dot1.cy, opacity: 1 }
                : { cx: 174, cy: 204, opacity: 0.45 }
            }
            transition={{ duration: reduce ? 0 : 0.75, ease: EASE }}
          />
        </>
      )}
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   2) APB UVM Environment
   Outlined blocks + thin arrows; single gold transaction dot flows
   SEQUENCER -> DRIVER -> DUT -> MONITOR -> SCOREBOARD; quiet "60 / 60" counter.
   ────────────────────────────────────────────────────────────────────────── */
const APB_DOT_PATH = [
  { x: 102, y: 84 },  // SEQUENCER
  { x: 234, y: 84 },  // DRIVER
  { x: 366, y: 84 },  // DUT
  { x: 366, y: 196 }, // MONITOR
  { x: 234, y: 196 }, // SCOREBOARD
] as const;

export function ApbUvmDiagram({ active }: DiagramProps) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(60);

  useEffect(() => {
    if (!active || reduce) {
      setStep(2);
      setScore(60);
      return;
    }
    setScore(48);
    const stepTimer = window.setInterval(() => {
      setStep((s) => (s + 1) % APB_DOT_PATH.length);
      setScore((prev) => (prev >= 60 ? 52 : prev + 1));
    }, 1250);
    return () => window.clearInterval(stepTimer);
  }, [active, reduce]);

  const pos = APB_DOT_PATH[step];
  const draw = {
    initial: { pathLength: reduce ? 1 : 0 },
    animate: { pathLength: 1 },
    transition: { duration: reduce ? 0 : 0.8, ease: EASE },
  };

  return (
    <svg
      className="diag-svg"
      viewBox="0 0 560 300"
      role="img"
      aria-label="APB UVM verification environment diagram"
    >
      {/* Top row: SEQUENCER -> DRIVER -> DUT */}
      <rect
        x="46"
        y="58"
        width="112"
        height="52"
        rx="6"
        fill={FILL_BLOCK}
        stroke={step === 0 && active ? GOLD : STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="102" y="88" textAnchor="middle" className="diag-lbl">
        SEQUENCER
      </text>

      <rect
        x="178"
        y="58"
        width="112"
        height="52"
        rx="6"
        fill={FILL_BLOCK}
        stroke={step === 1 && active ? GOLD : STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="234" y="88" textAnchor="middle" className="diag-lbl">
        DRIVER
      </text>

      <rect
        x="310"
        y="58"
        width="112"
        height="52"
        rx="6"
        fill={FILL_BLOCK}
        stroke={step === 2 && active ? GOLD : STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="366" y="88" textAnchor="middle" className="diag-lbl">
        DUT
      </text>

      {/* Bottom row: COVERAGE <- MONITOR -> SCOREBOARD */}
      <rect
        x="46"
        y="170"
        width="112"
        height="52"
        rx="6"
        fill={FILL_BLOCK}
        stroke={STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="102" y="200" textAnchor="middle" className="diag-lbl">
        COVERAGE
      </text>

      <rect
        x="178"
        y="170"
        width="112"
        height="52"
        rx="6"
        fill={FILL_BLOCK}
        stroke={step === 4 && active ? GOLD : STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="234" y="200" textAnchor="middle" className="diag-lbl">
        SCOREBOARD
      </text>

      <rect
        x="310"
        y="170"
        width="112"
        height="52"
        rx="6"
        fill={FILL_BLOCK}
        stroke={step === 3 && active ? GOLD : STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="366" y="200" textAnchor="middle" className="diag-lbl">
        MONITOR
      </text>

      {/* Thin 1px connecting lines */}
      <m.path d="M 158 84 H 178" fill="none" stroke={STROKE_WIRE} strokeWidth="1" {...draw} />
      <m.path d="M 290 84 H 310" fill="none" stroke={STROKE_WIRE} strokeWidth="1" {...draw} />
      <m.path d="M 366 110 V 170" fill="none" stroke={STROKE_WIRE} strokeWidth="1" {...draw} />
      <m.path d="M 310 196 H 290" fill="none" stroke={STROKE_WIRE} strokeWidth="1" {...draw} />
      <m.path d="M 178 196 H 158" fill="none" stroke={STROKE_WIRE} strokeWidth="1" {...draw} />

      {/* Quiet Crimson Pro italic counter */}
      <text x="488" y="148" textAnchor="middle" className="diag-score">
        {score} / 60
      </text>

      {/* Single gold transaction dot */}
      {active && (
        <m.circle
          r="3"
          fill={GOLD_SOFT}
          animate={{ cx: pos.x, cy: pos.y }}
          transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
        />
      )}
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   3) 2×2 Ethernet Switch
   Two inputs, two outputs, crossing curves crossbar, short frame bars with
   start/end ticks; one contention pause then release.
   ────────────────────────────────────────────────────────────────────────── */
export function EthSwitchDiagram({ active }: DiagramProps) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active || reduce) {
      setStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % 4);
    }, 1600);
    return () => window.clearInterval(id);
  }, [active, reduce]);

  const draw = {
    initial: { pathLength: reduce ? 1 : 0 },
    animate: { pathLength: 1 },
    transition: { duration: reduce ? 0 : 0.8, ease: EASE },
  };

  // Frame A (IN 0 -> OUT 0) routes straight; Frame B (IN 1 -> OUT 0) waits at step 0-1, then crosses at step 2-3
  const frameAX = step === 0 ? 156 : step === 1 ? 268 : 372;
  const frameBX = step < 2 ? 148 : step === 2 ? 268 : 372;
  const frameBY = step < 2 ? 204 : step === 2 ? 150 : 96;

  return (
    <svg
      className="diag-svg"
      viewBox="0 0 560 300"
      role="img"
      aria-label="2 by 2 Ethernet switch crossbar diagram"
    >
      {/* Inputs */}
      <rect x="36" y="70" width="96" height="52" rx="6" fill={FILL_BLOCK} stroke={STROKE_IDLE} strokeWidth="1" />
      <text x="84" y="100" textAnchor="middle" className="diag-lbl">
        IN 0
      </text>

      <rect x="36" y="178" width="96" height="52" rx="6" fill={FILL_BLOCK} stroke={STROKE_IDLE} strokeWidth="1" />
      <text x="84" y="208" textAnchor="middle" className="diag-lbl">
        IN 1
      </text>

      {/* Outputs */}
      <rect
        x="428"
        y="70"
        width="96"
        height="52"
        rx="6"
        fill={FILL_BLOCK}
        stroke={active && (step === 1 || step === 3) ? GOLD : STROKE_IDLE}
        strokeWidth="1"
      />
      <text x="476" y="100" textAnchor="middle" className="diag-lbl">
        OUT 0
      </text>

      <rect x="428" y="178" width="96" height="52" rx="6" fill={FILL_BLOCK} stroke={STROKE_IDLE} strokeWidth="1" />
      <text x="476" y="208" textAnchor="middle" className="diag-lbl">
        OUT 1
      </text>

      {/* Straight lanes & crossing crossbar curves */}
      <m.path d="M 132 96 H 428" fill="none" stroke={step < 2 && active ? GOLD : STROKE_WIRE} strokeWidth="1" {...draw} />
      <m.path d="M 132 204 H 428" fill="none" stroke={STROKE_WIRE} strokeWidth="1" {...draw} />
      <m.path
        d="M 132 96 C 232 96, 328 204, 428 204"
        fill="none"
        stroke={STROKE_WIRE}
        strokeWidth="1"
        {...draw}
      />
      <m.path
        d="M 132 204 C 232 204, 328 96, 428 96"
        fill="none"
        stroke={step >= 2 && active ? GOLD : STROKE_WIRE}
        strokeWidth="1"
        {...draw}
      />

      {/* Short frame bars with start/end ticks */}
      {active && (
        <>
          <m.g animate={{ x: frameAX - 156 }} transition={{ duration: reduce ? 0 : 0.85, ease: EASE }}>
            <line x1="156" y1="90" x2="156" y2="102" stroke={GOLD_SOFT} strokeWidth="1.2" />
            <line x1="156" y1="96" x2="188" y2="96" stroke={GOLD_SOFT} strokeWidth="2" />
            <line x1="188" y1="90" x2="188" y2="102" stroke={GOLD_SOFT} strokeWidth="1.2" />
          </m.g>
          <m.g
            animate={{ x: frameBX - 148, y: frameBY - 204, opacity: step < 2 ? 0.55 : 1 }}
            transition={{ duration: reduce ? 0 : 0.85, ease: EASE }}
          >
            <line x1="148" y1="198" x2="148" y2="210" stroke={step < 2 ? LABEL_COLOR : GOLD_SOFT} strokeWidth="1.2" />
            <line x1="148" y1="204" x2="180" y2="204" stroke={step < 2 ? LABEL_COLOR : GOLD_SOFT} strokeWidth="2" />
            <line x1="180" y1="198" x2="180" y2="210" stroke={step < 2 ? LABEL_COLOR : GOLD_SOFT} strokeWidth="1.2" />
          </m.g>
        </>
      )}
    </svg>
  );
}

