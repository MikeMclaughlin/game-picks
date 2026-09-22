'use strict';

const TZ = 'America/New_York';

function etParts(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  const get = (type) => {
    const row = parts.find((p) => p.type === type);
    return row ? row.value : '';
  };
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  return {
    weekday: String(get('weekday')).slice(0, 3).toUpperCase(),
    hour: Number.isFinite(hour) ? hour : null,
    minute: Number.isFinite(minute) ? minute : 0
  };
}

/**
 * Kickoff as America/New_York wall time with a literal EST suffix
 * (even during daylight saving). Example: 2024-09-08 13:00 EST.
 */
function formatKickoffEst(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  const get = (type) => {
    const row = parts.find((p) => p.type === type);
    return row ? row.value : '';
  };
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!year || !month || !day) return '';
  const hour = String(get('hour') || '0').padStart(2, '0');
  const minute = String(get('minute') || '0').padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute} EST`;
}

function weekdayCode(game, parts) {
  if (parts && parts.weekday) return parts.weekday;
  const raw = game && game.weekday;
  return raw ? String(raw).slice(0, 3).toUpperCase() : '';
}

/**
 * NFL kickoff window shade, light → dark across the week:
 * Wednesday, Thursday, Saturday, Sunday ~1pm, Sunday ~4pm, Sunday night, Monday night.
 */
function kickoffSlot(game) {
  const iso = typeof game === 'string' ? game : game && game.kickoff;
  const obj = typeof game === 'object' && game ? game : null;
  const parts = etParts(iso);
  const wd = weekdayCode(obj, parts);
  const minutes = parts && parts.hour != null ? parts.hour * 60 + parts.minute : null;

  if (wd === 'WED') return 'slot-wed';
  if (wd === 'THU') return 'slot-thu';
  if (wd === 'SAT' || wd === 'FRI') return 'slot-sat';
  if (wd === 'MON' || wd === 'TUE') return 'slot-mon';

  if (minutes != null && minutes >= 19 * 60) return 'slot-sun-n';
  if (minutes != null && minutes >= 15 * 60) return 'slot-sun-4';
  return 'slot-sun-1';
}

/**
 * Kickoff window in America/New_York.
 * morning: before 11:00
 * early: 11:00 inclusive through before 16:00 (1pm slate)
 * afternoon: 16:00 inclusive through before 19:00 (4:00–4:15 and other late kicks)
 * primetime: 19:00 and later
 */
function timeOfDayBucket(game) {
  const iso = typeof game === 'string' ? game : game && (game.kickoff || game);
  const parts = etParts(iso);
  if (!parts || parts.hour == null) return 'unknown';
  const minutes = parts.hour * 60 + (parts.minute || 0);
  if (minutes < 11 * 60) return 'morning';
  if (minutes < 16 * 60) return 'early';
  if (minutes < 19 * 60) return 'afternoon';
  return 'primetime';
}

module.exports = { kickoffSlot, etParts, formatKickoffEst, timeOfDayBucket };
