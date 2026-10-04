import { Analytics } from '@vercel/analytics/react';
import { useLocation } from 'react-router-dom';
import { ANALYTICS_ORIGIN, analyticsRoute, prepareAnalyticsPrivacy, sanitizePageview } from '@/lib/analyticsPrivacy';

// Run privacy preparation once, before the collector is mounted.
const enabled = import.meta.env.PROD
  && window.location.origin === ANALYTICS_ORIGIN
  && prepareAnalyticsPrivacy();

export function WebAnalytics() {
  const { pathname } = useLocation();
  const route = analyticsRoute(pathname) ?? '';
  if (!enabled) return null;
  // Supplying route disables automatic history tracking. The React Router
  // location is the single source of pageviews, including back/forward.
  return <Analytics route={route} path={route} beforeSend={sanitizePageview} debug={false} />;
}
