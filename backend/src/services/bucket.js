/**
 * Floor a date to the nearest 6h bucket in Europe/Paris timezone.
 * Buckets: 00:00, 06:00, 12:00, 18:00 Paris time.
 * Returns ISO string of the bucket start.
 *
 * NOTE: Relies on Intl.DateTimeFormat with timeZone: 'Europe/Paris'.
 * The Node process MUST have TZ=Europe/Paris set (done in docker-compose.yml)
 * for correct DST-aware offset calculation.
 */
function floorTo6hBucket(date) {
  // Extract date/time components in Europe/Paris timezone using the
  // reliable Intl.DateTimeFormat API (not toLocaleString + new Date(string)).
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => {
    const part = parts.find((p) => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };

  const year = get('year');
  const month = get('month');       // 1–12
  const day = get('day');
  const hour = get('hour');
  const bucketHour = Math.floor(hour / 6) * 6;

  // Construct a UTC Date from the Paris components.
  // This yields a deterministic ISO string that uniquely identifies
  // the 6h window (the offset shift cancels out on round-trip via
  // toLocaleDateString with timeZone: 'Europe/Paris').
  const bucket = new Date(Date.UTC(year, month - 1, day, bucketHour, 0, 0, 0));
  return bucket.toISOString();
}

module.exports = { floorTo6hBucket };
