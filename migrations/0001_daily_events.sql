-- Daily aggregate counts for first-party analytics (src/analytics/event.ts). No visitor data:
-- one row per UTC day × page path × event × traffic source × segment.
CREATE TABLE IF NOT EXISTS daily_events (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  event TEXT NOT NULL,
  source TEXT NOT NULL,
  segment TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, event, source, segment)
) WITHOUT ROWID;
