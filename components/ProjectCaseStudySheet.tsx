"use client";

import { useEffect, useRef } from "react";
import { m } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import { projects } from "@/lib/data";
import {
  ApbUvmDiagram,
  AxiOcpDiagram,
  EthSwitchDiagram,
} from "./ProjectDiagrams";

const EASE = [0.19, 1, 0.22, 1] as const;

const CASE_STUDY_METRICS: Record<number, { label: string; value: string }[]> = {
  0: [
    { label: "Topology", value: "2 AXI Masters · 1 OCP Slave" },
    { label: "Methodology", value: "UVM + TLM Scoreboard" },
  ],
  1: [
    { label: "Scoreboard", value: "60 / 60 passes · 0 UVM errors" },
    { label: "Functional Coverage", value: "100% model closure" },
  ],
  2: [
    { label: "Architecture", value: "2×2 OOP Switch + SVA" },
    { label: "Checking", value: "SOP/EOP + Mailbox Regression" },
  ],
};

interface ProjectCaseStudySheetProps {
  projectIndex: number;
  onClose: () => void;
}

export default function ProjectCaseStudySheet({
  projectIndex,
  onClose,
}: ProjectCaseStudySheetProps) {
  const project = projects[projectIndex];
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Scroll lock, focus-on-open, Escape, and Tab focus trap
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !sheetRef.current) return;

      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (!project) return null;

  const metrics = CASE_STUDY_METRICS[projectIndex] ?? [];

  return (
    <div className="cs-overlay" role="presentation">
      <m.div
        className="cs-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        onClick={onClose}
      />

      <m.aside
        ref={sheetRef}
        className="cs-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`cs-title-${projectIndex}`}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <div className="cs-head">
          <span className="cs-index">
            CASE STUDY · 0{projectIndex + 1} · {project.date}
          </span>
          <button
            ref={closeBtnRef}
            type="button"
            className="cs-close"
            onClick={onClose}
            aria-label="Close case study"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="cs-body">
          <m.h3
            id={`cs-title-${projectIndex}`}
            layoutId={`proj-title-${projectIndex}`}
            className="cs-title"
          >
            {project.title}
          </m.h3>

          <p className="cs-summary">{project.summary}</p>

          <div className="cs-diagram">
            {projectIndex === 0 && <AxiOcpDiagram active />}
            {projectIndex === 1 && <ApbUvmDiagram active />}
            {projectIndex === 2 && <EthSwitchDiagram active />}
          </div>

          {metrics.length > 0 && (
            <div className="cs-metrics">
              {metrics.map((item) => (
                <div key={item.label} className="cs-metric">
                  <span className="cs-metric-lbl">{item.label}</span>
                  <span className="cs-metric-val">{item.value}</span>
                </div>
              ))}
            </div>
          )}

          <ul className="cs-points">
            {project.points.map((pt) => (
              <li key={pt}>{pt}</li>
            ))}
          </ul>

          <p className="cs-stack">{project.stack.join(" · ")}</p>

          <button type="button" className="cs-back" onClick={onClose}>
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Back to projects</span>
          </button>
        </div>
      </m.aside>
    </div>
  );
}

