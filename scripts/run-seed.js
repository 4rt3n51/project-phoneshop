// scripts/run-seed.js
const fs = require('fs');
const path = require('path');
const pool = require('../db');

(async function seed() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'infra', 'schema.sql'), 'utf8');
    // crude: run full file (schema + seeds will run)
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log('Seed applied');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed', err);
    process.exit(1);
  }
})();
