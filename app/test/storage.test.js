const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStorage } = require('../storage');

function tempStorage(seed = [{ id: 1, name: 'Seed' }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-storage-'));
  const seedFile = path.join(root, 'seed.json');
  fs.writeFileSync(seedFile, JSON.stringify(seed), 'utf8');
  const storage = createStorage({ dataDir: path.join(root, 'data'), seedFile, backupLimit: 3 });
  return { root, storage };
}

test('storage seeds SQLite from existing Atlas JSON data', () => {
  const { root, storage } = tempStorage();
  try {
    assert.deepEqual(storage.read(), [{ id: 1, name: 'Seed' }]);
    assert.equal(storage.health().ok, true);
    assert.ok(fs.existsSync(storage.paths.dbFile));
  } finally {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('storage writes persist and create a pre-write JSON backup', () => {
  const { root, storage } = tempStorage();
  try {
    storage.write([{ id: 1, name: 'Updated' }]);
    assert.deepEqual(storage.read(), [{ id: 1, name: 'Updated' }]);
    const backups = fs.readdirSync(storage.paths.backupDir).filter(name => name.endsWith('.json'));
    assert.equal(backups.length, 1);
    const previous = JSON.parse(fs.readFileSync(path.join(storage.paths.backupDir, backups[0]), 'utf8'));
    assert.deepEqual(previous, [{ id: 1, name: 'Seed' }]);
  } finally {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('storage retains only the configured number of backups', async () => {
  const { root, storage } = tempStorage();
  try {
    for (let i = 0; i < 5; i += 1) {
      storage.write([{ id: 1, name: `Version ${i}` }]);
      await new Promise(resolve => setTimeout(resolve, 3));
    }
    const backups = fs.readdirSync(storage.paths.backupDir).filter(name => name.endsWith('.json'));
    assert.equal(backups.length, 3);
  } finally {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persistence sentinel survives storage reopen in the same data directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-persistence-'));
  const seedFile = path.join(root, 'seed.json');
  const dataDir = path.join(root, 'data');
  fs.writeFileSync(seedFile, JSON.stringify([{ id: 1, name: 'Seed' }]), 'utf8');
  let first;
  let second;
  try {
    first = createStorage({ dataDir, seedFile });
    const firstId = first.health().persistence_instance_id;
    assert.ok(firstId);
    first.close();
    first = null;

    second = createStorage({ dataDir, seedFile });
    assert.equal(second.health().persistence_instance_id, firstId);
    assert.ok(fs.existsSync(second.paths.sentinelFile));
  } finally {
    if (first) first.close();
    if (second) second.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
