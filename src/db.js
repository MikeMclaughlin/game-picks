'use strict';

const { neon } = require('@neondatabase/serverless');

let sql = null;
let initError = null;

function databaseUrl() {
  return process.env.DATABASE_URL || '';
}

function hasDatabase() {
  return Boolean(databaseUrl());
}

function getSql() {
  if (!hasDatabase()) return null;
  if (sql) return sql;
  try {
    sql = neon(databaseUrl(), { fetchOptions: { cache: 'no-store' } });
    return sql;
  } catch (err) {
    initError = err;
    throw err;
  }
}

async function ping() {
  if (!hasDatabase()) return { ok: false, reason: 'DATABASE_URL is not set' };
  try {
    const client = getSql();
    const rows = await client`SELECT 1 AS ok`;
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { hasDatabase, getSql, ping, initError: () => initError };
