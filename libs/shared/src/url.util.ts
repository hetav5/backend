/**
 * Normalize a service base URL. Render's `fromService` host property injects a
 * bare hostname (no scheme); local/Railway use full URLs. This prefixes https://
 * when no scheme is present and strips any trailing slash.
 */
export function normalizeBaseUrl(value: string | undefined): string {
  if (!value) return '';
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, '');
}
