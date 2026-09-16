'use strict';

function normalizeUsername(raw) {
  if (raw == null) return '';
  return String(raw).normalize('NFKC').trim().toLowerCase();
}

function displayUsername(raw) {
  if (raw == null) return '';
  return String(raw).normalize('NFKC').trim();
}

function assertUsername(raw) {
  const display = displayUsername(raw);
  const norm = normalizeUsername(raw);
  if (!norm) {
    const err = new Error('Username is required');
    err.statusCode = 400;
    throw err;
  }
  if (display.length > 32) {
    const err = new Error('Username must be 32 characters or fewer');
    err.statusCode = 400;
    throw err;
  }
  if (!/^[\p{L}\p{N}_.\- ]+$/u.test(display)) {
    const err = new Error('Username may contain letters, numbers, spaces, _, ., and -');
    err.statusCode = 400;
    throw err;
  }
  return { display, norm };
}

module.exports = { normalizeUsername, displayUsername, assertUsername };
