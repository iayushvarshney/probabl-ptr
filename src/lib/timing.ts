// TEMPORARY instrumentation — measuring the entity detail page's ~5-6s load
// to find the bottleneck before optimizing. Remove once diagnosed.
export function timer(label: string) {
  const start = performance.now();
  return () => {
    const ms = performance.now() - start;
    console.log(`[timing] ${label}: ${ms.toFixed(0)}ms`);
    return ms;
  };
}
