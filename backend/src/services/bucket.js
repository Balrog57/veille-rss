/**
 * Floor a date to the nearest 6h bucket in the configured timezone.
 * Buckets: 00:00, 06:00, 12:00, 18:00 (any timezone, configurable).
 * Returns an ISO string of the bucket start, expressed as the true UTC
 * Instant that corresponds to that wall-clock (so formatting it with
 * the same timeZone yields back the expected HH:00).
 */
function floorTo6hBucket(date, timeZone) {
  const tz = timeZone || require('./settings').get().timezone || 'Europe/Paris';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
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
  const month = get('month');       // 1-12
  const day = get('day');
  const hour = get('hour') === 24 ? 0 : get('hour');  // Intl can return "24" at midnight
  const bucketHour = Math.floor(hour / 6) * 6;

  // Provisional date built from the wall-clock components as if UTC.
  const provisional = new Date(Date.UTC(year, month - 1, day, bucketHour, 0, 0, 0));

  // Get the timezone UTC offset (e.g. "+02:00" or "+01:00") for the bucket
  // wall-clock, via Intl longOffset. Falls back to "+01:00" if parsing fails.
  const offsetStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  }).formatToParts(provisional).find((p) => p.type === 'timeZoneName')?.value || 'GMT+01:00';
  const m = offsetStr.match(/([+-])(\d{2}):(\d{2})/);
  const offsetMinutes = m
    ? (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
    : 60; // default CET

  const bucket = new Date(provisional.getTime() - offsetMinutes * 60 * 1000);
  return bucket.toISOString();
}

module.exports = { floorTo6hBucket };
