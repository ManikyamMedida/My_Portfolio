"use client";

import { useEffect } from "react";

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    let rafId = 0;
    let cleanupLenis: (() => void) | null = null;

    const initLenis = async () => {
      if (cancelled) return;
      const { default: Lenis } = await import("lenis");
      if (cancelled) return;

      const lenis = new Lenis({ lerp: 0.09 });
      rafId = requestAnimationFrame(function raf(t) {
        if (cancelled) return;
        lenis.raf(t);
        rafId = requestAnimationFrame(raf);
      });

      const onClick = (e: MouseEvent) => {
        const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(
          'a[href^="#"]'
        );
        if (!a) return;
        const hash = a.getAttribute("href");
        if (!hash) return;
        const el =
          hash === "#top"
            ? document.body
            : document.querySelector<HTMLElement>(hash);
        if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { offset: hash === "#top" ? 0 : -76 });
      };

      document.addEventListener("click", onClick);
      cleanupLenis = () => {
        document.removeEventListener("click", onClick);
        cancelAnimationFrame(rafId);
        lenis.destroy();
      };
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
        idleId = w.requestIdleCallback(() => void initLenis(), {
          timeout: 1200,
        });
      } else {
        timeoutId = window.setTimeout(() => void initLenis(), 250);
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
      cleanupLenis?.();
    };
  }, []);

  return null;
}
