const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_DATA_DIR = path.join(__dirname, 'runtime-data');
const DEFAULT_SEED_FILE = path.join(__dirname, 'data', 'opportunities.json');
const BACKUP_LIMIT = Math.max(5, Number(process.env.ATLAS_BACKUP_LIMIT || 50));
const INSTANCE_SENTINEL = 'atlas-instance.json';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function createStorage(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.ATLAS_DATA_DIR || DEFAULT_DATA_DIR);
  const seedFile = path.resolve(options.seedFile || process.env.ATLAS_SEED_FILE || DEFAULT_SEED_FILE);
  const dbFile = path.resolve(options.dbFile || process.env.ATLAS_DB_FILE || path.join(dataDir, 'atlas.sqlite'));
  const backupDir = path.resolve(options.backupDir || process.env.ATLAS_BACKUP_DIR || path.join(dataDir, 'backups'));
  const backupLimit = Math.max(1, Number(options.backupLimit || BACKUP_LIMIT));

  ensureDir(path.dirname(dbFile));
  ensureDir(backupDir);

  const sentinelFile = path.join(dataDir, INSTANCE_SENTINEL);
  let sentinel;
  if (fs.existsSync(sentinelFile)) {
    sentinel = JSON.parse(fs.readFileSync(sentinelFile, 'utf8'));
  } else {
    sentinel = {
      instance_id: require('node:crypto').randomUUID(),
      created_at: new Date().toISOString()
    };
    fs.writeFileSync(sentinelFile, `${JSON.stringify(sentinel, null, 2)}\n`, 'utf8');
  }

  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA synchronous=FULL;');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS atlas_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const selectState = db.prepare('SELECT value, updated_at FROM atlas_state WHERE key = ?');
  const upsertState = db.prepare(`
    INSERT INTO atlas_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  function validateOpportunities(value) {
    if (!Array.isArray(value)) throw new Error('Atlas opportunity data must be an array.');
    return value;
  }

  function seedIfNeeded() {
    if (selectState.get('opportunities')) return;
    const seed = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : [];
    validateOpportunities(seed);
    upsertState.run('opportunities', JSON.stringify(seed), new Date().toISOString());
  }

  function read() {
    seedIfNeeded();
    const row = selectState.get('opportunities');
    return validateOpportunities(JSON.parse(row.value));
  }

  function pruneBackups() {
    const files = fs.readdirSync(backupDir)
      .filter(name => /^opportunities-.*\.json$/.test(name))
      .map(name => ({ name, full: path.join(backupDir, name), mtime: fs.statSync(path.join(backupDir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const file of files.slice(backupLimit)) fs.rmSync(file.full, { force: true });
  }

  function backupCurrent() {
    const current = read();
    const file = path.join(backupDir, `opportunities-${timestampForFile()}.json`);
    fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    pruneBackups();
    return file;
  }

  function write(value) {
    validateOpportunities(value);
    backupCurrent();
    const serialized = JSON.stringify(value);
    db.exec('BEGIN IMMEDIATE;');
    try {
      upsertState.run('opportunities', serialized, new Date().toISOString());
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  function health() {
    try {
      const row = db.prepare("SELECT COUNT(*) AS count FROM atlas_state").get();
      const data = read();
      return {
        ok: true,
        engine: 'sqlite',
        state_rows: Number(row.count || 0),
        opportunity_count: data.length,
        writable: fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory(),
        data_dir: dataDir,
        db_file: dbFile,
        sentinel_file: sentinelFile,
        persistence_instance_id: sentinel.instance_id,
        persistence_created_at: sentinel.created_at,
        persistence_required: process.env.ATLAS_REQUIRE_PERSISTENCE === 'true'
      };
    } catch (error) {
      return { ok: false, engine: 'sqlite', error: error.message, data_dir: dataDir, db_file: dbFile, sentinel_file: sentinelFile };
    }
  }

  function close() {
    db.close();
  }

  seedIfNeeded();
  return { read, write, health, backupCurrent, close, paths: { dataDir, dbFile, backupDir, seedFile, sentinelFile } };
}

module.exports = { createStorage };
