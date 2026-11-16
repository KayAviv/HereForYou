'use strict';
/*
 * HereForYou data layer.
 *
 * Two interchangeable stores behind one async interface:
 *  - PgStore   — used when DATABASE_URL is set (Render/Neon/etc).
 *                One table per collection, payload in JSONB (same approach
 *                as our other apps' PgStore: simple, durable, easy to audit).
 *  - FileStore — local fallback: a single JSON file with atomic writes.
 *                Lets the whole product run and be proven at $0 with no DB.
 *
 * Collections: users, sessions, contacts, medications, doses, checkins,
 *              notes, outbox.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const id = () => crypto.randomUUID();
const COLLECTIONS = ['users', 'sessions', 'contacts', 'medications', 'doses', 'checkins', 'notes', 'outbox'];

/* ------------------------------------------------------------------ */
/* FileStore                                                           */
/* ------------------------------------------------------------------ */
class FileStore {
  constructor(file) {
    this.file = file || process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'hereforyou.json');
    this.db = null;
  }
  async init() {
    try {
      this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.db = {};
    }
    for (const c of COLLECTIONS) if (!Array.isArray(this.db[c])) this.db[c] = [];
  }
  async _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }
  async insert(coll, row) {
    this.db[coll].push(row);
    await this._save();
    return row;
  }
  async find(coll, pred) {
    return this.db[coll].filter(pred);
  }
  async findOne(coll, pred) {
    return this.db[coll].find(pred) || null;
  }
  async update(coll, rowId, patch) {
    const row = this.db[coll].find(r => r.id === rowId);
    if (!row) return null;
    Object.assign(row, patch);
    await this._save();
    return row;
  }
  async remove(coll, pred) {
    const before = this.db[coll].length;
    this.db[coll] = this.db[coll].filter(r => !pred(r));
    if (this.db[coll].length !== before) await this._save();
  }
}

/* ------------------------------------------------------------------ */
/* PgStore                                                             */
/* ------------------------------------------------------------------ */
class PgStore {
  constructor(url) {
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
  }
  async init() {
    for (const c of COLLECTIONS) {
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS hfy_${c} (id TEXT PRIMARY KEY, user_id TEXT, data JSONB NOT NULL, created_at BIGINT NOT NULL)`
      );
      await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_hfy_${c}_user ON hfy_${c} (user_id)`);
    }
  }
  async insert(coll, row) {
    await this.pool.query(
      `INSERT INTO hfy_${coll} (id, user_id, data, created_at) VALUES ($1,$2,$3,$4)`,
      [row.id, row.userId || row.id, JSON.stringify(row), Number(row.createdAt || Date.now())]
    );
    return row;
  }
  async find(coll, pred) {
    const { rows } = await this.pool.query(`SELECT data FROM hfy_${coll}`);
    return rows.map(r => r.data).filter(pred);
  }
  async findOne(coll, pred) {
    const all = await this.find(coll, pred);
    return all[0] || null;
  }
  async update(coll, rowId, patch) {
    const row = await this.findOne(coll, r => r.id === rowId);
    if (!row) return null;
    Object.assign(row, patch);
    await this.pool.query(`UPDATE hfy_${coll} SET data = $2 WHERE id = $1`, [rowId, JSON.stringify(row)]);
    return row;
  }
  async remove(coll, pred) {
    const all = await this.find(coll, pred);
    for (const row of all) await this.pool.query(`DELETE FROM hfy_${coll} WHERE id = $1`, [row.id]);
  }
}

/* ------------------------------------------------------------------ */
/* Store facade — the API the rest of the app uses                     */
/* ------------------------------------------------------------------ */
async function createStore() {
  const impl = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore();
  await impl.init();
  const kind = process.env.DATABASE_URL ? 'postgres' : 'file';
  console.log(`[store] using ${kind} store`);

  const add = (coll) => async (fields) => impl.insert(coll, { id: id(), createdAt: Date.now(), ...fields });
  const byUser = (coll) => async (userId) => impl.find(coll, r => r.userId === userId);
  const del = (coll) => async (userId, rowId) => impl.remove(coll, r => r.id === rowId && r.userId === userId);

  return {
    kind,
    impl,
    /* users */
    createUser: add('users'),
    getUserByEmail: (email) => impl.findOne('users', u => u.email === email),
    getUserById: (userId) => impl.findOne('users', u => u.id === userId),
    getUserByFamilyCode: (code) => impl.findOne('users', u => u.familyCode === code),
    listUsers: () => impl.find('users', () => true),
    updateUser: (userId, patch) => impl.update('users', userId, patch),
    /* sessions */
    createSession: add('sessions'),
    getSession: (token) => impl.findOne('sessions', s => s.token === token),
    deleteSession: (token) => impl.remove('sessions', s => s.token === token),
    /* contacts */
    addContact: add('contacts'),
    listContacts: byUser('contacts'),
    deleteContact: del('contacts'),
    /* medications */
    addMedication: add('medications'),
    listMedications: byUser('medications'),
    deleteMedication: del('medications'),
    /* doses */
    addDose: add('doses'),
    findDose: (userId, medId, scheduledFor) =>
      impl.findOne('doses', d => d.userId === userId && d.medId === medId && d.scheduledFor === scheduledFor),
    listDoses: byUser('doses'),
    updateDose: (doseId, patch) => impl.update('doses', doseId, patch),
    /* checkins */
    addCheckin: add('checkins'),
    listCheckins: byUser('checkins'),
    /* notes (doctor notes + appointments) */
    addNote: add('notes'),
    listNotes: byUser('notes'),
    deleteNote: del('notes'),
    /* sms outbox */
    addOutbox: add('outbox'),
    listOutbox: byUser('outbox'),
  };
}

module.exports = { createStore };
