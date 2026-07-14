/**
 * Work timer domain logic.
 *
 * The running timer is server-persisted (an `active_timers` row with a wall-clock
 * `started_at`); elapsed time is always computed from `started_at` against the server
 * clock, never accumulated from client ticks. These helpers keep that computation —
 * including the clock-skew clamp and the 24h logging cap — in one testable place.
 */

/** Logged duration is capped at 24 hours; a timer left running longer still stops cleanly. */
export const MAX_TIMER_SECONDS = 24 * 60 * 60;

/** Smallest amount a stopped timer logs, so a valid stop never fails the hours > 0 check. */
export const MIN_LOGGED_HOURS = 0.01;

/**
 * Wall-clock seconds since `startedAt`, floored to whole seconds and clamped to >= 0
 * (a `started_at` in the future — clock skew — reads as 0, never negative).
 */
export function computeElapsedSeconds(startedAt: string | Date, now: Date = new Date()): number {
  const startedMs = typeof startedAt === 'string' ? Date.parse(startedAt) : startedAt.getTime();
  if (!Number.isFinite(startedMs)) {
    return 0;
  }
  const elapsed = Math.floor((now.getTime() - startedMs) / 1000);
  return Math.max(0, elapsed);
}

/** True when the elapsed time exceeds the 24h logging cap. */
export function exceedsTimerCap(elapsedSeconds: number): boolean {
  return elapsedSeconds > MAX_TIMER_SECONDS;
}

/**
 * Hours to write on the work log for a stopped timer: capped at 24h, rounded to
 * 2 decimals, and never below MIN_LOGGED_HOURS (work_logs requires hours > 0).
 */
export function elapsedSecondsToLoggedHours(elapsedSeconds: number): number {
  const cappedSeconds = Math.min(Math.max(0, elapsedSeconds), MAX_TIMER_SECONDS);
  const rounded = Math.round((cappedSeconds / 3600) * 100) / 100;
  return Math.max(MIN_LOGGED_HOURS, rounded);
}
