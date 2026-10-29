// Browser side of the first-party analytics (see event.ts). Imported by the layout script and by
// the calculator islands; funnel events (tool, result, error) are sent at most once per page view.
import { classifyReferrer, type EventName } from './event';

const sent = new Set<string>();
/** Counted at most once per page view; compare and share count every use. */
const ONCE = new Set<EventName>(['tool', 'result', 'error', 'home-tool']);

export function track(event: EventName): void {
  const key = `${event} ${location.pathname}`;
  if (ONCE.has(event) && sent.has(key)) return;
  sent.add(key);
  const body = JSON.stringify({
    e: event,
    p: location.pathname,
    s: classifyReferrer(document.referrer, location.hostname),
    // Automated browsers (our own tests, scrapers) are counted separately from real visitors.
    a: navigator.webdriver ? 1 : 0,
  });
  try {
    if (!navigator.sendBeacon('/api/e', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/e', { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Analytics must never break the page.
  }
}
