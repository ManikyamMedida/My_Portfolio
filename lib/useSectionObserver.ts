"use client";

import { useEffect } from "react";

export interface SectionObserverOptions {
  ids: readonly string[];
  threshold?: number | number[];
  rootMargin?: string;
  onIntersect: (entry: IntersectionObserverEntry) => void;
  enabled?: boolean;
}

/**
 * Shared IntersectionObserver hook for section visibility tracking.
 */
export function useSectionObserver({
  ids,
  threshold = 0,
  rootMargin = "0px",
  onIntersect,
  enabled = true,
}: SectionObserverOptions) {
  useEffect(() => {
    if (!enabled || ids.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onIntersect(entry);
          }
        }
      },
      { threshold, rootMargin }
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }

    return () => io.disconnect();
  }, [ids, threshold, rootMargin, onIntersect, enabled]);
}

