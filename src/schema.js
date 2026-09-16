'use strict';

const fs = require('fs');
const path = require('path');

let ensured = false;

const SCHEMA_SQL = fs.existsSync(path.join(__dirname, 'schema.sql'))
  ? fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  : fs.existsSync(path.join(__dirname, '..', 'sql', 'schema.sql'))
    ? fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8')
    : '';

function splitSqlStatements(sqlText) {
  const stripped = String(sqlText || '')
    .split('\n')
    .map((line) => (line.trim().startsWith('--') ? '' : line))
    .join('\n');
  return stripped
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadSchemaSql() {
  const paths = [
    path.join(__dirname, 'schema.sql'),
    path.join(__dirname, '..', 'sql', 'schema.sql'),
    path.join(process.cwd(), 'src', 'schema.sql'),
    path.join(process.cwd(), 'sql', 'schema.sql')
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  return SCHEMA_SQL;
}

async function execSql(sql, text, params = []) {
  if (!sql) throw new Error('No database client');
  if (typeof sql.query === 'function') return sql.query(text, params);
  return sql(text, params);
}

async function ensureSchema(sql) {
  if (!sql) return false;
  if (ensured) return true;
  const text = loadSchemaSql();
  if (!text) throw new Error('schema.sql was not bundled with the server');
  const statements = splitSqlStatements(text);
  for (const stmt of statements) {
    try {
      await execSql(sql, stmt, []);
    } catch (err) {
      const msg = String(err.message || err);
      if (/already exists|permission|not available|extension/i.test(msg) && /CREATE EXTENSION/i.test(stmt)) {
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

module.exports = { ensureSchema, resetEnsureCache, splitSqlStatements, loadSchemaSql, execSql };
