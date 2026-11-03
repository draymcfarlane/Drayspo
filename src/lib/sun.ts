/** Approximate local sunrise/sunset (in hours, local clock) for a date.
 * Longitude is estimated from the computer's time-zone offset; latitude defaults to the Caribbean (~19°N). */
export function sunTimes(date: Date, lat = 19.3, lon?: number) {
  const tz = -date.getTimezoneOffset() / 60; // hours ahead of UTC, includes DST
  const lng = lon ?? tz * 15;
  const start = new Date(date.getFullYear(), 0, 0);
  const n = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const rad = Math.PI / 180;
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (n + 10));
  const b = rad * (360 / 365) * (n - 81);
  const eot = (9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)) / 60; // hours
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.cos(decl * rad));
  const half = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad / 15;
  const noon = 12 + tz - lng / 15 - eot;
  return { sunrise: noon - half, sunset: noon + half };
}

export function isDaytime(date: Date, lat?: number, lon?: number) {
  const { sunrise, sunset } = sunTimes(date, lat, lon);
  const h = date.getHours() + date.getMinutes() / 60;
  return h >= sunrise && h < sunset;
}
