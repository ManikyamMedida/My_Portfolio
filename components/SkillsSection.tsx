"use client";
import type { CSSProperties } from "react";
import { m, useReducedMotion } from "framer-motion";
import { skills } from "@/lib/data";
import { techFor, type TechnologySpec } from "./tools";

export function TechnologyLogo({
  spec,
  index,
}: {
  spec: TechnologySpec;
  index: number;
}) {
  const reduce = useReducedMotion();
  const { Logo, name, glow, desc } = spec;

  return (
    <m.div
      className="tech-cell"
      tabIndex={0}
      aria-label={`${name}: ${desc}`}
      style={{ "--tech-glow": glow } as CSSProperties}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={
        reduce
          ? { duration: 0 }
          : { delay: (index % 8) * 0.045, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
      }
      whileHover={reduce ? undefined : { y: -6, scale: 1.07 }}
    >
      <div className="tech-logo-wrap" aria-hidden="true">
        <Logo size={90} />
      </div>
      <span className="tech-label">{name}</span>
      <span className="tech-tip" role="tooltip">
        {desc}
      </span>
    </m.div>
  );
}

const GROUP_LABELS: Record<string, string> = {
  Verification: "Verification",
  Protocols: "Protocols",
  Design: "Design & RTL",
  Tools: "EDA & Tools",
  Scripting: "Scripting & OS",
  Semiconductors: "Semiconductors",
};

export function SkillsSection() {
  let running = 0;

  return (
    <div className="tech-groups">
      {skills.map(([group, items]) => {
        const heading = GROUP_LABELS[group] ?? group;
        return (
          <div className="tech-group" key={group} role="group" aria-label={heading}>
            <div className="tech-group-head">
              <span className="tech-group-name">{heading}</span>
              <span className="tech-group-rule" aria-hidden="true" />
            </div>
            <div className="tech-grid">
              {items.map((raw) => {
                const spec = techFor(raw);
                const idx = running++;
                return <TechnologyLogo key={raw} spec={spec} index={idx} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
