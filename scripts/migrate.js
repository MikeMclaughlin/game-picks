'use strict';

const { hasDatabase, getSql } = require('../src/db');
const { ensureSchema } = require('../src/schema');

async function main() {
  if (!hasDatabase()) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const sql = getSql();
  await ensureSchema(sql);
  console.log('schema ready');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
