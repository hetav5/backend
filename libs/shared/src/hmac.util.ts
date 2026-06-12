import { createHmac, timingSafeEqual } from 'crypto';

/** Header carrying the HMAC signature on receipt callbacks. */
export const SIGNATURE_HEADER = 'x-signature';

/** Compute a hex HMAC-SHA256 signature over the raw request body. */
export function signBody(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Constant-time verification of a signature against the raw body.
 * Returns false on any length/format mismatch rather than throwing.
 */
export function verifySignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = signBody(rawBody, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
