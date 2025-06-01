export function safeExecute<T, Args extends unknown[]>(
  fn: (...args: Args) => T,
  ...args: Args
): T | undefined {
  try {
    return fn(...args);
  } catch (error) {
    console.error(`Error in ${fn.name}:`, error);
  }
}
