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

export const isProduction = window.location.hostname.includes('solid.xyz');

export const BASE_URL = {
  waitlist: isProduction ? 'https://waitlist.solid.xyz' : 'https://waitlist-qa.solid.xyz',
};
