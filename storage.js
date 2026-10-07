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

  function validateRadarCandidates(value) {
    if (!Array.isArray(value)) throw new Error('Atlas radar candidate data must be an array.');
    return value;
  }

  function validateDiscoveryRuns(value) {
    if (!Array.isArray(value)) throw new Error('Atlas discovery run data must be an array.');
    return value;
  }

  function validateTravelState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Atlas travel data must be an object.');
    if (!Array.isArray(value.trips)) throw new Error('Atlas travel trips must be an array.');
    return value;
  }

  function seedIfNeeded() {
    if (selectState.get('opportunities')) return;
    const seed = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : [];
    validateOpportunities(seed);
    upsertState.run('opportunities', JSON.stringify(seed), new Date().toISOString());
    if (!selectState.get('radar_candidates')) upsertState.run('radar_candidates', '[]', new Date().toISOString());
    if (!selectState.get('discovery_runs')) upsertState.run('discovery_runs', '[]', new Date().toISOString());
    if (!selectState.get('travel')) {
      const { emptyTravelState } = require('./travel');
      upsertState.run('travel', JSON.stringify(emptyTravelState()), new Date().toISOString());
    }
  }

  function read() {
    seedIfNeeded();
    if (!selectState.get('radar_candidates')) upsertState.run('radar_candidates', '[]', new Date().toISOString());
    const row = selectState.get('opportunities');
    return validateOpportunities(JSON.parse(row.value));
  }

  function readRadar() {
    seedIfNeeded();
    if (!selectState.get('radar_candidates')) upsertState.run('radar_candidates', '[]', new Date().toISOString());
    const row = selectState.get('radar_candidates');
    return validateRadarCandidates(JSON.parse(row.value));
  }

  function writeRadar(value) {
    validateRadarCandidates(value);
    const serialized = JSON.stringify(value);
    db.exec('BEGIN IMMEDIATE;');
    try {
      upsertState.run('radar_candidates', serialized, new Date().toISOString());
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }


  function readDiscoveryRuns() {
    seedIfNeeded();
    if (!selectState.get('discovery_runs')) upsertState.run('discovery_runs', '[]', new Date().toISOString());
    const row = selectState.get('discovery_runs');
    return validateDiscoveryRuns(JSON.parse(row.value));
  }

  function writeDiscoveryRuns(value) {
    validateDiscoveryRuns(value);
    const serialized = JSON.stringify(value);
    db.exec('BEGIN IMMEDIATE;');
    try {
      upsertState.run('discovery_runs', serialized, new Date().toISOString());
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
  }

  function readTravel() {
    seedIfNeeded();
    const row = selectState.get('travel');
    return validateTravelState(JSON.parse(row.value));
  }

  function writeTravel(value) {
    validateTravelState(value);
    const serialized = JSON.stringify(value);
    db.exec('BEGIN IMMEDIATE;');
    try {
      upsertState.run('travel', serialized, new Date().toISOString());
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
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
        radar_candidate_count: readRadar().length,
        discovery_run_count: readDiscoveryRuns().length,
        travel_trip_count: readTravel().trips.length,
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
  return { read, write, readRadar, writeRadar, readDiscoveryRuns, writeDiscoveryRuns, readTravel, writeTravel, health, backupCurrent, close, paths: { dataDir, dbFile, backupDir, seedFile, sentinelFile } };
}

module.exports = { createStorage };
