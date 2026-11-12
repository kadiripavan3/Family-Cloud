/**
 * Whose sign-in a token is: the account id written inside it (its "sub"). Both sign-in services hand out
 * tokens of this kind. Null when there is no token or it can't be read; nothing is checked here, the API
 * does that.
 */
export function accountOf(token: string | null): string | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    const subject = typeof claims === 'object' && claims !== null ? (claims as { sub?: unknown }).sub : null;
    return typeof subject === 'string' && subject ? subject : null;
  } catch {
    return null;
  }
}
