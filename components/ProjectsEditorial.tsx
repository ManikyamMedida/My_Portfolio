"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AnimatePresence,
  m,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { projects } from "@/lib/data";
import {
  ApbUvmDiagram,
  AxiOcpDiagram,
  EthSwitchDiagram,
} from "./ProjectDiagrams";

const ProjectCaseStudySheet = dynamic(
  () => import("./ProjectCaseStudySheet"),
  { ssr: false }
);

const EASE = [0.19, 1, 0.22, 1] as const;
const CURSOR_SPRING = { stiffness: 320, damping: 28, mass: 0.45 } as const;

export default function ProjectsEditorial() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sectionInView = useInView(sectionRef, { amount: 0.08 });
  const reduce = useReducedMotion();

  const [isDesktop, setIsDesktop] = useState(true);
  const [hasFinePointer, setHasFinePointer] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [scrollActiveIdx, setScrollActiveIdx] = useState(0);
  const [accordionIdx, setAccordionIdx] = useState<number | null>(0);
  const [caseStudyIdx, setCaseStudyIdx] = useState<number | null>(null);
  const [hasOpenedSheet, setHasOpenedSheet] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(false);

  const rawCx = useMotionValue(-100);
  const rawCy = useMotionValue(-100);
  const cx = useSpring(rawCx, CURSOR_SPRING);
  const cy = useSpring(rawCy, CURSOR_SPRING);

  useEffect(() => {
    const deskMq = window.matchMedia("(min-width: 1100px)");
    const fineMq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => {
      setIsDesktop(deskMq.matches);
      setHasFinePointer(fineMq.matches);
    };
    sync();
    deskMq.addEventListener("change", sync);
    fineMq.addEventListener("change", sync);
    return () => {
      deskMq.removeEventListener("change", sync);
      fineMq.removeEventListener("change", sync);
    };
  }, []);

  // Track which project row is nearest viewport center when not hovering on desktop
  useEffect(() => {
    if (!isDesktop || !sectionInView) return;

    const updateNearest = () => {
      const midY = window.innerHeight * 0.5;
      let bestIdx = 0;
      let bestDist = Infinity;
      rowRefs.current.forEach((el, idx) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height * 0.5;
        const dist = Math.abs(center - midY);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      setScrollActiveIdx(bestIdx);
    };

    updateNearest();
    window.addEventListener("scroll", updateNearest, { passive: true });
    return () => window.removeEventListener("scroll", updateNearest);
  }, [isDesktop, sectionInView]);

  const activeIndex = isDesktop
    ? hoveredIdx ?? scrollActiveIdx
    : accordionIdx ?? -1;

  const openCaseStudy = useCallback((idx: number) => {
    setHasOpenedSheet(true);
    setCaseStudyIdx(idx);
  }, []);

  const closeCaseStudy = useCallback(() => {
    const returnIdx = caseStudyIdx;
    setCaseStudyIdx(null);
    if (returnIdx !== null) {
      window.requestAnimationFrame(() => {
        rowRefs.current[returnIdx]?.focus();
      });
    }
  }, [caseStudyIdx]);

  const handleRowPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDesktop || !hasFinePointer || reduce) return;
    rawCx.set(e.clientX - 32);
    rawCy.set(e.clientY - 32);
  };

  return (
    <section id="work" ref={sectionRef} className="ed-sec">
      <div className="wrap">
        <header className="ed-head">
          <div className="ed-head-left">
            <span className="ed-eyebrow">
              <span className="ed-eyebrow-rule" aria-hidden="true" />
              <span>PROJECTS</span>
            </span>
            <h2 className="ed-title">Verification Environments</h2>
          </div>
          <p className="ed-sub">
            Testbenches built from scratch and run to closure in QuestaSim.
          </p>
        </header>

        <div className="proj-ed-grid">
          <div
            className="proj-ed-list"
            onPointerMove={handleRowPointerMove}
            onPointerLeave={() => {
              setHoveredIdx(null);
              setCursorVisible(false);
            }}
          >
            {projects.map((p, i) => {
              const isActive = activeIndex === i;
              const num = `0${i + 1}`;
              return (
                <article
                  key={p.title}
                  className={`proj-ed-row ${isActive ? "is-active" : ""}`}
                  onPointerEnter={() => {
                    if (isDesktop) {
                      setHoveredIdx(i);
                      if (hasFinePointer && !reduce) setCursorVisible(true);
                    }
                  }}
                >
                  <button
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    type="button"
                    className="proj-ed-trigger"
                    aria-expanded={!isDesktop ? isActive : undefined}
                    onClick={() => {
                      if (isDesktop) {
                        openCaseStudy(i);
                      } else {
                        setAccordionIdx((prev) => (prev === i ? null : i));
                      }
                    }}
                  >
                    <span className="proj-ed-idx">{num}</span>
                    <m.h3
                      layoutId={`proj-title-${i}`}
                      className="proj-ed-name"
                    >
                      {p.title}
                    </m.h3>
                    <time className="proj-ed-date">{p.date}</time>
                  </button>

                  <div
                    className={`proj-ed-expand ${isActive ? "is-open" : ""}`}
                  >
                    <div className="proj-ed-expand-inner">
                      <p className="proj-ed-sum">{p.summary}</p>
                      <p className="proj-ed-stack">{p.stack.join(" · ")}</p>

                      {!isDesktop && isActive && (
                        <div className="proj-ed-mobile-diag">
                          {i === 0 && (
                            <AxiOcpDiagram
                              active={sectionInView && caseStudyIdx === null}
                            />
                          )}
                          {i === 1 && (
                            <ApbUvmDiagram
                              active={sectionInView && caseStudyIdx === null}
                            />
                          )}
                          {i === 2 && (
                            <EthSwitchDiagram
                              active={sectionInView && caseStudyIdx === null}
                            />
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        className="proj-case-link ed-underline-link"
                        onClick={() => openCaseStudy(i)}
                      >
                        <span>View case study</span>
                        <ArrowUpRight
                          size={14}
                          className="proj-case-arrow"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {isDesktop && (
            <div className="proj-ed-stage" aria-hidden="true">
              <div
                className={`proj-ed-slot ${activeIndex === 0 ? "is-active" : ""}`}
              >
                <AxiOcpDiagram
                  active={
                    sectionInView && activeIndex === 0 && caseStudyIdx === null
                  }
                />
              </div>
              <div
                className={`proj-ed-slot ${activeIndex === 1 ? "is-active" : ""}`}
              >
                <ApbUvmDiagram
                  active={
                    sectionInView && activeIndex === 1 && caseStudyIdx === null
                  }
                />
              </div>
              <div
                className={`proj-ed-slot ${activeIndex === 2 ? "is-active" : ""}`}
              >
                <EthSwitchDiagram
                  active={
                    sectionInView && activeIndex === 2 && caseStudyIdx === null
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom 64px "View" spring cursor on desktop hover */}
      {isDesktop && hasFinePointer && !reduce && (
        <m.div
          className="proj-cursor"
          style={{ x: cx, y: cy }}
          animate={{
            opacity: cursorVisible && caseStudyIdx === null ? 1 : 0,
            scale: cursorVisible && caseStudyIdx === null ? 1 : 0.7,
          }}
          transition={{ duration: 0.25, ease: EASE }}
          aria-hidden="true"
        >
          <span>View</span>
        </m.div>
      )}

      {/* Lazy-loaded Case Study Side Sheet */}
      <AnimatePresence>
        {hasOpenedSheet && caseStudyIdx !== null && (
          <ProjectCaseStudySheet
            projectIndex={caseStudyIdx}
            onClose={closeCaseStudy}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

