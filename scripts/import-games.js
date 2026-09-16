'use strict';

const { hasDatabase, getSql } = require('../src/db');
const { ensureSchema } = require('../src/schema');
const { importGames, defaultSeasons } = require('../src/nfl-data');
const { seasonsFromYear } = require('../src/seasons');

async function main() {
  const seasonsArg = process.argv.find((a) => a.startsWith('--seasons='));
  const seedOnly = process.argv.includes('--seed-only');
  const from2010 = process.argv.includes('--from-2010');
  const from2016 = process.argv.includes('--from-2016');
  let seasons = defaultSeasons();
  if (from2010) seasons = seasonsFromYear(2010);
  else if (from2016) seasons = seasonsFromYear(2016);
  if (seasonsArg) {
    seasons = seasonsArg
      .slice('--seasons='.length)
      .split(',')
      .map((s) => Number(s.trim()))
      .filter(Boolean);
  }
  if (!hasDatabase()) {
    const result = await importGames(null, { seasons, seedOnly: true, grade: false });
    console.log(JSON.stringify({ ...result, note: 'No DATABASE_URL; loaded bundled games only' }, null, 2));
    return;
  }
  const sql = getSql();
  await ensureSchema(sql);
  const result = await importGames(sql, { seasons, seedOnly });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
