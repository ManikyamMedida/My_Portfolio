"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, m, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowDownCircle, ArrowRight, ArrowUpCircle, Check, Copy, Github, Linkedin, Mail } from "lucide-react";
import { certs, experience, profile, results } from "@/lib/data";
import ProjectsEditorial from "./ProjectsEditorial";
import { SkillsSection } from "./SkillsSection";
import { Avatar, Reveal, SectionHead } from "./ui";

function Count({ to, suffix }: { to: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, to, { duration: 1.6, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, reduce, to]);
  return <span ref={ref}>{n}{suffix}</span>;
}

export function Results() {
  return (
    <section className="sec-tight" aria-label="Verification results">
      <div className="wrap results">
        {results.map((r, i) => (
          <Reveal key={r.label} delay={i * 0.08}>
            <div className="big"><Count to={r.value} suffix={r.suffix} /></div>
            <p>{r.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Skills() {
  return (
    <section id="skills" className="sec">
      <div className="wrap">
        <SectionHead tag="Tech stack" title="SKILLS" sub="Languages, methodologies, protocols and EDA tools I use every week" />
        <SkillsSection />
      </div>
    </section>
  );
}

export function Work() {
  return <ProjectsEditorial />;
}

function ExperienceCard({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: (typeof experience)[number];
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const reduce = useReducedMotion();
  const [imgOk, setImgOk] = useState(true);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(rx, { stiffness: 120, damping: 18 });
  const rotateY = useSpring(ry, { stiffness: 120, damping: 18 });
  const panelId = `exp-panel-${index}`;

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry.set(px * 6);
    rx.set(-py * 6);
  };

  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <Reveal delay={index * 0.1}>
      <m.article
        className={`exp-card${isOpen ? " open" : ""}`}
        style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 1100 }}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
      >
        <div className="exp-media" aria-hidden="true">
          {imgOk && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt="" className="exp-img" onError={() => setImgOk(false)} />
          )}
          <div className="exp-scrim" />
        </div>

        <div className="exp-glass">
          <button
            type="button"
            className="exp-btn"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
          >
            <div className="exp-head">
              <h3>{item.role}</h3>
              <p className="exp-org">{item.org}</p>
              <time className="exp-date">{item.date}</time>
            </div>
            <span className="exp-ic" aria-hidden="true">
              {isOpen ? <ArrowUpCircle size={22} /> : <ArrowDownCircle size={22} />}
            </span>
          </button>

          <div id={panelId} className="exp-body">
            <ul className="exp-pts">
              <li>{item.points[0]}</li>
            </ul>
            <AnimatePresence initial={false}>
              {isOpen && item.points.length > 1 && (
                <m.div
                  className="exp-more"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                >
                  <ul className="exp-pts exp-pts-rest">
                    {item.points.slice(1).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </m.article>
    </Reveal>
  );
}

export function Experience() {
  const [open, setOpen] = useState(0);
  return (
    <section id="experience" className="sec">
      <div className="wrap exp-wrap">
        <SectionHead tag="Experience" title="Where I’ve Worked" sub="Internships across verification, RTL design and signal processing" />
        <div className="exp-list">
          {experience.map((e, i) => (
            <ExperienceCard
              key={e.role}
              item={e}
              index={i}
              isOpen={open === i}
              onToggle={() => setOpen(open === i ? -1 : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

const cards: [string, string, string][] = [
  ...certs.map(([y, t, o, n]) => [`${t}`, `${o} · ${y}`, n] as [string, string, string]),
  ["B.Tech, Electronics and Communication", "S R K R Engineering College · 2022 – 2026", "CGPA 9.19 / 10, Bhimavaram, Andhra Pradesh."],
  ["Bus protocols", "Verification focus", "APB, AXI and AHB handshaking, arbitration, wait states and error responses."],
  ["Scripting and OS", "Daily tooling", "Python, TCL scripting, C and Linux for regressions and automation."],
  ["How I work", "Soft skills", "Analytical debugging, cross-functional teamwork, initiative and clear communication."],
];

export function Recognition() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const x1 = useTransform(scrollYProgress, [0, 1], ["4%", "-24%"]);
  const x2 = useTransform(scrollYProgress, [0, 1], ["-24%", "4%"]);
  const Card = ([t, o, n]: [string, string, string]) => (
    <div className="xcard" key={t}><h3>{t}</h3><p className="org">{o}</p><p>{n}</p></div>
  );
  return (
    <section id="recognition" className="sec">
      <div className="wrap">
        <SectionHead tag="Certifications" title="Training and Education" sub="Scroll to move the rows across the screen in opposite directions" />
      </div>
      <div className="cross" ref={ref}>
        <m.div className="xrow" style={{ x: x1 }}>{cards.slice(0, 4).map(Card)}</m.div>
        <m.div className="xrow" style={{ x: x2 }}>{cards.slice(4).map(Card)}</m.div>
      </div>
    </section>
  );
}

export function Contact() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(profile.email); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  return (
    <>
      <section id="contact" className="wrap sec-tight">
        <Reveal className="cta">
          <div className="glow" aria-hidden />
          <h2>Let’s Verify Something Great</h2>
          <p>Looking for a design verification engineer? Let’s talk about your testbench.</p>
          <div className="actions center">
            <a className="btn" href={`mailto:${profile.email}`}>Contact Me <ArrowRight size={16} aria-hidden /></a>
            <button className="btn btn-ghost" onClick={copy}>{copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{copied ? "Email copied" : profile.email}</button>
            <a className="btn btn-ghost" href={profile.resume} target="_blank" rel="noreferrer">Download My CV</a>
          </div>
        </Reveal>
      </section>
      <footer className="wrap foot">
        <div className="foot-top">
          <div>
            <a href="#top" className="brand"><Avatar size={38} />{profile.name}</a>
            <p>I build verification environments that find bugs before silicon does.</p>
            <div className="socials">
              <a href={profile.github} target="_blank" rel="noreferrer" aria-label="GitHub"><Github size={17} /></a>
              <a href={profile.linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn"><Linkedin size={17} /></a>
              <a href={`mailto:${profile.email}`} aria-label="Email"><Mail size={17} /></a>
            </div>
          </div>
          <nav aria-label="Footer">
            <a href="#skills">Skills</a><a href="#work">Projects</a><a href="#experience">Experience</a><a href="#recognition">Certifications</a>
          </nav>
        </div>
        <p className="copy">© 2026 — Copyright. All Rights reserved</p>
      </footer>
    </>
  );
}
