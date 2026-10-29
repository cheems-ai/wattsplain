// Browser side of the first-party analytics (see event.ts). Imported by the layout script and by
// the calculator islands; sends at most one "tool" event per tool per page view.
import { classifyReferrer, type EventName } from './event';

const sent = new Set<string>();

export function track(event: EventName): void {
  const key = `${event} ${location.pathname}`;
  if (event === 'tool' && sent.has(key)) return;
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
