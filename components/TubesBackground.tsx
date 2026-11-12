"use client";

import { useEffect, useRef, useState } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  HalfFloatType,
  MathUtils,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type MotionOverride = "full" | "calm" | null;

export interface TubesAnchor {
  x: number;
  y: number;
}

export interface TubesBackgroundProps {
  palette?: "gold" | "green";
  motionOverride?: MotionOverride;
  anchor?: TubesAnchor;
  figureWidth?: number;
  onFirstFrame?: () => void;
}

interface DebugSnapshot {
  prefersReducedMotion: boolean;
  motionOverride: string;
  running: boolean;
  t: number;
  headDistance: number;
  idleMix: number;
  yaw: number;
  pitch: number;
  fps: number;
}

interface PaletteSpec {
  swatches: string[];
  accentWhite: string;
}

const PALETTE_SPECS: Record<"gold" | "green", { primary: PaletteSpec; alternate: PaletteSpec }> = {
  gold: {
    primary: {
      // Dark gold, metallic gold, soft gold, amber-orange, warm near-white
      swatches: ["#b8860b", "#c5a059", "#e8d0a3", "#d98c1a", "#c5a059", "#fff3d6"],
      accentWhite: "#fff3d6",
    },
    alternate: {
      swatches: ["#8a8a8a", "#c0c0c0", "#f0f0f0", "#a6a6a6", "#d8d8d8", "#ffffff"],
      accentWhite: "#ffffff",
    },
  },
  green: {
    primary: {
      swatches: ["#16a34a", "#22c55e", "#4ade80", "#15803d", "#22c55e", "#bbf7d0"],
      accentWhite: "#bbf7d0",
    },
    alternate: {
      swatches: ["#9ca3af", "#d1d5db", "#f3f4f6", "#b0b7c3", "#e5e7eb", "#ffffff"],
      accentWhite: "#ffffff",
    },
  },
};

const MAX_CHAIN_POINTS = 320;
const PERF_CHAIN_POINTS = 240;
const COMET_POINTS = 96;
const PATH_SAMPLES = 512;
const ARC_LUT_SIZE = 512;
const IDLE_AFTER_SEC = 1.8;
const CLICK_EASE_SEC = 1.2;
const LEMNISCATE_PERIOD = 6.0;
const STAGGER_PER_POINT_SEC = 0.012;
const MORPH_RAMP_SEC = 0.42;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic Mulberry32 PRNG so per-strand variation is reproducible client-side.
 */
function createPrng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Evaluates cubic-bezier(0.19, 1, 0.22, 1) ease-out.
 */
function cubicBezierExpoOut(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  if (t <= 0 || t >= 1) return t;
  const p1x = 0.19;
  const p2x = 0.22;
  const sampleX = (u: number) => {
    const inv = 1 - u;
    return 3 * inv * inv * u * p1x + 3 * inv * u * u * p2x + u * u * u;
  };
  const sampleDX = (u: number) => {
    const inv = 1 - u;
    return 3 * inv * inv * p1x + 6 * inv * u * (p2x - p1x) + 3 * u * u;
  };
  const sampleY = (u: number) => {
    const inv = 1 - u;
    return 3 * inv * inv * u + 3 * inv * u * u + u * u * u;
  };
  let u = t;
  for (let i = 0; i < 5; i++) {
    const err = sampleX(u) - t;
    if (Math.abs(err) < 1e-4) break;
    const dx = sampleDX(u);
    if (Math.abs(dx) < 1e-5) break;
    u -= err / dx;
  }
  u = Math.max(0, Math.min(1, u));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 8; i++) {
    const sx = sampleX(u);
    if (Math.abs(sx - t) < 1e-4) break;
    if (sx < t) lo = u;
    else hi = u;
    u = 0.5 * (lo + hi);
  }
  return sampleY(u);
}

const RIBBON_VERT = /* glsl */ `
  attribute vec3 aPrev;
  attribute vec3 aNext;
  attribute float aSide;
  attribute float aU;
  attribute float aPointMix;
  attribute vec4 aStrandMeta; // x=id, y=brightness, z=tailLength, w=widthCssPx
  attribute vec3 aStrandColor;

  uniform vec2 uResolutionPx;
  uniform float uDpr;
  uniform float uWidthScale;
  uniform float uIdleDepthRange;

  varying float vDistPx;
  varying float vCoreHalfPx;
  varying float vOuterHalfPx;
  varying float vU;
  varying float vPointMix;
  varying float vDepthShade;
  varying float vStrandId;
  varying float vBrightness;
  varying float vTailLen;
  varying vec3 vColor;

  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vec4 mvPrev = modelViewMatrix * vec4(aPrev, 1.0);
    vec4 mvNext = modelViewMatrix * vec4(aNext, 1.0);

    vec4 clipPos = projectionMatrix * mvPos;
    vec4 clipPrev = projectionMatrix * mvPrev;
    vec4 clipNext = projectionMatrix * mvNext;

    vec2 ndcPos = clipPos.xy / max(abs(clipPos.w), 1e-4);
    vec2 ndcPrev = clipPrev.xy / max(abs(clipPrev.w), 1e-4);
    vec2 ndcNext = clipNext.xy / max(abs(clipNext.w), 1e-4);

    // View-space tangent projected onto screen pixels for crisp screen-space ribbon normal
    vec2 tangentPx = (ndcNext - ndcPrev) * 0.5 * uResolutionPx;
    float tanLen = length(tangentPx);
    vec2 dirPx = tanLen > 1e-3 ? tangentPx / tanLen : vec2(1.0, 0.0);
    vec2 normalPx = vec2(-dirPx.y, dirPx.x);

    // Active: taper from ~1.4px at head to ~0.6px at tail.
    // Idle: perspective-scaled hairline width (clamped 0.5 to 1.6 px) so far wires are thinner.
    float perspScale = 5.0 / max(0.5, -mvPos.z);
    float activeCss = mix(1.4, 0.6, aU) * (aStrandMeta.w / 1.4) * uWidthScale;
    float idleBaseCss = mix(0.65, 1.08, clamp((aStrandMeta.w - 1.0) / 0.6, 0.0, 1.0));
    float idleCss = clamp(idleBaseCss * perspScale, 0.5, 1.6);
    float widthCss = mix(activeCss, idleCss, aPointMix);

    float coreHalfPx = 0.5 * widthCss * uDpr;
    float aaMarginPx = mix(0.75, 0.52, aPointMix) * uDpr;
    float outerHalfPx = coreHalfPx + aaMarginPx;

    vec2 offsetNdc = normalPx * (aSide * outerHalfPx) * (2.0 / uResolutionPx);
    clipPos.xy += offsetNdc * clipPos.w;

    // View-space depth shading for idle loop (nearer lobe brighter, far lobe dimmer)
    float nearness = clamp((mvPos.z + 5.0) / max(0.25, uIdleDepthRange), -1.0, 1.0);
    vDepthShade = mix(1.0, 0.55 + 0.45 * smoothstep(-1.0, 1.0, nearness), aPointMix);

    gl_Position = clipPos;
    vDistPx = aSide * outerHalfPx;
    vCoreHalfPx = coreHalfPx;
    vOuterHalfPx = outerHalfPx;
    vU = aU;
    vPointMix = aPointMix;
    vStrandId = aStrandMeta.x;
    vBrightness = aStrandMeta.y;
    vTailLen = aStrandMeta.z;
    vColor = aStrandColor;
  }
`;

const RIBBON_FRAG = /* glsl */ `
  uniform float uDpr;
  uniform float uTime;
  uniform float uIntensityScale;
  uniform float uTrailFrac;

  varying float vDistPx;
  varying float vCoreHalfPx;
  varying float vOuterHalfPx;
  varying float vU;
  varying float vPointMix;
  varying float vDepthShade;
  varying float vStrandId;
  varying float vBrightness;
  varying float vTailLen;
  varying vec3 vColor;

  void main() {
    float dist = abs(vDistPx);
    float edgeAlpha = 1.0 - smoothstep(max(0.0, vCoreHalfPx - 0.35 * uDpr), vOuterHalfPx, dist);
    if (edgeAlpha <= 0.002) discard;

    // Active comet: normalize position along per-strand frayed tail length (0.7x to 1.15x)
    float tailCutoff = clamp(vTailLen / 1.15, 0.55, 1.0);
    float uNorm = clamp(vU / tailCutoff, 0.0, 1.0);
    float activeAlongAlpha = 1.0 - smoothstep(0.08, 1.0, uNorm);

    // Idle infinity: traveling bright head around full closed loop (never drops below 55%)
    float dFrac = vU * max(0.4, uTrailFrac);
    float headFalloff = 0.55 + 0.45 * exp(-dFrac / 0.35);
    float closedSeam = smoothstep(0.95, 1.0, uTrailFrac) * smoothstep(0.985, 1.0, vU);
    float idleAlongAlpha = mix(headFalloff, 1.0, closedSeam) * vDepthShade;

    float alongAlpha = mix(activeAlongAlpha, idleAlongAlpha, vPointMix);
    if (alongAlpha <= 0.002) discard;

    // Traveling sparkle glint along individual filaments
    float glint = pow(0.5 + 0.5 * sin(vU * 180.0 + vStrandId * 13.7 + uTime * 2.0), 6.0) * 0.9 + 0.6;

    // Prevent 36 additive overlapping strands from blowing out at the active cursor head
    float headOverlapDamp = mix(mix(0.24, 1.0, smoothstep(0.0, 0.14, vU)), 1.0, vPointMix);

    float alpha = edgeAlpha * alongAlpha * vBrightness * uIntensityScale * headOverlapDamp;
    vec3 col = vColor * glint;

    gl_FragColor = vec4(col, alpha);
  }
`;

const WIDE_BLUR_SHADER = {
  uniforms: {
    tDiffuse: { value: null as Texture | null },
    tGlow: { value: null as Texture | null },
    uOpacity: { value: 0.25 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tGlow;
    uniform float uOpacity;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec4 glow = texture2D(tGlow, vUv) * uOpacity;
      vec3 rgb = base.rgb + glow.rgb;
      float alpha = clamp(max(base.a, max(glow.r, max(glow.g, glow.b))), 0.0, 1.0);
      gl_FragColor = vec4(rgb, alpha);
    }
  `,
};

const SEPARABLE_BLUR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SEPARABLE_BLUR_FRAG = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uDirectionPx;
  uniform vec2 uTexSize;
  varying vec2 vUv;

  void main() {
    // 9-tap wide Gaussian spanning ~24px radius across half-res target
    vec2 stepUv = uDirectionPx / uTexSize;
    vec4 sum = texture2D(tInput, vUv) * 0.163;
    sum += texture2D(tInput, vUv + stepUv * 3.0) * 0.151;
    sum += texture2D(tInput, vUv - stepUv * 3.0) * 0.151;
    sum += texture2D(tInput, vUv + stepUv * 6.5) * 0.122;
    sum += texture2D(tInput, vUv - stepUv * 6.5) * 0.122;
    sum += texture2D(tInput, vUv + stepUv * 10.5) * 0.088;
    sum += texture2D(tInput, vUv - stepUv * 10.5) * 0.088;
    sum += texture2D(tInput, vUv + stepUv * 15.0) * 0.0575;
    sum += texture2D(tInput, vUv - stepUv * 15.0) * 0.0575;
    gl_FragColor = sum;
  }
`;

interface StrandSpec {
  id: number;
  baseFrac: number;
  baseJitter: number;
  braidPhase: number;
  latRadius: number;
  helixAngle: number;
  helixSpeed: number;
  lagScale: number;
  idleArcOffsetNorm: number;
  zOffset: number;
  brightness: number;
  tailLength: number;
  widthCssPx: number;
  swatchIndex: number;
  color: Color;
  targetColor: Color;
}

export default function TubesBackground({
  palette = "gold",
  motionOverride = null,
  anchor = { x: 0.5, y: 0.5 },
  figureWidth = 0.44,
  onFirstFrame,
}: TubesBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionOverrideRef = useRef<MotionOverride>(motionOverride);
  motionOverrideRef.current = motionOverride;
  const anchorRef = useRef<TubesAnchor>(anchor);
  anchorRef.current = anchor;
  const figureWidthRef = useRef<number>(figureWidth);
  figureWidthRef.current = figureWidth;
  const onFirstFrameRef = useRef<(() => void) | undefined>(onFirstFrame);
  onFirstFrameRef.current = onFirstFrame;
  const rebuildLayoutRef = useRef<(() => void) | null>(null);

  const [debugHud, setDebugHud] = useState<DebugSnapshot | null>(null);

  useEffect(() => {
    rebuildLayoutRef.current?.();
  }, [anchor.x, anchor.y, figureWidth]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    // Effect-scoped lifetime flag so React Strict Mode double-mount always starts fresh cleanly
    let alive = true;

    const showDebug =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1";

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReduced = mql.matches;
    const onMotionPrefChange = (e: MediaQueryListEvent) => {
      prefersReduced = e.matches;
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onMotionPrefChange);
    } else {
      mql.addListener(onMotionPrefChange);
    }

    const isCalmActive = () =>
      (motionOverrideRef.current ?? (prefersReduced ? "calm" : "full")) === "calm";

    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
    const devMem =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
        : undefined;
    const isMobile = window.innerWidth < 768;
    const isLowEnd =
      isMobile || cores <= 4 || (typeof devMem === "number" && devMem <= 4);
    const maxStrands = isLowEnd ? 20 : 36;
    let activeStrandCount = maxStrands;
    let activeChainPoints = isLowEnd ? 200 : MAX_CHAIN_POINTS;
    let dpr = isLowEnd ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    const width = Math.max(window.innerWidth, 1);
    const height = Math.max(window.innerHeight, 1);

    const scene = new Scene();
    // 45deg PerspectiveCamera makes near tilted lobe naturally larger & far lobe smaller
    const camera = new PerspectiveCamera(45, width / height, 0.1, 50);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false, // shader handles subpixel AA along hairline edges
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);

    // Post-processing: wide soft UnrealBloomPass (0.7, 0.95, 0.05) + half-res 24px haze glow pass
    const renderTarget = new WebGLRenderTarget(
      Math.max(1, Math.round(width * dpr)),
      Math.max(1, Math.round(height * dpr)),
      { type: HalfFloatType, format: RGBAFormat }
    );
    const composer = new EffectComposer(renderer, renderTarget);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);

    const renderPass = new RenderPass(scene, camera, undefined, new Color(0x000000), 0);
    const bloomPass = new UnrealBloomPass(
      new Vector2(
        isLowEnd ? Math.max(1, Math.floor(width * 0.5)) : width,
        isLowEnd ? Math.max(1, Math.floor(height * 0.5)) : height
      ),
      isLowEnd ? 0.55 : 0.7,
      0.95,
      0.05
    );
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    // Half-resolution 24px blur haze targets & quad
    const halfW = Math.max(1, Math.floor(width * 0.5));
    const halfH = Math.max(1, Math.floor(height * 0.5));
    const glowRtA = new WebGLRenderTarget(halfW, halfH, {
      type: HalfFloatType,
      format: RGBAFormat,
    });
    const glowRtB = new WebGLRenderTarget(halfW, halfH, {
      type: HalfFloatType,
      format: RGBAFormat,
    });
    const blurScene = new Scene();
    const blurCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const blurMat = new ShaderMaterial({
      uniforms: {
        tInput: { value: null as Texture | null },
        uDirectionPx: { value: new Vector2(1, 0) },
        uTexSize: { value: new Vector2(halfW, halfH) },
      },
      vertexShader: SEPARABLE_BLUR_VERT,
      fragmentShader: SEPARABLE_BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const blurQuad = new Mesh(new PlaneGeometry(2, 2), blurMat);
    blurScene.add(blurQuad);

    const wideGlowPass = new ShaderPass(WIDE_BLUR_SHADER);
    wideGlowPass.uniforms.tGlow.value = glowRtA.texture;
    wideGlowPass.uniforms.uOpacity.value = isLowEnd ? 0.18 : 0.25;
    composer.addPass(wideGlowPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    const getVisibleBounds = () => {
      const visH = 2 * camera.position.z * Math.tan(MathUtils.degToRad(camera.fov * 0.5));
      const visW = visH * camera.aspect;
      return { visW, visH };
    };
    let bounds = getVisibleBounds();

    // Local 3D Bernoulli lemniscate lookup table:
    // P(u) = (F * cos(u)/(1 + sin^2 u), 1.3 * F * sin(u)*cos(u)/(1 + sin^2 u), Dz * sin(u))
    // Flat width = 2*F = 44% of viewport width; height ~ 46% of width; Dz = 0.35 * F.
    const lemU = new Float32Array(PATH_SAMPLES + 1);
    const lemX = new Float32Array(PATH_SAMPLES + 1);
    const lemY = new Float32Array(PATH_SAMPLES + 1);
    const lemZ = new Float32Array(PATH_SAMPLES + 1);
    const lemArc = new Float32Array(PATH_SAMPLES + 1);

    // Uniform-arc O(1) lookup tables for ultra-fast per-frame evaluation across all 36x320 points
    const lutX = new Float32Array(ARC_LUT_SIZE + 1);
    const lutY = new Float32Array(ARC_LUT_SIZE + 1);
    const lutZ = new Float32Array(ARC_LUT_SIZE + 1);
    const lutNx = new Float32Array(ARC_LUT_SIZE + 1);
    const lutNy = new Float32Array(ARC_LUT_SIZE + 1);
    const lutW = new Float32Array(ARC_LUT_SIZE + 1);
    const lutSin2U = new Float32Array(ARC_LUT_SIZE + 1);
    const lutCos2U = new Float32Array(ARC_LUT_SIZE + 1);

    let figF = 1;
    let figDz = 0.35;
    let figCx = 0;
    let figCy = 0;
    let figScale = 1;
    let lemTotalLen = 1;

    const evalLocalLemniscate = (
      u: number,
      out: { x: number; y: number; z: number; nx: number; ny: number; w: number }
    ) => {
      const s = Math.sin(u);
      const c = Math.cos(u);
      const s2 = s * s;
      const denom = 1 + s2;

      out.x = (figF * c) / denom;
      out.y = (1.3 * figF * s * c) / denom;
      out.z = figDz * s;

      // Exact analytic 2D tangent in the local XY plane -> continuous in-plane normal N = (-T.y, T.x)
      const invDen2 = 1 / (denom * denom);
      const tx = -figF * s * (3 - s2) * invDen2;
      const ty = 1.3 * figF * (1 - 3 * s2) * invDen2;
      const tLen = Math.hypot(tx, ty);
      if (tLen > 1e-6) {
        out.nx = -ty / tLen;
        out.ny = tx / tLen;
      } else {
        out.nx = -1;
        out.ny = 0;
      }

      const wMin = 0.004 * figF * 2;
      const wMax = 0.065 * figF * 2;
      const neck = smoothstep(0, 1, Math.pow(Math.abs(c), 0.85));
      out.w = wMin + (wMax - wMin) * neck;
    };

    const sampleArcToU = (arcDist: number): number => {
      const sWrapped = ((arcDist % lemTotalLen) + lemTotalLen) % lemTotalLen;
      let lo = 0;
      let hi = PATH_SAMPLES;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (lemArc[mid] <= sWrapped) lo = mid;
        else hi = mid;
      }
      const span = Math.max(1e-6, lemArc[lo + 1] - lemArc[lo]);
      const f = (sWrapped - lemArc[lo]) / span;
      return lemU[lo] + (lemU[lo + 1] - lemU[lo]) * f;
    };

    const buildLemniscateTable = () => {
      const a = anchorRef.current;
      const fw = figureWidthRef.current;
      const cxNdc = 2 * a.x - 1;
      const cyNdc = 1 - 2 * a.y;
      figCx = cxNdc * (bounds.visW * 0.5);
      figCy = cyNdc * (bounds.visH * 0.5);
      figF = bounds.visW * (fw * 0.5);
      figDz = 0.35 * figF;

      lemArc[0] = 0;
      const tmp = { x: 0, y: 0, z: 0, nx: 0, ny: 0, w: 0 };
      for (let k = 0; k <= PATH_SAMPLES; k++) {
        const u = (k / PATH_SAMPLES) * Math.PI * 2;
        evalLocalLemniscate(u, tmp);
        lemU[k] = u;
        lemX[k] = tmp.x;
        lemY[k] = tmp.y;
        lemZ[k] = tmp.z;
        if (k > 0) {
          lemArc[k] =
            lemArc[k - 1] +
            Math.hypot(tmp.x - lemX[k - 1], tmp.y - lemY[k - 1], tmp.z - lemZ[k - 1]);
        }
      }
      lemTotalLen = Math.max(1e-4, lemArc[PATH_SAMPLES]);

      // Build uniform-arc LUT so per-frame ribbon updates require zero binary searches or pow calls
      for (let k = 0; k <= ARC_LUT_SIZE; k++) {
        const s = (k / ARC_LUT_SIZE) * lemTotalLen;
        const u = sampleArcToU(s);
        evalLocalLemniscate(u, tmp);
        lutX[k] = tmp.x;
        lutY[k] = tmp.y;
        lutZ[k] = tmp.z;
        lutNx[k] = tmp.nx;
        lutNy[k] = tmp.ny;
        lutW[k] = tmp.w;
        lutSin2U[k] = Math.sin(2 * u);
        lutCos2U[k] = Math.cos(2 * u);
      }
    };
    buildLemniscateTable();

    const evalYawPitch = (t: number, yawAmp = 0.62, pitchAmp = 0.28) => ({
      yaw: yawAmp * Math.sin((2 * Math.PI * t) / 17),
      pitch: pitchAmp * Math.sin((2 * Math.PI * t) / 23 + 1.3),
    });

    const rotateRyRx = (
      lx: number,
      ly: number,
      lz: number,
      cosY: number,
      sinY: number,
      cosP: number,
      sinP: number,
      cyShift: number,
      out: { x: number; y: number; z: number },
      scale = figScale
    ) => {
      const y1 = ly * cosP - lz * sinP;
      const z1 = ly * sinP + lz * cosP;
      out.x = (lx * cosY + z1 * sinY) * scale + figCx;
      out.y = y1 * scale + cyShift;
      out.z = (-lx * sinY + z1 * cosY) * scale;
    };

    const computeTargetClampScale = (
      cosY: number,
      sinY: number,
      cosP: number,
      sinP: number
    ): number => {
      const ax = anchorRef.current.x;
      const rightLimit = ax < 0.45 ? 0.56 : 0.97;
      const leftLimit = 0.03;
      const camZ = camera.position.z;
      const halfVisW = Math.max(1e-4, bounds.visW * 0.5);
      const bundlePad = 0.065 * figF;
      let minScreenX = 1;
      let maxScreenX = 0;

      const step = Math.max(1, PATH_SAMPLES >> 6);
      for (let k = 0; k < PATH_SAMPLES; k += step) {
        const lx = lemX[k];
        const ly = lemY[k];
        const lz = lemZ[k];
        const z1 = ly * sinP + lz * cosP;
        const rx = lx * cosY + z1 * sinY;
        const rz = -lx * sinY + z1 * cosY;
        const persp = camZ / Math.max(0.5, camZ - rz);
        const projLeft = (figCx + rx - bundlePad) * persp;
        const projRight = (figCx + rx + bundlePad) * persp;
        const sxMin = 0.5 + projLeft / (2 * halfVisW);
        const sxMax = 0.5 + projRight / (2 * halfVisW);
        if (sxMin < minScreenX) minScreenX = sxMin;
        if (sxMax > maxScreenX) maxScreenX = sxMax;
      }

      let target = 1;
      if (maxScreenX > rightLimit) {
        const spanR = Math.max(1e-4, maxScreenX - ax);
        target = Math.min(target, (rightLimit - ax) / spanR);
      }
      if (minScreenX < leftLimit) {
        const spanL = Math.max(1e-4, ax - minScreenX);
        target = Math.min(target, (ax - leftLimit) / spanL);
      }
      return Math.max(0.45, Math.min(1, target));
    };

    const findNearestArcDist = (
      px: number,
      py: number,
      pz: number,
      yaw: number,
      pitch: number
    ): number => {
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const wp = { x: 0, y: 0, z: 0 };
      let bestK = 0;
      let bestD2 = Infinity;
      for (let k = 0; k < PATH_SAMPLES; k++) {
        rotateRyRx(lemX[k], lemY[k], lemZ[k], cosY, sinY, cosP, sinP, figCy, wp);
        const dx = wp.x - px;
        const dy = wp.y - py;
        const dz = wp.z - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestK = k;
        }
      }
      return lemArc[bestK];
    };

    // Seeded per-strand randomness
    const rand = createPrng(0x9e3779b9);
    const paletteSet = PALETTE_SPECS[palette];
    let activeVariant: 0 | 1 = 0;

    const specs: StrandSpec[] = [];
    for (let s = 0; s < maxStrands; s++) {
      // Distribute active radial offsets smoothly across 0.006..0.072 so gaps stay crisp
      const radialT = (s + rand() * 0.7) / maxStrands;
      const latRadius = 0.006 + Math.pow(radialT, 0.85) * 0.066;

      const baseJitter = (rand() * 2 - 1) * 0.08;
      const baseFrac = (maxStrands > 1 ? (s / (maxStrands - 1)) * 2 - 1 : 0) + baseJitter;
      const braidPhase = rand() * Math.PI * 2;

      const rCol = rand();
      const swatchIndex =
        rCol < 0.22
          ? 0
          : rCol < 0.52
          ? 1
          : rCol < 0.76
          ? 2
          : rCol < 0.90
          ? 3
          : 5;

      const colorHex = paletteSet.primary.swatches[swatchIndex];
      specs.push({
        id: s,
        baseFrac,
        baseJitter,
        braidPhase,
        latRadius,
        helixAngle: rand() * Math.PI * 2,
        helixSpeed: 0.4 + rand() * 0.9,
        lagScale: 0.88 + rand() * 0.24,
        idleArcOffsetNorm: rand() * 0.015,
        zOffset: (rand() * 2 - 1) * 0.25,
        brightness: 0.35 + rand() * 0.65,
        tailLength: 0.7 + rand() * 0.45,
        widthCssPx: 1.0 + rand() * 0.6,
        swatchIndex,
        color: new Color(colorHex),
        targetColor: new Color(colorHex),
      });
    }

    // One pre-allocated BufferGeometry supporting up to 36 strands x 320 chain points
    const vertsPerStrand = MAX_CHAIN_POINTS * 2;
    const totalVerts = maxStrands * vertsPerStrand;
    const trisPerStrand = (MAX_CHAIN_POINTS - 1) * 2;

    const posArray = new Float32Array(totalVerts * 3);
    const prevArray = new Float32Array(totalVerts * 3);
    const nextArray = new Float32Array(totalVerts * 3);
    const sideArray = new Float32Array(totalVerts);
    const uArray = new Float32Array(totalVerts);
    const pointMixArray = new Float32Array(totalVerts);
    const metaArray = new Float32Array(totalVerts * 4);
    const colArray = new Float32Array(totalVerts * 3);
    const indexArray = new Uint32Array(maxStrands * trisPerStrand * 3);

    for (let s = 0; s < maxStrands; s++) {
      const sp = specs[s];
      const vBase = s * vertsPerStrand;
      for (let i = 0; i < MAX_CHAIN_POINTS; i++) {
        for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
          const v = vBase + i * 2 + sideIdx;
          sideArray[v] = sideIdx === 0 ? -1 : 1;
          pointMixArray[v] = 1.0;

          const m = v * 4;
          metaArray[m] = sp.id;
          metaArray[m + 1] = sp.brightness;
          metaArray[m + 2] = sp.tailLength;
          metaArray[m + 3] = sp.widthCssPx;

          const c = v * 3;
          colArray[c] = sp.color.r;
          colArray[c + 1] = sp.color.g;
          colArray[c + 2] = sp.color.b;
        }
      }
    }

    const geometry = new BufferGeometry();
    const posAttr = new BufferAttribute(posArray, 3);
    posAttr.setUsage(DynamicDrawUsage);
    const prevAttr = new BufferAttribute(prevArray, 3);
    prevAttr.setUsage(DynamicDrawUsage);
    const nextAttr = new BufferAttribute(nextArray, 3);
    nextAttr.setUsage(DynamicDrawUsage);
    const uAttr = new BufferAttribute(uArray, 1);
    uAttr.setUsage(DynamicDrawUsage);
    const pointMixAttr = new BufferAttribute(pointMixArray, 1);
    pointMixAttr.setUsage(DynamicDrawUsage);
    const colAttr = new BufferAttribute(colArray, 3);
    colAttr.setUsage(DynamicDrawUsage);
    const indexAttr = new BufferAttribute(indexArray, 1);
    indexAttr.setUsage(DynamicDrawUsage);

    geometry.setAttribute("position", posAttr);
    geometry.setAttribute("aPrev", prevAttr);
    geometry.setAttribute("aNext", nextAttr);
    geometry.setAttribute("aSide", new BufferAttribute(sideArray, 1));
    geometry.setAttribute("aU", uAttr);
    geometry.setAttribute("aPointMix", pointMixAttr);
    geometry.setAttribute("aStrandMeta", new BufferAttribute(metaArray, 4));
    geometry.setAttribute("aStrandColor", colAttr);
    geometry.setIndex(indexAttr);

    const applyGeometryRangeAndU = () => {
      const trisPerS = (activeChainPoints - 1) * 2;
      for (let s = 0; s < activeStrandCount; s++) {
        const sp = specs[s];
        sp.baseFrac =
          (activeStrandCount > 1 ? (s / (activeStrandCount - 1)) * 2 - 1 : 0) + sp.baseJitter;

        const vBase = s * vertsPerStrand;
        for (let i = 0; i < activeChainPoints; i++) {
          const u = i / (activeChainPoints - 1);
          const v0 = vBase + i * 2;
          uArray[v0] = u;
          uArray[v0 + 1] = u;
        }

        const iBase = s * trisPerS * 3;
        for (let i = 0; i < activeChainPoints - 1; i++) {
          const v0 = vBase + i * 2;
          const v1 = v0 + 1;
          const v2 = v0 + 2;
          const v3 = v0 + 3;
          const k = iBase + i * 6;
          indexArray[k] = v0;
          indexArray[k + 1] = v2;
          indexArray[k + 2] = v1;
          indexArray[k + 3] = v1;
          indexArray[k + 4] = v2;
          indexArray[k + 5] = v3;
        }
      }
      uAttr.needsUpdate = true;
      indexAttr.needsUpdate = true;
      geometry.setDrawRange(0, activeStrandCount * trisPerS * 3);
    };
    applyGeometryRangeAndU();

    const material = new ShaderMaterial({
      uniforms: {
        uResolutionPx: { value: new Vector2(width * dpr, height * dpr) },
        uDpr: { value: dpr },
        uWidthScale: { value: 1.0 },
        uIdleDepthRange: { value: Math.max(0.25, figF * 0.68) },
        uTime: { value: 0 },
        uIntensityScale: { value: 1.0 },
        uTrailFrac: { value: 1.0 },
      },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      toneMapped: false,
      side: DoubleSide,
    });

    const ribbonMesh = new Mesh(geometry, material);
    ribbonMesh.frustumCulled = false;
    scene.add(ribbonMesh);

    // Active comet simulation chains (96 points per strand -> smoothly resampled onto activeChainPoints)
    const chainX = new Float32Array(maxStrands * COMET_POINTS);
    const chainY = new Float32Array(maxStrands * COMET_POINTS);
    const chainZ = new Float32Array(maxStrands * COMET_POINTS);
    const midX = new Float32Array(maxStrands * COMET_POINTS);
    const midY = new Float32Array(maxStrands * COMET_POINTS);
    const midZ = new Float32Array(maxStrands * COMET_POINTS);

    // Per-frame scratch arrays (zero allocations in animation loop)
    const cometSampX = new Float32Array(MAX_CHAIN_POINTS);
    const cometSampY = new Float32Array(MAX_CHAIN_POINTS);
    const cometSampZ = new Float32Array(MAX_CHAIN_POINTS);
    const cometNormX = new Float32Array(MAX_CHAIN_POINTS);
    const cometNormY = new Float32Array(MAX_CHAIN_POINTS);
    const worldX = new Float32Array(MAX_CHAIN_POINTS);
    const worldY = new Float32Array(MAX_CHAIN_POINTS);
    const worldZ = new Float32Array(MAX_CHAIN_POINTS);
    const pointWeights = new Float32Array(MAX_CHAIN_POINTS);
    pointWeights.fill(1.0);

    let headDistance = 0;
    const initLocal = { x: 0, y: 0, z: 0, nx: 0, ny: 0, w: 0 };
    const initWorld = { x: 0, y: 0, z: 0 };
    const initPose = evalYawPitch(0);
    {
      const cosY0 = Math.cos(initPose.yaw);
      const sinY0 = Math.sin(initPose.yaw);
      const cosP0 = Math.cos(initPose.pitch);
      const sinP0 = Math.sin(initPose.pitch);
      for (let i = 0; i < COMET_POINTS; i++) {
        const uArc = sampleArcToU(-(i / (COMET_POINTS - 1)) * 0.4 * lemTotalLen);
        evalLocalLemniscate(uArc, initLocal);
        rotateRyRx(initLocal.x, initLocal.y, initLocal.z, cosY0, sinY0, cosP0, sinP0, figCy, initWorld);
        for (let s = 0; s < maxStrands; s++) {
          const idx = s * COMET_POINTS + i;
          chainX[idx] = initWorld.x;
          chainY[idx] = initWorld.y;
          chainZ[idx] = initWorld.z;
          midX[idx] = initWorld.x;
          midY[idx] = initWorld.y;
          midZ[idx] = initWorld.z;
        }
      }
    }

    const headPos = new Vector3(chainX[0], chainY[0], chainZ[0]);
    let headVelX = 0;
    let headVelY = 0;

    const idleCenterRot = { x: 0, y: 0, z: 0 };
    const idleStrandRot = { x: 0, y: 0, z: 0 };

    const rebuildRibbonBuffers = (
      simTime: number,
      speedNorm: number,
      trailLoopFrac: number,
      yaw: number,
      pitch: number
    ) => {
      const vStr = activeStrandCount;
      const nPts = activeChainPoints;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const speedExpand = 1.0 + 0.6 * speedNorm;
      const breathScale = 1.0 + 0.08 * Math.sin((2 * Math.PI * simTime) / 5.0);
      const halfT = 0.5 * simTime;
      const invLenLut = ARC_LUT_SIZE / lemTotalLen;
      const loopTrailArc = trailLoopFrac * lemTotalLen;
      const isClosedLoop =
        trailLoopFrac > 0.995 && pointWeights[0] > 0.995 && pointWeights[nPts - 1] > 0.995;

      for (let s = 0; s < vStr; s++) {
        const sp = specs[s];
        const cBase = s * COMET_POINTS;
        const strandArcShift = sp.idleArcOffsetNorm * lemTotalLen;
        const braidCos = Math.cos(halfT + sp.braidPhase);
        const braidSin = Math.sin(halfT + sp.braidPhase);

        // Check whether any active comet computation is needed for this frame
        let needComet = false;
        for (let i = 0; i < nPts; i++) {
          if (pointWeights[i] < 0.9999) {
            needComet = true;
            break;
          }
        }

        if (needComet) {
          // Resample 96-point comet chain cleanly onto nPts and compute continuous 2D normal
          let prevNx = 0;
          let prevNy = 1;
          for (let i = 0; i < nPts; i++) {
            const cPos = (i / (nPts - 1)) * (COMET_POINTS - 1);
            const i0 = Math.min(COMET_POINTS - 2, Math.floor(cPos));
            const f = cPos - i0;
            const idx0 = cBase + i0;
            cometSampX[i] = chainX[idx0] + (chainX[idx0 + 1] - chainX[idx0]) * f;
            cometSampY[i] = chainY[idx0] + (chainY[idx0 + 1] - chainY[idx0]) * f;
            cometSampZ[i] = chainZ[idx0] + (chainZ[idx0 + 1] - chainZ[idx0]) * f;
          }
          for (let i = 0; i < nPts; i++) {
            const iP = Math.max(0, i - 1);
            const iN = Math.min(nPts - 1, i + 1);
            let tx = cometSampX[iN] - cometSampX[iP];
            let ty = cometSampY[iN] - cometSampY[iP];
            const tLen = Math.hypot(tx, ty);
            if (tLen > 1e-6) {
              tx /= tLen;
              ty /= tLen;
            } else {
              tx = 1;
              ty = 0;
            }
            let nx = -ty;
            let ny = tx;
            if (i > 0 && nx * prevNx + ny * prevNy < 0) {
              nx = -nx;
              ny = -ny;
            }
            prevNx = nx;
            prevNy = ny;
            cometNormX[i] = nx;
            cometNormY[i] = ny;
          }
        }

        for (let i = 0; i < nPts; i++) {
          const uFrac = i / (nPts - 1);
          const mix = pointWeights[i];

          if (mix <= 0.0001) {
            const bodyEnv = Math.sin(Math.pow(uFrac, 0.65) * Math.PI * 0.88);
            const baseR = (0.003 + sp.latRadius * bodyEnv) * speedExpand;
            const theta = sp.helixAngle + uFrac * 6.2;
            const signedR = Math.cos(theta) * baseR;
            worldX[i] = cometSampX[i] + cometNormX[i] * signedR;
            worldY[i] = cometSampY[i] + cometNormY[i] * signedR;
            worldZ[i] = cometSampZ[i] + sp.zOffset * bodyEnv + Math.sin(theta) * baseR * 1.8;
          } else {
            const rawArc = headDistance - uFrac * loopTrailArc - strandArcShift;
            const wrappedArc = ((rawArc % lemTotalLen) + lemTotalLen) % lemTotalLen;
            const fLut = wrappedArc * invLenLut;
            const k0 = Math.min(ARC_LUT_SIZE - 1, fLut | 0);
            const kf = fLut - k0;

            const locX = lutX[k0] + (lutX[k0 + 1] - lutX[k0]) * kf;
            const locY = lutY[k0] + (lutY[k0 + 1] - lutY[k0]) * kf;
            const locZ = lutZ[k0] + (lutZ[k0 + 1] - lutZ[k0]) * kf;
            const locNx = lutNx[k0] + (lutNx[k0 + 1] - lutNx[k0]) * kf;
            const locNy = lutNy[k0] + (lutNy[k0 + 1] - lutNy[k0]) * kf;
            const locW = (lutW[k0] + (lutW[k0 + 1] - lutW[k0]) * kf) * breathScale;
            const sin2U = lutSin2U[k0] + (lutSin2U[k0 + 1] - lutSin2U[k0]) * kf;
            const cos2U = lutCos2U[k0] + (lutCos2U[k0 + 1] - lutCos2U[k0]) * kf;

            const braid = 0.18 * (sin2U * braidCos + cos2U * braidSin);
            const fk = sp.baseFrac + braid;
            const halfW = locW * 0.5;
            const lx = locX + locNx * fk * halfW;
            const ly = locY + locNy * fk * halfW;
            const lz = locZ;

            rotateRyRx(lx, ly, lz, cosY, sinY, cosP, sinP, figCy, idleStrandRot);

            if (mix >= 0.9999) {
              worldX[i] = idleStrandRot.x;
              worldY[i] = idleStrandRot.y;
              worldZ[i] = idleStrandRot.z;
            } else {
              // Morph preserving wire spread lerp(cometWidth, w(u), mix_i) with non-collapsing direction blend
              rotateRyRx(locX, locY, locZ, cosY, sinY, cosP, sinP, figCy, idleCenterRot);

              const cx = cometSampX[i] * (1 - mix) + idleCenterRot.x * mix;
              const cy = cometSampY[i] * (1 - mix) + idleCenterRot.y * mix;
              const cz = cometSampZ[i] * (1 - mix) + idleCenterRot.z * mix;

              const bodyEnv = Math.sin(Math.pow(uFrac, 0.65) * Math.PI * 0.88);
              const baseR = (0.003 + sp.latRadius * bodyEnv) * speedExpand;
              const theta = sp.helixAngle + uFrac * 6.2;
              const signedR = Math.cos(theta) * baseR;

              const actOffX = cometNormX[i] * signedR;
              const actOffY = cometNormY[i] * signedR;
              const actOffZ = sp.zOffset * bodyEnv + Math.sin(theta) * baseR * 1.8;
              const actLen = Math.hypot(actOffX, actOffY, actOffZ);

              const idlOffX = idleStrandRot.x - idleCenterRot.x;
              const idlOffY = idleStrandRot.y - idleCenterRot.y;
              const idlOffZ = idleStrandRot.z - idleCenterRot.z;
              const idlLen = Math.hypot(idlOffX, idlOffY, idlOffZ);

              if (actLen > 1e-5 && idlLen > 1e-5) {
                const mag = actLen * (1 - mix) + idlLen * mix;
                let dx = (actOffX / actLen) * (1 - mix) + (idlOffX / idlLen) * mix;
                let dy = (actOffY / actLen) * (1 - mix) + (idlOffY / idlLen) * mix;
                let dz = (actOffZ / actLen) * (1 - mix) + (idlOffZ / idlLen) * mix;
                let dLen = Math.hypot(dx, dy, dz);
                if (dLen < 0.08) {
                  // Nearly antiparallel mid-morph: detour gently along orthogonal in-plane direction
                  dx += -cometNormY[i] * 0.25;
                  dy += cometNormX[i] * 0.25;
                  dLen = Math.hypot(dx, dy, dz);
                }
                const invD = mag / Math.max(1e-6, dLen);
                worldX[i] = cx + dx * invD;
                worldY[i] = cy + dy * invD;
                worldZ[i] = cz + dz * invD;
              } else {
                worldX[i] = cx + actOffX * (1 - mix) + idlOffX * mix;
                worldY[i] = cy + actOffY * (1 - mix) + idlOffY * mix;
                worldZ[i] = cz + actOffZ * (1 - mix) + idlOffZ * mix;
              }
            }
          }
        }

        // Write double-vertex triangle strip + adjacent tangents into Float32Arrays
        const vBase = s * vertsPerStrand;
        for (let i = 0; i < nPts; i++) {
          const px = worldX[i];
          const py = worldY[i];
          const pz = worldZ[i];
          const mix = pointWeights[i];

          let pvx: number;
          let pvy: number;
          let pvz: number;
          if (i === 0) {
            if (isClosedLoop) {
              pvx = worldX[nPts - 2];
              pvy = worldY[nPts - 2];
              pvz = worldZ[nPts - 2];
            } else {
              pvx = px * 2 - worldX[1];
              pvy = py * 2 - worldY[1];
              pvz = pz * 2 - worldZ[1];
            }
          } else {
            pvx = worldX[i - 1];
            pvy = worldY[i - 1];
            pvz = worldZ[i - 1];
          }

          let nxx: number;
          let nxy: number;
          let nxz: number;
          if (i === nPts - 1) {
            if (isClosedLoop) {
              nxx = worldX[1];
              nxy = worldY[1];
              nxz = worldZ[1];
            } else {
              nxx = px * 2 - worldX[i - 1];
              nxy = py * 2 - worldY[i - 1];
              nxz = pz * 2 - worldZ[i - 1];
            }
          } else {
            nxx = worldX[i + 1];
            nxy = worldY[i + 1];
            nxz = worldZ[i + 1];
          }

          for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
            const vIdx = vBase + i * 2 + sideIdx;
            pointMixArray[vIdx] = mix;

            const vOff = vIdx * 3;
            posArray[vOff] = px;
            posArray[vOff + 1] = py;
            posArray[vOff + 2] = pz;

            prevArray[vOff] = pvx;
            prevArray[vOff + 1] = pvy;
            prevArray[vOff + 2] = pvz;

            nextArray[vOff] = nxx;
            nextArray[vOff + 1] = nxy;
            nextArray[vOff + 2] = nxz;
          }
        }
      }

      posAttr.needsUpdate = true;
      prevAttr.needsUpdate = true;
      nextAttr.needsUpdate = true;
      pointMixAttr.needsUpdate = true;
    };

    const renderScene = () => {
      composer.render();

      if (isLowEnd || downgraded) {
        renderer.setRenderTarget(null);
        return;
      }

      const srcTex = composer.readBuffer.texture;
      blurMat.uniforms.tInput.value = srcTex;
      blurMat.uniforms.uDirectionPx.value.set(1.0, 0.0);
      renderer.setRenderTarget(glowRtB);
      renderer.clear();
      renderer.render(blurScene, blurCam);

      blurMat.uniforms.tInput.value = glowRtB.texture;
      blurMat.uniforms.uDirectionPx.value.set(0.0, 1.0);
      renderer.setRenderTarget(glowRtA);
      renderer.clear();
      renderer.render(blurScene, blurCam);

      renderer.setRenderTarget(null);
    };

    // Dynamic runtime state (always runs live — calm mode uses 0.25x speed & gentler tilt instead of freezing)
    let simTime = 0;
    let lastNow = performance.now();
    let rafId = 0;
    let isInView = true;
    let isPageVisible = !document.hidden;

    let pointerActive = false;
    let timeSinceMove = IDLE_AFTER_SEC + 1;
    const fullStaggerSpan = (MAX_CHAIN_POINTS - 1) * STAGGER_PER_POINT_SEC + MORPH_RAMP_SEC;
    let idleMix = 1.0;
    let enterIdleSec = fullStaggerSpan;
    let exitIdleSec = 0;
    let trailLoopFrac = 1.0;
    let wasIdle = true;

    const initCalm = isCalmActive();
    let curYawAmp = initCalm ? 0.15 : 0.62;
    let curPitchAmp = initCalm ? 0.07 : 0.28;

    const pointerTarget = new Vector3(headPos.x, headPos.y, 0);
    let smoothSpeed = 0;
    let clickElapsed = CLICK_EASE_SEC;
    let prevHeadX = headPos.x;
    let prevHeadY = headPos.y;
    let colorMorphPending = false;

    // Performance guardrail & live FPS tracker
    let slowFrames = 0;
    let downgraded = false;
    let fpsEma = 60;
    let lastDebugUpdateNow = 0;

    const setPointerFromClient = (clientX: number, clientY: number) => {
      if (isCalmActive()) return;
      const w = Math.max(window.innerWidth, 1);
      const h = Math.max(window.innerHeight, 1);
      const ndcX = (clientX / w) * 2 - 1;
      const ndcY = -(clientY / h) * 2 + 1;
      pointerTarget.set(ndcX * (bounds.visW * 0.5), ndcY * (bounds.visH * 0.5), 0);
      if (!pointerActive) {
        if (wasIdle) {
          const pose = evalYawPitch(simTime, curYawAmp, curPitchAmp);
          const curU = sampleArcToU(headDistance);
          const locH = { x: 0, y: 0, z: 0, nx: 0, ny: 0, w: 0 };
          const wrdH = { x: 0, y: 0, z: 0 };
          evalLocalLemniscate(curU, locH);
          rotateRyRx(
            locH.x,
            locH.y,
            locH.z,
            Math.cos(pose.yaw),
            Math.sin(pose.yaw),
            Math.cos(pose.pitch),
            Math.sin(pose.pitch),
            figCy,
            wrdH
          );
          headPos.set(wrdH.x, wrdH.y, wrdH.z);
          prevHeadX = wrdH.x;
          prevHeadY = wrdH.y;
          headVelX = 0;
          headVelY = 0;
        }
        exitIdleSec = 0;
      }
      pointerActive = true;
      wasIdle = false;
      timeSinceMove = 0;
    };

    const triggerRelease = () => {
      if (!pointerActive && wasIdle) return;
      pointerActive = false;
      if (!wasIdle) {
        const pose = evalYawPitch(simTime, curYawAmp, curPitchAmp);
        headDistance = findNearestArcDist(headPos.x, headPos.y, headPos.z, pose.yaw, pose.pitch);
        enterIdleSec = 0;
        wasIdle = true;
      }
    };

    const onPointerMove = (e: PointerEvent) => setPointerFromClient(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) setPointerFromClient(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => {
      if (isCalmActive()) return;
      timeSinceMove = 0;
      pointerActive = true;
    };
    const onPointerLeave = () => triggerRelease();
    const onWindowBlur = () => triggerRelease();

    const onClick = (e: MouseEvent) => {
      if (isCalmActive()) return;
      if ((e.target as HTMLElement | null)?.closest("a, button, input, select, textarea")) {
        return;
      }
      activeVariant = activeVariant === 0 ? 1 : 0;
      const chosen = activeVariant === 0 ? paletteSet.primary : paletteSet.alternate;
      for (let s = 0; s < maxStrands; s++) {
        const sp = specs[s];
        sp.targetColor.set(chosen.swatches[sp.swatchIndex]);
      }
      colorMorphPending = true;
      clickElapsed = 0;
    };

    let resizeTimer = 0;
    const applyResize = () => {
      if (!alive) return;
      const w = Math.max(window.innerWidth, 1);
      const h = Math.max(window.innerHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      bounds = getVisibleBounds();
      buildLemniscateTable();
      material.uniforms.uIdleDepthRange.value = Math.max(0.25, figF * 0.68);
      dpr = isLowEnd || downgraded ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      bloomPass.resolution.set(w, h);
      const hw = Math.max(1, Math.floor(w * 0.5));
      const hh = Math.max(1, Math.floor(h * 0.5));
      glowRtA.setSize(hw, hh);
      glowRtB.setSize(hw, hh);
      blurMat.uniforms.uTexSize.value.set(hw, hh);
      material.uniforms.uDpr.value = dpr;
      material.uniforms.uResolutionPx.value.set(w * dpr, h * dpr);
    };
    rebuildLayoutRef.current = applyResize;

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(applyResize, 120);
    };

    const onVisibilityChange = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) {
        lastNow = performance.now();
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        isInView = entry.isIntersecting;
        if (isInView) {
          lastNow = performance.now();
        }
      },
      { threshold: 0.02 }
    );
    io.observe(host);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("click", onClick);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const idlePtWorld = { x: 0, y: 0, z: 0 };

    let firstFrameFired = false;
    let warmupFrames = 0;
    let warmupDtSum = 0;

    const animate = (now: number) => {
      if (!alive) return;
      rafId = window.requestAnimationFrame(animate);

      const rawWallDt = Math.max(0, (now - lastNow) * 0.001);
      lastNow = now;

      if (
        !isInView ||
        !isPageVisible ||
        document.documentElement.dataset.agentChatOpen === "true"
      ) {
        return;
      }

      if (rawWallDt > 0.0005 && rawWallDt < 0.25) {
        const instFps = Math.min(240, 1 / rawWallDt);
        fpsEma += (instFps - fpsEma) * 0.12;
        if (!isLowEnd && !downgraded && warmupFrames < 60) {
          warmupFrames++;
          warmupDtSum += rawWallDt;
          if (warmupFrames === 60) {
            const avgFps = 60 / Math.max(warmupDtSum, 0.001);
            if (avgFps < 40) {
              downgraded = true;
              activeStrandCount = Math.min(20, maxStrands);
              activeChainPoints = 200;
              dpr = 1;
              bloomPass.setSize(
                Math.max(1, Math.floor(window.innerWidth * 0.5)),
                Math.max(1, Math.floor(window.innerHeight * 0.5))
              );
              applyGeometryRangeAndU();
              applyResize();
            }
          }
        }
      }

      // Monitor real frame time after warmup and cut to 20 strands + 200 chain points if < 55 fps
      if (!isLowEnd && !downgraded && simTime > 1.8) {
        if (rawWallDt > 0.022) {
          slowFrames++;
          if (slowFrames > 45) {
            downgraded = true;
            activeStrandCount = Math.min(20, maxStrands);
            activeChainPoints = 200;
            dpr = 1;
            applyGeometryRangeAndU();
            applyResize();
          }
        } else {
          slowFrames = Math.max(0, slowFrames - 1);
        }
      }

      const calm = isCalmActive();
      const timeScale = calm ? 0.25 : 1.0;
      const dtWall = Math.min(rawWallDt, 0.05);
      const dt = dtWall * timeScale;
      if (dt <= 0) return;

      simTime += dt;
      timeSinceMove += Math.min(rawWallDt, 0.25);

      if (calm) {
        if (pointerActive) triggerRelease();
        clickElapsed = CLICK_EASE_SEC;
      } else if (pointerActive && timeSinceMove >= IDLE_AFTER_SEC) {
        triggerRelease();
      } else if (pointerActive && timeSinceMove < IDLE_AFTER_SEC) {
        wasIdle = false;
      }

      // Smoothly ease tilt amplitudes between Full (0.62, 0.28) and Calm (0.15, 0.07)
      const ampBlend = 1 - Math.exp(-4.5 * dtWall);
      curYawAmp += ((calm ? 0.15 : 0.62) - curYawAmp) * ampBlend;
      curPitchAmp += ((calm ? 0.07 : 0.28) - curPitchAmp) * ampBlend;

      const pose = evalYawPitch(simTime, curYawAmp, curPitchAmp);
      const cosY = Math.cos(pose.yaw);
      const sinY = Math.sin(pose.yaw);
      const cosP = Math.cos(pose.pitch);
      const sinP = Math.sin(pose.pitch);

      const targetClamp = computeTargetClampScale(cosY, sinY, cosP, sinP);
      const clampBlend = 1 - Math.exp(-dtWall / 0.15);
      figScale += (targetClamp - figScale) * clampBlend;

      // Advance traveling head along loop at constant arc speed (6s full loop in full mode, 24s in calm via timeScale=0.25)
      headDistance = (headDistance + (lemTotalLen / LEMNISCATE_PERIOD) * dt) % lemTotalLen;
      const headFrac = (headDistance / lemTotalLen) * ARC_LUT_SIZE;
      const hk0 = Math.min(ARC_LUT_SIZE - 1, headFrac | 0);
      const hkf = headFrac - hk0;
      rotateRyRx(
        lutX[hk0] + (lutX[hk0 + 1] - lutX[hk0]) * hkf,
        lutY[hk0] + (lutY[hk0 + 1] - lutY[hk0]) * hkf,
        lutZ[hk0] + (lutZ[hk0 + 1] - lutZ[hk0]) * hkf,
        cosY,
        sinY,
        cosP,
        sinP,
        figCy,
        idlePtWorld
      );

      const nPts = activeChainPoints;
      const maxSpanSec = (nPts - 1) * STAGGER_PER_POINT_SEC + MORPH_RAMP_SEC;

      if (pointerActive && !calm) {
        idleMix = Math.max(0, idleMix - dtWall / 0.85);
        exitIdleSec = Math.min(maxSpanSec, exitIdleSec + dtWall * 2.2);
        trailLoopFrac = 0.4 + 0.6 * (1 - smoothstep(0, maxSpanSec * 0.75, exitIdleSec));
        for (let i = 0; i < nPts; i++) {
          const targetW = 1 - smoothstep(0, MORPH_RAMP_SEC, exitIdleSec - STAGGER_PER_POINT_SEC * i);
          pointWeights[i] = Math.min(pointWeights[i], targetW);
        }
      } else {
        idleMix = Math.min(1, idleMix + dtWall / 1.5);
        enterIdleSec = Math.min(maxSpanSec, enterIdleSec + dtWall);
        trailLoopFrac = 0.4 + 0.6 * smoothstep(0, maxSpanSec, enterIdleSec);
        for (let i = 0; i < nPts; i++) {
          const targetW = smoothstep(0, MORPH_RAMP_SEC, enterIdleSec - STAGGER_PER_POINT_SEC * i);
          pointWeights[i] = Math.max(pointWeights[i], targetW);
        }
      }

      // Integrate active comet helix phases
      for (let s = 0; s < activeStrandCount; s++) {
        specs[s].helixAngle += specs[s].helixSpeed * dtWall;
      }

      if (!pointerActive && pointWeights[nPts - 1] >= 0.999) {
        headPos.set(idlePtWorld.x, idlePtWorld.y, idlePtWorld.z);
        headVelX = 0;
        headVelY = 0;
        for (let i = 0; i < COMET_POINTS; i++) {
          const rawS = headDistance - (i / (COMET_POINTS - 1)) * 0.4 * lemTotalLen;
          const wrapS = ((rawS % lemTotalLen) + lemTotalLen) % lemTotalLen;
          const fLut = (wrapS / lemTotalLen) * ARC_LUT_SIZE;
          const k0 = Math.min(ARC_LUT_SIZE - 1, fLut | 0);
          const kf = fLut - k0;
          rotateRyRx(
            lutX[k0] + (lutX[k0 + 1] - lutX[k0]) * kf,
            lutY[k0] + (lutY[k0 + 1] - lutY[k0]) * kf,
            lutZ[k0] + (lutZ[k0 + 1] - lutZ[k0]) * kf,
            cosY,
            sinY,
            cosP,
            sinP,
            figCy,
            idlePtWorld
          );
          for (let s = 0; s < activeStrandCount; s++) {
            const idx = s * COMET_POINTS + i;
            chainX[idx] = idlePtWorld.x;
            chainY[idx] = idlePtWorld.y;
            chainZ[idx] = idlePtWorld.z;
            midX[idx] = idlePtWorld.x;
            midY[idx] = idlePtWorld.y;
            midZ[idx] = idlePtWorld.z;
          }
        }
      } else {
        const tx = pointerTarget.x * (1 - idleMix) + idlePtWorld.x * idleMix;
        const ty = pointerTarget.y * (1 - idleMix) + idlePtWorld.y * idleMix;
        const tz = 0 * (1 - idleMix) + idlePtWorld.z * idleMix;

        const springK = 55.0;
        const springDamp = 2 * 0.55 * Math.sqrt(springK);
        const speedNorm = Math.min(1, smoothSpeed / 8.5);
        const fastTrailGain = 1.0 - 0.18 * speedNorm;
        const zAmpActive = 0.4 * (1.0 - idleMix);

        const subSteps = Math.max(1, Math.ceil(dtWall / 0.008));
        const subDt = dtWall / subSteps;

        for (let step = 0; step < subSteps; step++) {
          const ax = (tx - headPos.x) * springK - headVelX * springDamp;
          const ay = (ty - headPos.y) * springK - headVelY * springDamp;
          headVelX += ax * subDt;
          headVelY += ay * subDt;
          headPos.x += headVelX * subDt;
          headPos.y += headVelY * subDt;
          headPos.z += (tz + Math.sin(simTime * 1.1) * zAmpActive * 0.35 - headPos.z) * (1 - Math.exp(-8 * subDt));

          // Per-strand 96-point second-order cascaded lag chain
          for (let s = 0; s < activeStrandCount; s++) {
            const base = s * COMET_POINTS;
            chainX[base] = headPos.x;
            chainY[base] = headPos.y;
            chainZ[base] = headPos.z;
            midX[base] = headPos.x;
            midY[base] = headPos.y;
            midZ[base] = headPos.z;

            const lagMul = specs[s].lagScale * fastTrailGain;

            for (let i = 1; i < COMET_POINTS; i++) {
              const u = i / (COMET_POINTS - 1);
              const kCoeff = (0.30 * (1.0 - u) + 0.08 * u) * lagMul;
              const ratePerSec = kCoeff * 215.0;
              const alphaFollow = 1.0 - Math.exp(-ratePerSec * subDt);
              const idx = base + i;
              const idxPrev = idx - 1;

              midX[idx] += (chainX[idxPrev] - midX[idx]) * alphaFollow;
              midY[idx] += (chainY[idxPrev] - midY[idx]) * alphaFollow;
              const waveZ = Math.sin(i * 0.28 + simTime * 1.1) * zAmpActive;
              midZ[idx] += (chainZ[idxPrev] * 0.55 + waveZ * 0.45 - midZ[idx]) * alphaFollow;

              chainX[idx] += (midX[idx] - chainX[idx]) * alphaFollow;
              chainY[idx] += (midY[idx] - chainY[idx]) * alphaFollow;
              chainZ[idx] += (midZ[idx] - chainZ[idx]) * alphaFollow;
            }
          }
        }
      }

      const instSpeed = Math.hypot(headPos.x - prevHeadX, headPos.y - prevHeadY) / Math.max(dtWall, 0.004);
      prevHeadX = headPos.x;
      prevHeadY = headPos.y;
      smoothSpeed += (instSpeed - smoothSpeed) * (1 - Math.exp(-7.5 * dtWall));

      // Click boost 2.5x easing back over 1.2s with cubic-bezier(0.19, 1, 0.22, 1)
      let clickGlowBoost = 1.0;
      if (!calm && clickElapsed < CLICK_EASE_SEC) {
        clickElapsed = Math.min(CLICK_EASE_SEC, clickElapsed + dtWall);
        clickGlowBoost = 1.0 + 1.5 * (1.0 - cubicBezierExpoOut(clickElapsed / CLICK_EASE_SEC));
      }

      if (colorMorphPending) {
        const cLerp = 1.0 - Math.exp(-6.0 * dtWall);
        let maxDiff = 0;
        for (let s = 0; s < maxStrands; s++) {
          const sp = specs[s];
          sp.color.lerp(sp.targetColor, cLerp);
          const diff =
            Math.abs(sp.color.r - sp.targetColor.r) +
            Math.abs(sp.color.g - sp.targetColor.g) +
            Math.abs(sp.color.b - sp.targetColor.b);
          if (diff > maxDiff) maxDiff = diff;
          const vBase = s * vertsPerStrand;
          for (let i = 0; i < vertsPerStrand; i++) {
            const c = (vBase + i) * 3;
            colArray[c] = sp.color.r;
            colArray[c + 1] = sp.color.g;
            colArray[c + 2] = sp.color.b;
          }
        }
        colAttr.needsUpdate = true;
        if (maxDiff < 0.005) colorMorphPending = false;
      }

      const headNdcY = headPos.y / (bounds.visH * 0.5);
      const ctaBand =
        headNdcY < 0.02 && headNdcY > -0.65
          ? Math.sin(((headNdcY + 0.65) / 0.67) * Math.PI)
          : 0;
      const ctaClamp = 1.0 - 0.18 * Math.max(0, ctaBand);

      const currentSpeedNorm = Math.min(1, smoothSpeed / 8.5);
      // Idle overall brightness ~25% below active
      const idleDim = 1.0 - 0.25 * idleMix;

      material.uniforms.uTime.value = simTime;
      material.uniforms.uTrailFrac.value = trailLoopFrac;
      material.uniforms.uWidthScale.value = 1.0 + 0.18 * currentSpeedNorm;
      const rawIntensity =
        (0.95 + 0.55 * currentSpeedNorm * (1 - idleMix)) * idleDim * (1.0 + (clickGlowBoost - 1.0) * 0.48) * ctaClamp;
      material.uniforms.uIntensityScale.value = ctaBand > 0.05 ? Math.min(0.85, rawIntensity) : rawIntensity;

      bloomPass.strength =
        (isLowEnd ? 0.5 : 0.7) * (0.85 + 0.25 * currentSpeedNorm * (1 - idleMix)) * (1.0 - 0.15 * idleMix) * (1.0 + (clickGlowBoost - 1.0) * 0.35);

      rebuildRibbonBuffers(simTime, currentSpeedNorm, trailLoopFrac, pose.yaw, pose.pitch);
      renderScene();
      if (!firstFrameFired) {
        firstFrameFired = true;
        onFirstFrameRef.current?.();
      }

      if (showDebug && now - lastDebugUpdateNow >= 100) {
        lastDebugUpdateNow = now;
        setDebugHud({
          prefersReducedMotion: prefersReduced,
          motionOverride: motionOverrideRef.current ?? "auto",
          running: alive,
          t: simTime,
          headDistance,
          idleMix,
          yaw: pose.yaw,
          pitch: pose.pitch,
          fps: fpsEma,
        });
      }
    };

    rafId = window.requestAnimationFrame(animate);

    return () => {
      alive = false;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(resizeTimer);
      io.disconnect();
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", onMotionPrefChange);
      } else {
        mql.removeListener(onMotionPrefChange);
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);

      geometry.dispose();
      material.dispose();
      rebuildLayoutRef.current = null;
      blurQuad.geometry.dispose();
      blurMat.dispose();
      glowRtA.dispose();
      glowRtB.dispose();
      renderTarget.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }, [palette]);

  return (
    <div ref={hostRef} className="tubes-bg-layer" aria-hidden="true">
      <canvas ref={canvasRef} className="tubes-bg-canvas" aria-hidden="true" />
      <div className="tubes-bg-vignette" aria-hidden="true" />
      {debugHud && (
        <div className="tubes-debug-hud">
          <div>
            <strong>prefersReducedMotion:</strong> {String(debugHud.prefersReducedMotion)}
          </div>
          <div>
            <strong>motionOverride:</strong> {debugHud.motionOverride}
          </div>
          <div>
            <strong>running:</strong> {String(debugHud.running)}
          </div>
          <div>
            <strong>t:</strong> {debugHud.t.toFixed(2)}s
          </div>
          <div>
            <strong>headDistance:</strong> {debugHud.headDistance.toFixed(2)}
          </div>
          <div>
            <strong>idleMix:</strong> {debugHud.idleMix.toFixed(2)}
          </div>
          <div>
            <strong>yaw / pitch:</strong> {debugHud.yaw.toFixed(3)} / {debugHud.pitch.toFixed(3)}
          </div>
          <div>
            <strong>fps:</strong> {debugHud.fps.toFixed(1)}
          </div>
        </div>
      )}
    </div>
  );
}
