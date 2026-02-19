// scripts/run-migrations.js
const fs = require('fs');
const path = require('path');
const pool = require('../db');

(async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'infra', 'schema.sql'), 'utf8');
    // MySQL library supports multi statements if enabled; use split for simplicity
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log('Migrations applied');
    process.exit(0);
  } catch (err) {
    console.error('Migrations failed', err);
    process.exit(1);
  }
})();
