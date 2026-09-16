'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { kickoffSlot } = require('../src/kickoff-slot');

test('kickoff windows map weekday/time in ET light → dark', () => {
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
  assert.equal(kickoffSlot('2026-09-17T00:15:00Z'), 'slot-thu');
  assert.equal(kickoffSlot('2026-09-13T17:00:00Z'), 'slot-sun-1');
  assert.equal(kickoffSlot('2026-09-13T20:05:00Z'), 'slot-sun-4');
  assert.equal(kickoffSlot('2026-09-14T00:20:00Z'), 'slot-sun-n');
  assert.equal(kickoffSlot('2026-09-15T00:15:00Z'), 'slot-mon');
});
