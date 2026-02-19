/**
 * Create a deferred promise that can be resolved externally.
 * Useful as a gate/latch in concurrency tests.
 */
export function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let outerResolve!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    outerResolve = resolve;
  });
  return { promise, resolve: outerResolve };
}
