'use strict';

const { hasDatabase, getSql } = require('../src/db');
const { ensureSchema } = require('../src/schema');
const { gradeAll } = require('../src/grader');

async function main() {
  if (!hasDatabase()) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const sql = getSql();
  await ensureSchema(sql);
  const result = await gradeAll(sql);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
