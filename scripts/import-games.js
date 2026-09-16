'use strict';

const { hasDatabase, getSql } = require('../src/db');
const { ensureSchema } = require('../src/schema');
const { importGames, defaultSeasons } = require('../src/nfl-data');

async function main() {
  const seasonsArg = process.argv.find((a) => a.startsWith('--seasons='));
  const seedOnly = process.argv.includes('--seed-only');
  const from2010 = process.argv.includes('--from-2010');
  let seasons = defaultSeasons();
  if (from2010) {
    const end = seasons[seasons.length - 1];
    seasons = [];
    for (let y = 2010; y <= end; y += 1) seasons.push(y);
  }
  if (seasonsArg) {
    seasons = seasonsArg
      .slice('--seasons='.length)
      .split(',')
      .map((s) => Number(s.trim()))
      .filter(Boolean);
  }
  if (!hasDatabase()) {
    const result = await importGames(null, { seasons, seedOnly: true });
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
