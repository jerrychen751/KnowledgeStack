/** Convert an ISO 8601 timestamp from the sources API to compact display text. The value must have a form such as "2026-08-20T16:42:03.000Z". A null value means no sync or index pass has finished. Return a string with one of these forms: "never", "just now", "<minutes> min ago", "<hours> h ago", or a browser-local date. */
export function formatTime(value: string | null): string {
  if (value === null) {
    return "never";
  }

  const stamp = new Date(value);
  const minutes = Math.round((Date.now() - stamp.getTime()) / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  if (minutes < 1440) {
    return `${Math.round(minutes / 60)} h ago`;
  }

  return stamp.toLocaleDateString();
}
