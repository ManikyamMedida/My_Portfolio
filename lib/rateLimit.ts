interface Bucket {
  minuteCount: number;
  minuteResetAt: number;
  dayCount: number;
  dayResetAt: number;
}

const MINUTE_LIMIT = 10;
const DAY_LIMIT = 60;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const store = new Map<string, Bucket>();
let checksSinceCleanup = 0;

function pruneExpired(now: number) {
  store.forEach((bucket, key) => {
    if (now >= bucket.dayResetAt && now >= bucket.minuteResetAt) {
      store.delete(key);
    }
  });
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number; message: string };

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  checksSinceCleanup++;
  if (checksSinceCleanup >= 50 || store.size > 500) {
    checksSinceCleanup = 0;
    pruneExpired(now);
  }

  let bucket = store.get(ip);
  if (!bucket) {
    bucket = {
      minuteCount: 0,
      minuteResetAt: now + MINUTE_MS,
      dayCount: 0,
      dayResetAt: now + DAY_MS,
    };
    store.set(ip, bucket);
  }

  if (now >= bucket.minuteResetAt) {
    bucket.minuteCount = 0;
    bucket.minuteResetAt = now + MINUTE_MS;
  }
  if (now >= bucket.dayResetAt) {
    bucket.dayCount = 0;
    bucket.dayResetAt = now + DAY_MS;
  }

  if (bucket.dayCount >= DAY_LIMIT) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.dayResetAt - now) / 1000));
    return {
      ok: false,
      retryAfterSec,
      message:
        "Daily question limit reached for this session. Please reach out to Manikyam directly by email or LinkedIn.",
    };
  }

  if (bucket.minuteCount >= MINUTE_LIMIT) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.minuteResetAt - now) / 1000));
    return {
      ok: false,
      retryAfterSec,
      message: `Too many messages at once. Please wait about ${retryAfterSec} seconds and try again.`,
    };
  }

  bucket.minuteCount += 1;
  bucket.dayCount += 1;
  return { ok: true };
}

