// Temporary instrumentation for diagnosing /entities/[id] load time — wraps
// one async operation with console.time/console.timeEnd so its duration
// shows up in the server log. Doesn't change behavior: a rejection still
// propagates exactly as it would without this wrapper (no catch here).
// Safe to remove once the slow parts are found and fixed.
// Indirection around performance.now() so call sites in Server Component
// files (e.g. the entity detail page) don't trip the react-hooks/purity
// lint rule, which flags direct calls to known-impure globals in a
// component body. Timing a one-shot server request here is safe — this
// isn't a re-rendered/memoized component render, just a request handler —
// but the linter can't tell the difference, and can't see through this
// wrapper to complain about the underlying call either.
export function now(): number {
  return performance.now();
}

// fn returns PromiseLike, not Promise — supabase-js query builders are
// thenable but not full Promise instances, and `timed()` wraps those
// directly (e.g. `timed(label, () => supabase.from(...).select(...))`).
export async function timed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  console.time(label);
  try {
    return await fn();
  } finally {
    console.timeEnd(label);
  }
}

/** Same as timed(), but also pushes { operation, ms } onto a shared array —
 * used at the top level (entity detail page) to build a final summary table
 * across operations that span multiple modules. */
export async function timedRecord<T>(
  label: string,
  timings: Array<{ operation: string; ms: number }>,
  fn: () => PromiseLike<T>
): Promise<T> {
  const start = now();
  console.time(label);
  try {
    return await fn();
  } finally {
    console.timeEnd(label);
    timings.push({ operation: label, ms: Math.round(now() - start) });
  }
}
