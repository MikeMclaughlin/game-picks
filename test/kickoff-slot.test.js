'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { kickoffSlot, formatKickoffEst, timeOfDayBucket } = require('../src/kickoff-slot');

test('Wednesday and Saturday kickoffs have their own shade slots', () => {
  assert.equal(kickoffSlot({ kickoff: '2026-09-16T20:15:00-04:00', weekday: 'Wednesday' }), 'slot-wed');
  assert.equal(kickoffSlot({ kickoff: '2026-09-12T13:00:00-04:00', weekday: 'Saturday' }), 'slot-sat');
  assert.equal(kickoffSlot({ kickoff: '2026-09-17T20:15:00-04:00', weekday: 'Thursday' }), 'slot-thu');
  assert.equal(kickoffSlot({ kickoff: '2026-09-13T13:00:00-04:00', weekday: 'Sunday' }), 'slot-sun-1');
  assert.equal(kickoffSlot({ kickoff: '2026-09-13T16:05:00-04:00', weekday: 'Sunday' }), 'slot-sun-4');
  assert.equal(kickoffSlot({ kickoff: '2026-09-13T16:25:00-04:00', weekday: 'Sunday' }), 'slot-sun-4');
  assert.equal(kickoffSlot({ kickoff: '2026-09-13T20:20:00-04:00', weekday: 'Sunday' }), 'slot-sun-n');
  assert.equal(kickoffSlot({ kickoff: '2026-09-14T20:15:00-04:00', weekday: 'Monday' }), 'slot-mon');
});

test('London-style Sunday morning still sits in the early Sunday band', () => {
  assert.equal(kickoffSlot({ kickoff: '2026-09-13T09:30:00-04:00', weekday: 'Sunday' }), 'slot-sun-1');
});

test('ISO-only kickoffs still classify in America/New_York', () => {
  assert.equal(kickoffSlot('2026-09-17T00:15:00Z'), 'slot-wed');
  assert.equal(kickoffSlot('2026-09-18T00:15:00Z'), 'slot-thu');
  assert.equal(kickoffSlot('2026-09-12T17:00:00Z'), 'slot-sat');
  assert.equal(kickoffSlot('2026-09-13T17:00:00Z'), 'slot-sun-1');
  assert.equal(kickoffSlot('2026-09-13T20:05:00Z'), 'slot-sun-4');
  assert.equal(kickoffSlot('2026-09-14T00:20:00Z'), 'slot-sun-n');
  assert.equal(kickoffSlot('2026-09-15T00:15:00Z'), 'slot-mon');
});

test('formatKickoffEst uses New York wall time with a literal EST suffix', () => {
  assert.equal(formatKickoffEst('2024-09-08T17:00:00Z'), '2024-09-08 13:00 EST');
  assert.equal(formatKickoffEst('2024-12-08T18:00:00Z'), '2024-12-08 13:00 EST');
  assert.equal(formatKickoffEst('not-a-date'), '');
});

test('time of day buckets use America/New_York kickoff windows', () => {
  assert.equal(timeOfDayBucket({ kickoff: '2026-09-13T14:59:00Z' }), 'morning');
  assert.equal(timeOfDayBucket({ kickoff: '2026-09-13T15:00:00Z' }), 'early');
  assert.equal(timeOfDayBucket({ kickoff: '2026-09-13T19:59:00Z' }), 'early');
  assert.equal(timeOfDayBucket({ kickoff: '2026-09-13T20:00:00Z' }), 'afternoon');
  assert.equal(timeOfDayBucket({ kickoff: '2026-09-13T22:59:00Z' }), 'afternoon');
  assert.equal(timeOfDayBucket({ kickoff: '2026-09-14T00:00:00Z' }), 'primetime');
  assert.equal(timeOfDayBucket({ kickoff: 'nope' }), 'unknown');
});
