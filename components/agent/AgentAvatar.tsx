"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";

interface AgentAvatarProps {
  onLoaded?: () => void;
  className?: string;
}

type LottieLightPlayer = typeof import("lottie-web/build/player/lottie_light").default;

let cachedPrefetch: Promise<{
  lottie: LottieLightPlayer;
  animationData: Record<string, unknown>;
} | null> | null = null;

export function prefetchAgentLottie() {
  if (cachedPrefetch) return cachedPrefetch;
  cachedPrefetch = Promise.all([
    import("lottie-web/build/player/lottie_light").then((mod) => mod.default),
    fetch("/agent/wave.json").then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<Record<string, unknown>>;
    }),
  ])
    .then(([lottie, animationData]) => ({ lottie, animationData }))
    .catch(() => {
      cachedPrefetch = null;
      return null;
    });
  return cachedPrefetch;
}

function StaticAvatarPoster() {
  return (
    <svg
      className="agent-avatar-svg"
      viewBox="0 0 120 120"
      width="104"
      height="104"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="60"
        cy="60"
        r="54"
        fill="rgba(16, 15, 13, 0.94)"
        stroke="rgba(197, 160, 89, 0.4)"
        strokeWidth="1.4"
      />
      <path
        d="M35 50C35 33 46 23 60 23C74 23 85 33 85 50V66C85 70 81 73 77 73H43C39 73 35 70 35 66V50Z"
        fill="#241b15"
      />
      <circle cx="60" cy="49" r="16" fill="#e8c3a3" />
      <path
        d="M44 46C46 34 55 29 66 31C72 32 76 37 76 46C70 42 54 41 44 46Z"
        fill="#241b15"
      />
      <circle cx="54.5" cy="49.5" r="1.8" fill="#18120e" />
      <circle cx="65.5" cy="49.5" r="1.8" fill="#18120e" />
      <path
        d="M55.5 56C57.5 58.2 62.5 58.2 64.5 56"
        stroke="#9b5c49"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M36 99C38 82 47 75 60 75C73 75 82 82 84 99Z"
        fill="#c5a059"
        fillOpacity="0.88"
      />
      <path
        d="M84 79C89 72 93 66 95 59"
        stroke="#e8c3a3"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AgentAvatar({ onLoaded, className = "" }: AgentAvatarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const container = containerRef.current;
    if (!container) return;

    prefetchAgentLottie().then((payload) => {
      if (!alive || !payload || !containerRef.current) return;

      const anim = payload.lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: payload.animationData,
        rendererSettings: {
          progressiveLoad: true,
          preserveAspectRatio: "xMidYMid meet",
        },
      });
      animRef.current = anim;

      let completedLoops = 0;
      const handleDomLoaded = () => {
        if (!alive) return;
        setReady(true);
        onLoaded?.();
      };

      const handleLoopComplete = () => {
        completedLoops += 1;
        if (completedLoops >= 2) {
          anim.pause();
        }
      };

      anim.addEventListener("DOMLoaded", handleDomLoaded);
      anim.addEventListener("loopComplete", handleLoopComplete);
    });

    return () => {
      alive = false;
      const anim = animRef.current;
      animRef.current = null;
      if (anim) {
        try {
          anim.destroy();
        } catch {
          // Ignore teardown errors
        }
      }
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [onLoaded]);

  return (
    <div className={`agent-avatar-frame ${className}`} aria-hidden="true">
      {!ready && (
        <div className="agent-avatar-poster">
          <StaticAvatarPoster />
        </div>
      )}
      <div
        ref={containerRef}
        className={`agent-avatar-lottie ${ready ? "is-ready" : ""}`}
      />
    </div>
  );
}
