'use strict';

const fs = require('fs');
const path = require('path');

let ensured = false;

function splitSqlStatements(sqlText) {
  const stripped = sqlText
    .split('\n')
    .map((line) => (line.trim().startsWith('--') ? '' : line))
    .join('\n');
  return stripped
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function ensureSchema(sql) {
  if (!sql) return false;
  if (ensured) return true;
  const file = path.join(__dirname, '..', 'sql', 'schema.sql');
  const text = fs.readFileSync(file, 'utf8');
  const statements = splitSqlStatements(text);
  for (const stmt of statements) {
    try {
      if (typeof sql.query === 'function') await sql.query(stmt);
      else await sql(stmt, []);
    } catch (err) {
      const msg = String(err.message || err);
      if (stmt.toUpperCase().includes('CREATE EXTENSION') && /already exists|permission|not available/i.test(msg)) {
        continue;
      }
      throw err;
    }
  }
  ensured = true;
  return true;
}

function resetEnsureCache() {
  ensured = false;
}

module.exports = { ensureSchema, resetEnsureCache, splitSqlStatements };
