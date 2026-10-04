import type { BeforeSendEvent } from '@vercel/analytics';

export const ANALYTICS_ORIGIN = 'https://fr.adabo.com.br';
const PUBLIC_PATHS = new Set(['/', '/join', '/admin', '/perguntas']);

export function analyticsRoute(pathname: string): string | null {
  return PUBLIC_PATHS.has(pathname) ? pathname : null;
}

export function sanitizePageview(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== 'pageview') return null;
  try {
    const url = new URL(event.url);
    if (url.origin !== ANALYTICS_ORIGIN || !analyticsRoute(url.pathname)) return null;
    // Reconstruct instead of spreading: discard payloads and future extra fields.
    return { type: 'pageview', url: `${ANALYTICS_ORIGIN}${url.pathname}` };
  } catch {
    return null;
  }
}

export function sanitizeReferrer(value: string): string {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? `${url.origin}/` : '';
  } catch {
    return '';
  }
}

export function prepareAnalyticsPrivacy(doc: Document = document): boolean {
  try {
    // No user identification is used; do not reuse legacy SDK attribution.
    doc.defaultView?.localStorage.removeItem('__va_attribution');
    const referrer = sanitizeReferrer(doc.referrer);
    // The official script reads this separately from the beforeSend callback.
    Object.defineProperty(doc, 'referrer', { value: referrer, configurable: true });
    return doc.referrer === referrer;
  } catch {
    return false;
  }
}
