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

function weekdayCode(game, parts) {
  if (parts && parts.weekday) return parts.weekday;
  const raw = game && game.weekday;
  return raw ? String(raw).slice(0, 3).toUpperCase() : '';
}

/**
 * NFL kickoff window shade, light → dark:
 * Thursday night, Sunday ~1pm, Sunday ~4pm, Sunday night, Monday night.
 */
function kickoffSlot(game) {
  const iso = typeof game === 'string' ? game : game && game.kickoff;
  const obj = typeof game === 'object' && game ? game : null;
  const parts = etParts(iso);
  const wd = weekdayCode(obj, parts);
  const minutes = parts && parts.hour != null ? parts.hour * 60 + parts.minute : null;

  if (wd === 'THU' || wd === 'WED') return 'slot-thu';
  if (wd === 'MON' || wd === 'TUE') return 'slot-mon';

  if (minutes != null && minutes >= 19 * 60) return 'slot-sun-n';
  if (minutes != null && minutes >= 15 * 60) return 'slot-sun-4';
  return 'slot-sun-1';
}

module.exports = { kickoffSlot, etParts };
