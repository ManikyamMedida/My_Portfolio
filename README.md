# Manikyam Medida — Design Verification Portfolio

Next.js 14 (App Router, TypeScript, Framer Motion, Three.js) portfolio showcasing RTL/UVM design verification projects, interactive APB protocol waveform, and a personal AI agent powered by the Google Gemini API.

## Agent setup

1. **Create a free Gemini API key**
   - Sign in at [Google AI Studio](https://aistudio.google.com/apikey) and click **Create API key**.

2. **Configure local environment variables**
   - Copy `.env.example` to `.env.local` (already ignored by `.gitignore`):
     ```bash
     cp .env.example .env.local
     ```
   - Fill in `.env.local` (`GEMINI_API_KEY` is the only required variable; `GEMINI_MODEL` is optional and can be left empty to auto-select the best available Flash-Lite/Flash model):
     ```env
     GEMINI_API_KEY=your_key_here
     GEMINI_MODEL=
     SHARE_PHONE=false
     ```
   - Never expose `GEMINI_API_KEY` or `GEMINI_MODEL` with a `NEXT_PUBLIC_` prefix.

3. **Verify setup**
   - Run `npm run dev` and open `http://localhost:3000/api/agent` — it returns `{"ok":true,"model":"<chosen model name>"}`.
   - If `GEMINI_API_KEY` is missing (or quota is reached), `/api/agent` automatically falls back to a local keyword search over `lib/knowledge.ts` without exposing stack traces.

4. **Deploy to Vercel**
   - In your Vercel project go to **Settings → Environment Variables** and add `GEMINI_API_KEY` (required), plus optional `GEMINI_MODEL` and `SHARE_PHONE` (`false` by default) for Production/Preview.
   - **Rate limiting note:** `lib/rateLimit.ts` enforces 10 requests/minute and 60 requests/day per IP in an in-memory `Map`. On serverless hosting (like Vercel Functions), limits are per warm instance and can be swapped for a shared Redis/KV store (e.g., Upstash) if needed across regions.

## Credits

- **Waving Avatar Animation:** DotLottie animation placed at `public/agent/wave.lottie`, sourced from [LottieFiles](https://lottiefiles.com/) under the Lottie Simple License (free for personal/commercial web use).

