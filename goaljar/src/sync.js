/* GoalJar Family Sync — OPT-IN device sync (v1.1).
 *
 * Local-only is the default and stays untouched: with sync off, nothing
 * in this file runs and no data ever leaves the device.
 *
 * Model:
 * - Parent-only account (email + password) creates a family; the server
 *   issues a 6-digit family code. Other devices join with the code and
 *   pick a role: one existing kid profile, or "Parent" (parent PIN).
 *   Kid profiles are nickname-only — no kid data beyond the profile the
 *   parent created (name + avatar) is ever collected.
 * - Local records keep their on-device ids (kid1, e5, …). The sync layer
 *   maintains a local<->global UID map so two devices can never collide.
 * - Per-record last-write-wins on updatedAt stamps. Stamps are assigned
 *   when a change is first seen (hooked into the app's save()), not at
 *   sync time, so offline edits keep their true order.
 * - state.plan is NEVER synced: Play Billing stays authoritative on the
 *   device/account that owns the subscription.
 * - Chore safety: parent approval creates a ledger entry tagged with the
 *   chore id; if two devices approve the same chore while offline, the
 *   merge keeps exactly one payment (earliest wins) and tombstones the
 *   duplicate. Auto-posted allowance entries carry a deterministic
 *   timestamp, so double-posts from two devices collapse the same way.
 *
 * Works in Node (module.exports, for tests) and in the browser
 * (window.GoalJarSync facade used by app.js).
 */
(function (root) {
  'use strict';

  var DEFAULT_BASE = 'http://127.0.0.1:9/sync-disabled-in-demo';
  var COLLECTIONS = ['settings', 'kids', 'goals', 'chores', 'allowanceRules', 'spendRequests', 'ledger', 'lessonProgress'];
  var ARRAY_COLLS = ['kids', 'goals', 'chores', 'allowanceRules', 'spendRequests', 'ledger', 'lessonProgress'];
  var PREFIX = { kids: 'kid', goals: 'goal', chores: 'ch', allowanceRules: 'al', spendRequests: 'sr', ledger: 'e', lessonProgress: 'lp' };
  var DELETED = '⌦'; // shadow marker prefix for tombstoned records

  /* ---------------- small utils ---------------- */
  var uidCounter = 0;
  function newUid() {
    uidCounter += 1;
    return 'u' + Date.now().toString(36) + uidCounter.toString(36) +
      Math.floor(Math.random() * 0xffffff).toString(36);
  }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function stableStringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stableStringify(v[k]);
    }).join(',') + '}';
  }
  function hashOf(data, deleted) {
    var s = stableStringify({ d: data === undefined ? null : data, x: deleted ? 1 : 0 });
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(36) + ':' + s.length;
  }

  /* ---------------- meta (sync bookkeeping, kept apart from app state) ---------------- */
  function createMeta() {
    return {
      v: 1, mode: 'local', base: DEFAULT_BASE,
      familyId: null, code: null, token: null, role: null,
      profileUid: null, profileLocalId: null,
      lastSeq: 0, lastSyncAt: 0, lastError: '',
      l2u: {}, u2l: {},       // per collection: localId <-> uid
      xl2u: {}, xu2l: {},     // transfer ids
      shadow: {},             // "coll:uid" -> hash the server is known to hold (or DELETED+ts)
      serverTs: {},           // "coll:uid" -> updatedAt the server is known to hold
      recMeta: {},            // "coll:uid" -> {h, ts} stamp of last local change
      tombstones: {},         // "coll:uid" -> updatedAt, deletions waiting to push
      deletedKeys: {},        // "coll:uid" -> updatedAt, deletions already converged
      pendingIntent: false
    };
  }
  function mapsFor(meta, coll) {
    if (!meta.l2u[coll]) { meta.l2u[coll] = {}; meta.u2l[coll] = {}; }
    return [meta.l2u[coll], meta.u2l[coll]];
  }
  function uidFor(meta, coll, localId) {
    var m = mapsFor(meta, coll);
    if (!m[0][localId]) { var u = newUid(); m[0][localId] = u; m[1][u] = localId; }
    return m[0][localId];
  }
  function localIdForUid(state, meta, coll, uid) {
    var m = mapsFor(meta, coll);
    if (!m[1][uid]) {
      state.seq += 1;
      var id = PREFIX[coll] + state.seq;
      m[1][uid] = id; m[0][id] = uid;
    }
    return m[1][uid];
  }
  function xferUidFor(meta, localTid) {
    if (!meta.xl2u[localTid]) { var u = newUid(); meta.xl2u[localTid] = u; meta.xu2l[u] = localTid; }
    return meta.xl2u[localTid];
  }
  function xferLocalFor(state, meta, uid) {
    if (!meta.xu2l[uid]) {
      state.seq += 1;
      var id = 't' + state.seq;
      meta.xu2l[uid] = id; meta.xl2u[id] = uid;
    }
    return meta.xu2l[uid];
  }

  /* ---------------- record access ---------------- */
  function localKeyOf(coll, rec) {
    if (coll === 'settings') return 'family';
    if (coll === 'lessonProgress') return rec.kidId + '|' + rec.lessonId;
    return rec.id;
  }
  function fallbackTs(coll, rec) {
    if (!rec) return 0;
    if (coll === 'kids' || coll === 'goals') return rec.createdAt || 0;
    if (coll === 'ledger' || coll === 'spendRequests') return rec.ts || 0;
    if (coll === 'lessonProgress') return rec.completedAt || 0;
    if (coll === 'allowanceRules') return rec.createdAtKey ? (Date.parse(rec.createdAtKey + 'T12:00:00') || 0) : 0;
    return 0;
  }
  function settingsData(state) {
    return { currency: state.currency, parentPinHash: state.parentPinHash };
  }
  function eachLocalRecord(state, fn) {
    fn('settings', { id: 'family' }, settingsData(state));
    ARRAY_COLLS.forEach(function (coll) {
      (state[coll] || []).forEach(function (rec) { fn(coll, rec, null); });
    });
  }

  /* ---------------- translation ---------------- */
  function translateOut(state, meta, coll, rec) {
    var d, uid;
    if (coll === 'settings') return settingsData(state);
    if (coll === 'kids') {
      d = clone(rec); d.id = uidFor(meta, 'kids', rec.id); return d;
    }
    if (coll === 'lessonProgress') {
      return { kidId: uidFor(meta, 'kids', rec.kidId), lessonId: rec.lessonId, score: rec.score, completedAt: rec.completedAt };
    }
    d = clone(rec);
    d.id = uidFor(meta, coll, rec.id);
    d.kidId = uidFor(meta, 'kids', rec.kidId);
    if (coll === 'ledger') {
      d.goalId = rec.goalId ? uidFor(meta, 'goals', rec.goalId) : null;
      d.choreId = rec.choreId ? uidFor(meta, 'chores', rec.choreId) : null;
      d.transferId = rec.transferId ? xferUidFor(meta, rec.transferId) : null;
    }
    return d;
  }
  function uidOfLocal(state, meta, coll, rec) {
    if (coll === 'settings') return 'family';
    if (coll === 'lessonProgress') return uidFor(meta, 'kids', rec.kidId) + '|' + rec.lessonId;
    return uidFor(meta, coll, rec.id);
  }
  function translateIn(state, meta, coll, data) {
    var d = clone(data), lid;
    if (coll === 'kids') { d.id = localIdForUid(state, meta, 'kids', data.id); return d; }
    if (coll === 'lessonProgress') {
      d.kidId = localIdForUid(state, meta, 'kids', data.kidId);
      return d;
    }
    lid = localIdForUid(state, meta, coll, data.id);
    d.id = lid;
    d.kidId = localIdForUid(state, meta, 'kids', data.kidId);
    if (coll === 'ledger') {
      d.goalId = data.goalId ? localIdForUid(state, meta, 'goals', data.goalId) : null;
      d.choreId = data.choreId ? localIdForUid(state, meta, 'chores', data.choreId) : null;
      d.transferId = data.transferId ? xferLocalFor(state, meta, data.transferId) : null;
    }
    return d;
  }
  function findLocalIndex(state, coll, localKey) {
    var arr = state[coll] || [];
    for (var i = 0; i < arr.length; i++) {
      if (localKeyOf(coll, arr[i]) === localKey) return i;
    }
    return -1;
  }

  /* ---------------- diff & stamp ----------------
   * Assigns updatedAt stamps to records whose content changed since the
   * last converged sync. Idempotent: re-running without edits changes
   * nothing (stamps move only when the content hash moves).           */
  function diffAndStamp(state, meta, now) {
    now = now || Date.now();
    var seen = {};
    eachLocalRecord(state, function (coll, rec) {
      var uid = uidOfLocal(state, meta, coll, rec);
      var key = coll + ':' + uid;
      seen[key] = true;
      var data = translateOut(state, meta, coll, rec);
      var h = hashOf(data, false);
      if (meta.shadow[key] === h) { delete meta.recMeta[key]; return; }
      var rm = meta.recMeta[key];
      if (!rm || rm.h !== h) {
        // Brand-new record (never synced): stamp it with its own
        // content time. A change to a record the server already knows
        // is a fresh edit: stamp it NOW, so last-write-wins compares
        // edit times, not creation times.
        var known = meta.shadow[key] !== undefined;
        var fb = fallbackTs(coll, coll === 'settings' ? null : rec);
        var ts = known ? Math.max(now, (rm ? rm.ts : 0) + 1) : Math.max(fb, 1);
        meta.recMeta[key] = { h: h, ts: ts };
      }
    });
    // Records that vanished locally since the last sync -> tombstones.
    Object.keys(meta.shadow).forEach(function (key) {
      if (seen[key]) return;
      if (String(meta.shadow[key]).indexOf(DELETED) === 0) return;
      if (key.indexOf('settings:') === 0) return;
      if (!meta.tombstones[key]) meta.tombstones[key] = now;
    });
    return seen;
  }
  function localUpdatedAt(state, meta, coll, rec, uid) {
    var key = coll + ':' + uid;
    var rm = meta.recMeta[key];
    if (rm) return rm.ts;
    return fallbackTs(coll, coll === 'settings' ? null : rec);
  }

  /* ---------------- change collection (the offline queue) ----------------
   * The queue is implicit: anything whose hash differs from the shadow
   * is still owed to the server. A failed sync changes no shadow, so
   * every pending change is retried by the next sync — nothing is lost. */
  function collectChanges(state, meta, now) {
    diffAndStamp(state, meta, now);
    var changes = [];
    eachLocalRecord(state, function (coll, rec) {
      var uid = uidOfLocal(state, meta, coll, rec);
      var key = coll + ':' + uid;
      var data = translateOut(state, meta, coll, rec);
      var h = hashOf(data, false);
      if (meta.shadow[key] !== h) {
        changes.push({ collection: coll, uid: uid, updatedAt: localUpdatedAt(state, meta, coll, rec, uid), deleted: false, data: data });
      }
    });
    Object.keys(meta.tombstones).forEach(function (key) {
      var cut = key.indexOf(':');
      changes.push({ collection: key.slice(0, cut), uid: key.slice(cut + 1), updatedAt: meta.tombstones[key], deleted: true, data: null });
    });
    return changes;
  }
  function snapshotAll(state, meta, now) {
    diffAndStamp(state, meta, now);
    var out = [];
    eachLocalRecord(state, function (coll, rec) {
      var uid = uidOfLocal(state, meta, coll, rec);
      out.push({
        collection: coll, uid: uid,
        updatedAt: localUpdatedAt(state, meta, coll, rec, uid) || (now || Date.now()),
        deleted: false, data: translateOut(state, meta, coll, rec)
      });
    });
    return out;
  }

  /* ---------------- dedupe guards ----------------
   * Runs after every merge (and before pushes). Returns the list of
   * local ledger entries removed; their uids are queued as tombstones.  */
  function dedupeLedger(state, meta, now) {
    now = now || Date.now();
    var removed = [];
    function collapse(groups) {
      Object.keys(groups).forEach(function (g) {
        var list = groups[g];
        if (list.length < 2) return;
        // Winner = earliest entry; ties break on the GLOBAL uid (never
        // the local id — local ids differ per device, so every device
        // must compute the same winner from the same data).
        list.sort(function (a, b) {
          if (a.ts !== b.ts) return a.ts - b.ts;
          var ua = uidFor(meta, 'ledger', a.id), ub = uidFor(meta, 'ledger', b.id);
          return ua < ub ? -1 : 1;
        });
        for (var i = 1; i < list.length; i++) removed.push(list[i]);
      });
    }
    var chorePays = {}, allowance = {};
    state.ledger.forEach(function (e) {
      if (e.source === 'chore' && e.choreId) {
        (chorePays[e.choreId] = chorePays[e.choreId] || []).push(e);
      }
      if (e.source === 'allowance') {
        var k = e.kidId + '|' + e.wallet + '|' + e.ts + '|' + e.amountCents;
        (allowance[k] = allowance[k] || []).push(e);
      }
    });
    collapse(chorePays);
    collapse(allowance);
    if (removed.length) {
      var ids = {};
      removed.forEach(function (e) {
        ids[e.id] = true;
        var uid = uidFor(meta, 'ledger', e.id);
        meta.tombstones['ledger:' + uid] = now;
      });
      state.ledger = state.ledger.filter(function (e) { return !ids[e.id]; });
    }
    return removed;
  }

  /* The family kid-profile cap lives in core (MAX_KIDS) and applies
   * to synced families too. Read it from core when core is loaded
   * (it always is — browser script order and the test suite both load
   * core first); the literal fallback only keeps this file usable
   * standalone. */
  function maxKids() {
    var c = root.GoalJarCore;
    return (c && typeof c.MAX_KIDS === 'number') ? c.MAX_KIDS : 4;
  }

  /* ---------------- merge (last-write-wins per record) ---------------- */
  function applyRemote(state, meta, records, now) {
    now = now || Date.now();
    var order = { settings: 0, kids: 1, goals: 2, chores: 3, allowanceRules: 4, spendRequests: 5, ledger: 6, lessonProgress: 7 };
    var sorted = (records || []).slice().sort(function (a, b) {
      return (order[a.collection] - order[b.collection]) || (a.updatedAt - b.updatedAt);
    });
    var applied = 0;
    sorted.forEach(function (rec) {
      var coll = rec.collection, key = coll + ':' + rec.uid;
      if (coll === 'settings') {
        if (rec.deleted || !rec.data) return;
        var curTs = meta.recMeta[key] ? meta.recMeta[key].ts : 0;
        if (rec.updatedAt >= curTs) {
          state.currency = rec.data.currency || state.currency;
          if (rec.data.parentPinHash) state.parentPinHash = rec.data.parentPinHash;
          meta.shadow[key] = hashOf(settingsData(state), false);
          meta.serverTs[key] = rec.updatedAt;
          meta.recMeta[key] = { h: meta.shadow[key], ts: rec.updatedAt };
          applied++;
        }
        return;
      }
      if (rec.deleted) {
        var delLocalId = null;
        if (coll === 'lessonProgress') {
          var cut = rec.uid.lastIndexOf('|');
          var kidLocal = mapsFor(meta, 'kids')[1][rec.uid.slice(0, cut)];
          delLocalId = kidLocal ? kidLocal + '|' + rec.uid.slice(cut + 1) : null;
        } else {
          delLocalId = mapsFor(meta, coll)[1][rec.uid];
        }
        var delIdx = delLocalId ? findLocalIndex(state, coll, delLocalId) : -1;
        if (delIdx >= 0) {
          var lts = localUpdatedAt(state, meta, coll, state[coll][delIdx], rec.uid);
          if (rec.updatedAt >= lts) {
            state[coll].splice(delIdx, 1);
            meta.deletedKeys[key] = rec.updatedAt;
            meta.shadow[key] = DELETED + rec.updatedAt;
            meta.serverTs[key] = rec.updatedAt;
            delete meta.recMeta[key];
            applied++;
          }
        } else {
          meta.deletedKeys[key] = rec.updatedAt;
          meta.shadow[key] = DELETED + rec.updatedAt;
          meta.serverTs[key] = rec.updatedAt;
        }
        return;
      }
      // Kid-profile cap: a brand-new profile arriving over sync must
      // never push the family past MAX_KIDS (e.g. two parents each
      // added kids while offline — first-synced profiles win, in
      // updatedAt order). "Brand-new" means no local profile with the
      // mapped id — a bare uid mapping can exist without a profile
      // (created when a dependent record, e.g. a ledger entry for a
      // not-yet-adopted kid, was translated in). Updates to profiles
      // this device already has are unaffected. Skipped records stay
      // on the server, unadopted; they are re-offered each sync and
      // adopt if a slot ever frees.
      if (coll === 'kids') {
        var mappedId = mapsFor(meta, 'kids')[1][rec.uid];
        var haveKid = !!mappedId && state.kids.some(function (k) { return k.id === mappedId; });
        if (!haveKid && state.kids.length >= maxKids()) return;
      }
      // Translate first: it registers the uid<->local-id mapping, which
      // the lookup needs (lessonProgress has composite local keys).
      var incoming = translateIn(state, meta, coll, rec.data);
      var idx = findLocalIndex(state, coll, localKeyOf(coll, incoming));
      if (idx < 0) {
        state[coll].push(incoming);
        meta.shadow[key] = hashOf(translateOut(state, meta, coll, incoming), false);
        meta.serverTs[key] = rec.updatedAt;
        meta.recMeta[key] = { h: meta.shadow[key], ts: rec.updatedAt };
        applied++;
        return;
      }
      var local = state[coll][idx];
      var localTs = localUpdatedAt(state, meta, coll, local, rec.uid);
      var remoteHash = hashOf(rec.data, false);
      var localHash = hashOf(translateOut(state, meta, coll, local), false);
      if (remoteHash === localHash) {
        // Same content: converged regardless of stamps.
        meta.shadow[key] = localHash;
        meta.serverTs[key] = Math.max(meta.serverTs[key] || 0, rec.updatedAt);
        return;
      }
      if (rec.updatedAt > localTs || rec.updatedAt === localTs) {
        state[coll][idx] = incoming;
        meta.shadow[key] = hashOf(translateOut(state, meta, coll, incoming), false);
        meta.serverTs[key] = rec.updatedAt;
        meta.recMeta[key] = { h: meta.shadow[key], ts: rec.updatedAt };
        applied++;
      }
      // else: the local copy is newer and unpushed — it stays dirty and
      // wins on the next push (the server compares updatedAt too).
    });
    dedupeLedger(state, meta, now);
    return applied;
  }

  /* Bookkeeping after a successful sync round-trip. The shadow is
   * maintained incrementally (pushes and applyRemote update it), so
   * this only: advances the seq cursor, retires the tombstones that
   * were actually pushed, and prunes stamps that match the shadow.
   * Records with unpushed local edits stay dirty — never converged
   * by fiat — so a newer offline edit can never be silently dropped. */
  function markSynced(state, meta, lastSeq, pushedTombstoneKeys) {
    meta.lastSeq = lastSeq;
    meta.lastSyncAt = Date.now();
    meta.lastError = '';
    (pushedTombstoneKeys || []).forEach(function (key) {
      if (meta.tombstones[key] !== undefined) {
        meta.deletedKeys[key] = meta.tombstones[key];
        meta.shadow[key] = DELETED + meta.tombstones[key];
        meta.serverTs[key] = meta.tombstones[key];
        delete meta.tombstones[key];
      }
    });
    Object.keys(meta.recMeta).forEach(function (key) {
      if (meta.recMeta[key].h === meta.shadow[key]) delete meta.recMeta[key];
    });
  }

  /* Used only by the adopt flows (create / login / join), where the
   * local state was just uploaded wholesale or built purely from the
   * server's records — there, current state IS the converged state.   */
  function convergeShadow(state, meta, lastSeq) {
    meta.lastSeq = lastSeq;
    meta.lastSyncAt = Date.now();
    meta.lastError = '';
    meta.shadow = {};
    meta.serverTs = {};
    eachLocalRecord(state, function (coll, rec) {
      var uid = uidOfLocal(state, meta, coll, rec);
      var key = coll + ':' + uid;
      meta.shadow[key] = hashOf(translateOut(state, meta, coll, rec), false);
      meta.serverTs[key] = localUpdatedAt(state, meta, coll, rec, uid);
    });
    meta.recMeta = {};
    meta.tombstones = {};
    meta.deletedKeys = {};
  }

  function buildShell(settings, localPlan, localPinHash) {
    return {
      version: 1,
      currency: (settings && settings.currency) || 'CAD',
      plan: localPlan || 'free',
      parentPinHash: (settings && settings.parentPinHash) || localPinHash || '',
      seq: 0,
      kids: [], ledger: [], goals: [], chores: [],
      allowanceRules: [], spendRequests: [], lessonProgress: []
    };
  }

  /* ---------------- network client ---------------- */
  function createClient(opts) {
    var meta = opts.meta;
    var fetchFn = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    var getState = opts.getState, setState = opts.setState;
    var persist = opts.persist || function () {};
    if (!fetchFn) throw new Error('Family Sync needs fetch');

    function api(path, body, token, method) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetchFn(meta.base.replace(/\/$/, '') + path, {
        method: method || (body === undefined ? 'GET' : 'POST'),
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (res) {
        return res.text().then(function (text) {
          var json = null;
          try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON */ }
          if (!res.ok) throw new Error((json && json.error) || ('Sync server error (' + res.status + ')'));
          return json;
        });
      });
    }

    var client = {
      meta: meta,

      createFamily: function (email, password) {
        return api('/v1/families', { email: email, password: password }).then(function (res) {
          meta.mode = 'family'; meta.familyId = res.familyId; meta.code = res.code;
          meta.token = res.token; meta.role = 'owner'; meta.profileUid = null; meta.profileLocalId = null;
          meta.lastSeq = 0; meta.shadow = {}; meta.serverTs = {}; meta.recMeta = {}; meta.tombstones = {}; meta.deletedKeys = {};
          var changes = snapshotAll(getState(), meta);
          return api('/v1/sync', { lastSeq: 0, changes: changes }, meta.token).then(function (res2) {
            applyRemote(getState(), meta, (res2.records || []).concat(res2.overrides || []));
            convergeShadow(getState(), meta, res2.lastSeq);
            persist();
            return { code: res.code };
          });
        });
      },

      login: function (email, password) {
        return api('/v1/login', { email: email, password: password }).then(function (res) {
          meta.mode = 'family'; meta.familyId = res.familyId; meta.code = res.code;
          meta.token = res.token; meta.role = 'parent'; meta.profileUid = null; meta.profileLocalId = null;
          return client._pullIntoShell().catch(function (e) {
            // Never leave a device half-connected: if the family data
            // couldn't be pulled, fall back to local mode untouched.
            meta.mode = 'local'; meta.token = null; meta.familyId = null; meta.role = null; meta.code = null;
            persist();
            throw e;
          });
        });
      },

      /* Pull the whole family into a fresh local shell (used by login;
       * join commits its snapshot the same way). Any previous local
       * state is the caller's responsibility to back up first.        */
      _pullIntoShell: function () {
        return api('/v1/sync', { lastSeq: 0, changes: [] }, meta.token).then(function (res) {
          var records = (res.records || []).concat(res.overrides || []);
          var settingsRec = records.filter(function (r) { return r.collection === 'settings' && !r.deleted; })[0];
          var old = getState();
          var shell = buildShell(settingsRec ? settingsRec.data : null, old ? old.plan : 'free', old ? old.parentPinHash : '');
          meta.shadow = {}; meta.serverTs = {}; meta.recMeta = {}; meta.tombstones = {}; meta.deletedKeys = {};
          meta.l2u = {}; meta.u2l = {}; meta.xl2u = {}; meta.xu2l = {};
          setState(shell);
          applyRemote(shell, meta, records);
          convergeShadow(shell, meta, res.lastSeq);
          persist();
          return { kids: shell.kids.length };
        });
      },

      join: function (code, role, profileUid) {
        return api('/v1/families/join', { code: code, role: role, profileUid: profileUid || null }).then(function (res) {
          if (res.needsProfile) return { needsProfile: true, familyId: res.familyId, profiles: res.profiles || [] };
          return {
            familyId: res.familyId, token: res.token, role: res.role,
            profileUid: res.profileUid, snapshot: res.snapshot || [], lastSeq: res.lastSeq
          };
        });
      },

      /* Commit a join() result: adopt the family snapshot as this
       * device's state (caller backs up local data first).            */
      commitJoin: function (joinRes) {
        meta.mode = 'family'; meta.familyId = joinRes.familyId; meta.token = joinRes.token;
        meta.role = joinRes.role; meta.profileUid = joinRes.profileUid || null;
        var old = getState();
        var settingsRec = joinRes.snapshot.filter(function (r) { return r.collection === 'settings' && !r.deleted; })[0];
        var shell = buildShell(settingsRec ? settingsRec.data : null, old ? old.plan : 'free', old ? old.parentPinHash : '');
        meta.shadow = {}; meta.serverTs = {}; meta.recMeta = {}; meta.tombstones = {}; meta.deletedKeys = {};
        meta.l2u = {}; meta.u2l = {}; meta.xl2u = {}; meta.xu2l = {};
        setState(shell);
        applyRemote(shell, meta, joinRes.snapshot);
        convergeShadow(shell, meta, joinRes.lastSeq);
        meta.profileLocalId = joinRes.profileUid ? (mapsFor(meta, 'kids')[1][joinRes.profileUid] || null) : null;
        persist();
        return { kids: shell.kids.length };
      },

      syncNow: function () {
        if (meta.mode !== 'family' || !meta.token) return Promise.resolve({ skipped: true });
        var state = getState();
        var changes = collectChanges(state, meta);
        var pushedTombstones = changes.filter(function (c) { return c.deleted; })
          .map(function (c) { return c.collection + ':' + c.uid; });
        return api('/v1/sync', { lastSeq: meta.lastSeq, changes: changes }, meta.token).then(function (res) {
          var rejected = res.rejected || [];
          // Changes the server refused as out-of-scope for this device's
          // role (e.g. a chore approval pushed from a kid-scoped token):
          // drop brand-new local records the server will never accept so
          // they don't diverge silently; existing records get restored
          // by the overrides/records applied below.
          rejected.forEach(function (rj) {
            if (rj.reason !== 'forbidden' || !rj.collection || !rj.uid) return;
            var key = rj.collection + ':' + rj.uid;
            if (meta.shadow[key]) return; // existed before -> override path handles it
            var localId = mapsFor(meta, rj.collection)[1][rj.uid];
            if (localId) {
              var idx = findLocalIndex(state, rj.collection, localId);
              if (idx >= 0) state[rj.collection].splice(idx, 1);
            }
            delete meta.recMeta[key];
          });
          var applied = applyRemote(state, meta, (res.records || []).concat(res.overrides || []));
          markSynced(state, meta, res.lastSeq, pushedTombstones);
          persist();
          return { pushed: changes.length, applied: applied, rejected: rejected };
        }).catch(function (e) {
          meta.lastError = e.message || 'Sync failed';
          persist();
          throw e;
        });
      },

      disconnect: function () {
        var token = meta.token;
        meta.mode = 'local'; meta.familyId = null; meta.code = null; meta.token = null;
        meta.role = null; meta.profileUid = null; meta.profileLocalId = null;
        meta.lastSeq = 0; meta.shadow = {}; meta.serverTs = {}; meta.recMeta = {}; meta.tombstones = {}; meta.deletedKeys = {};
        persist();
        if (token) {
          return api('/v1/logout', {}, token).catch(function () { /* best effort */ });
        }
        return Promise.resolve();
      },

      /* Self-serve account deletion (Play-required): the server
       * hard-deletes the family, all its records and all device
       * tokens after re-checking the account password. Locally this
       * device then drops back to local-only mode with its on-device
       * copy intact (same as disconnecting) — wiping the device copy
       * too stays the separate "Delete everything" action. If the
       * server call fails (offline, wrong password) nothing changes. */
      deleteFamily: function (password) {
        if (meta.mode !== 'family' || !meta.token) return Promise.reject(new Error('Family Sync is not on for this device.'));
        return api('/v1/families/me', { password: password }, meta.token, 'DELETE').then(function () {
          meta.mode = 'local'; meta.familyId = null; meta.code = null; meta.token = null;
          meta.role = null; meta.profileUid = null; meta.profileLocalId = null;
          meta.lastSeq = 0; meta.shadow = {}; meta.serverTs = {}; meta.recMeta = {}; meta.tombstones = {}; meta.deletedKeys = {};
          meta.l2u = {}; meta.u2l = {}; meta.xl2u = {}; meta.xu2l = {};
          persist();
          return { deleted: true };
        });
      }
    };
    return client;
  }

  /* ---------------- browser facade (used by app.js) ---------------- */
  var facade = null;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    var META_KEY = 'goaljar-sync-v1';
    var meta = createMeta();
    try {
      var rawMeta = localStorage.getItem(META_KEY);
      if (rawMeta) { var parsed = JSON.parse(rawMeta); for (var k in createMeta()) if (parsed[k] !== undefined) meta[k] = parsed[k]; }
    } catch (e) { /* fresh meta */ }
    var hooks = { getState: null, setState: null, save: null, render: null, onSynced: null };
    var client = null, syncing = false, queued = false;
    function persist() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }
    function ensureClient() {
      if (!client) {
        client = createClient({
          meta: meta, persist: persist,
          getState: function () { return hooks.getState(); },
          setState: function (s) { hooks.setState(s); }
        });
      }
      return client;
    }
    facade = {
      meta: meta,
      DEFAULT_BASE: DEFAULT_BASE,
      bind: function (h) {
        hooks = h;
        ensureClient();
        if (meta.pendingIntent) { /* surfaced by the settings card */ }
      },
      status: function () {
        return {
          mode: meta.mode, code: meta.code, role: meta.role,
          profileLocalId: meta.profileLocalId, base: meta.base,
          lastSyncAt: meta.lastSyncAt, lastError: meta.lastError,
          pendingIntent: !!meta.pendingIntent
        };
      },
      setBase: function (url) {
        meta.base = String(url || '').trim() || DEFAULT_BASE;
        persist();
      },
      setPendingIntent: function (v) { meta.pendingIntent = !!v; persist(); },
      /* Called from the app's save(): stamp edits as they happen so
       * offline changes keep true last-write-wins order. No network.  */
      onLocalSave: function (state) {
        if (meta.mode !== 'family' || !state) return;
        try { diffAndStamp(state, meta); persist(); } catch (e) { /* never break saving */ }
      },
      kick: function () {
        if (meta.mode !== 'family' || !hooks.getState) return;
        if (syncing) { queued = true; return; }
        syncing = true;
        ensureClient().syncNow().then(function () {
          syncing = false;
          if (hooks.save) hooks.save();
          if (hooks.onSynced) hooks.onSynced();
          if (hooks.render) hooks.render();
          if (queued) { queued = false; facade.kick(); }
        }).catch(function () {
          syncing = false; // offline: the implicit queue retries next kick
        });
      },
      createFamily: function (email, pw) { return ensureClient().createFamily(email, pw); },
      login: function (email, pw) { return ensureClient().login(email, pw); },
      join: function (code, role, profileUid) { return ensureClient().join(code, role, profileUid); },
      commitJoin: function (jr) { return ensureClient().commitJoin(jr); },
      syncNow: function () { return ensureClient().syncNow(); },
      disconnect: function () { return ensureClient().disconnect(); },
      deleteFamily: function (pw) { return ensureClient().deleteFamily(pw); }
    };
    root.GoalJarSync = facade;
  }

  var api = {
    DEFAULT_BASE: DEFAULT_BASE, COLLECTIONS: COLLECTIONS,
    createMeta: createMeta, stableStringify: stableStringify, hashOf: hashOf,
    diffAndStamp: diffAndStamp, collectChanges: collectChanges, snapshotAll: snapshotAll,
    applyRemote: applyRemote, markSynced: markSynced, convergeShadow: convergeShadow, dedupeLedger: dedupeLedger,
    buildShell: buildShell, translateOut: translateOut, uidOfLocal: uidOfLocal,
    createClient: createClient
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GoalJarSyncCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
