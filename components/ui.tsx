"use client";
import { useEffect, useRef, useState } from "react";
import { m, useReducedMotion } from "framer-motion";

export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <m.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={reduce ? { duration: 0 } : { duration: 1.2, delay, ease: [0.19, 1, 0.22, 1] }}
    >
      {children}
    </m.div>
  );
}

export function SectionHead({ tag, title, sub }: { tag: string; title: string; sub: string }) {
  return (
    <Reveal className="head">
      <span className="eyebrow">{tag}</span>
      <h2>{title}</h2>
      <p>{sub}</p>
    </Reveal>
  );
}

/* Drop your photo at public/profile.png or public/profile.jpg. Falls back to initials until then. */
const AVATAR_SRCS = ["/profile.png", "/profile.jpg"] as const;

export function Avatar({ size = 36 }: { size?: number }) {
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setLoaded(false);
    const el = ref.current;
    if (el && el.complete) {
      if (el.naturalWidth === 0) setIdx((i) => i + 1);
      else setLoaded(true);
    }
  }, [idx]);

  return idx < AVATAR_SRCS.length ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      key={AVATAR_SRCS[idx]}
      src={AVATAR_SRCS[idx]}
      alt=""
      width={size}
      height={size}
      className="avatar"
      style={{ opacity: loaded ? 1 : 0 }}
      onLoad={() => setLoaded(true)}
      onError={() => setIdx((i) => i + 1)}
    />
  ) : (
    <span className="avatar avatar-fb" style={{ width: size, height: size }} aria-hidden>MM</span>
  );
}
