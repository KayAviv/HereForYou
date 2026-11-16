/* GoalJar core engine — pure, dependency-free.
 * Works in Node (module.exports) and in the browser (window.GoalJarCore).
 *
 * Model rules (from the locked scope):
 * - Virtual money only. All amounts are integer cents (CAD by default).
 * - Append-only ledger per kid across Spend / Save / Give wallets.
 *   Balances are ALWAYS derived by summing ledger entries — never stored.
 * - Kids have no accounts/credentials; a parent PIN gates parent mode,
 *   kid profiles may carry an optional kid PIN.
 * - Kid profiles: up to MAX_KIDS (4) per family on EVERY plan — free
 *   and premium alike (Kay's call, 2026-11-11; was a premium unlock).
 * - Free tier: 2 active goals per kid, first 10 lessons.
 *   Premium (placeholder in v1): unlimited goals/lessons.
 */
(function (root) {
  'use strict';

  // Hard cap on kid profiles per family/parent account. Applies to
  // every plan; also enforced on the Family Sync merge path (sync.js
  // reads this constant) so synced profiles can't push past it.
  var MAX_KIDS = 4;
  var FREE = { kids: MAX_KIDS, goalsPerKid: 2, lessons: 10 };
  var PREMIUM = { kids: MAX_KIDS, goalsPerKid: Infinity, lessons: Infinity };
  var WALLETS = ['spend', 'save', 'give'];

  /* ---------- tiny helpers ---------- */

  // Deliberately simple PIN hash for the on-device prototype (PINs never
  // leave the device; this is a family gate, not a bank vault).
  function hashPin(pin) {
    var h = 5381, s = 'goaljar:' + String(pin);
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(36);
  }

  function fmtMoney(cents, currency) {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency', currency: currency || 'CAD'
    }).format(cents / 100);
  }

  function dateKey(d) { // local YYYY-MM-DD
    var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), dd = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + dd;
  }

  function weekKey(d) { // ISO-ish week key: YYYY-Www (Mon-start)
    var date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = (date.getDay() + 6) % 7; // Mon=0
    date.setDate(date.getDate() - day + 3); // Thursday of this week
    var firstThu = new Date(date.getFullYear(), 0, 4);
    var fday = (firstThu.getDay() + 6) % 7;
    firstThu.setDate(firstThu.getDate() - fday + 3);
    var week = 1 + Math.round((date - firstThu) / (7 * 24 * 3600 * 1000));
    return date.getFullYear() + '-W' + ('0' + week).slice(-2);
  }

  function limits(state) { return state.plan === 'premium' ? PREMIUM : FREE; }

  /* ---------- state ---------- */

  function createState(parentPin) {
    if (!/^\d{4,8}$/.test(String(parentPin))) throw new Error('Parent PIN must be 4–8 digits');
    return {
      version: 1,
      currency: 'CAD',
      plan: 'free', // 'free' | 'premium' — billing is a placeholder in v1
      parentPinHash: hashPin(parentPin),
      seq: 0,
      kids: [],        // {id,name,avatar,color,ageBand,kidPinHash|null,createdAt}
      ledger: [],      // {id,kidId,wallet,amountCents,category,note,source,ts,goalId?,transferId?,reflection?}
      goals: [],       // {id,kidId,name,icon,targetCents,targetDate|null,createdAt,done}
      chores: [],      // {id,kidId,title,valueCents,status: open|pending|paid,rejectedCount}
      allowanceRules: [], // {id,kidId,amountCents,dayOfWeek,split:{spend,save,give},active,createdAtKey,lastPostedFor}
      spendRequests: [],  // {id,kidId,amountCents,note,status: pending|approved|declined,ts}
      lessonProgress: []  // {kidId,lessonId,score,completedAt}
    };
  }

  function nextId(state, prefix) { state.seq += 1; return prefix + state.seq; }

  function getKid(state, kidId) {
    var k = state.kids.filter(function (x) { return x.id === kidId; })[0];
    if (!k) throw new Error('No such kid: ' + kidId);
    return k;
  }

  /* ---------- PIN gates ---------- */

  function verifyParentPin(state, pin) { return state.parentPinHash === hashPin(pin); }
  function setParentPin(state, oldPin, newPin) {
    if (!verifyParentPin(state, oldPin)) throw new Error('Current parent PIN is wrong');
    if (!/^\d{4,8}$/.test(String(newPin))) throw new Error('Parent PIN must be 4–8 digits');
    state.parentPinHash = hashPin(newPin);
  }
  function verifyKidPin(kid, pin) {
    if (!kid.kidPinHash) return true; // no kid PIN set → open
    return kid.kidPinHash === hashPin(pin);
  }

  /* ---------- kids ---------- */

  var AVATARS = ['🦊', '🐼', '🦁', '🐸', '🦄', '🐙', '🦉', '🐯', '🐨', '🦋'];
  var COLORS = ['#ff8a5c', '#4ecdc4', '#ffd93d', '#6c9bff', '#ff6b9d', '#95d86e', '#b28dff', '#ff7070'];

  function addKid(state, opts) {
    if (state.kids.length >= MAX_KIDS) {
      throw new Error('GoalJar families can hold up to ' + MAX_KIDS + ' kids');
    }
    if (!opts || !String(opts.name || '').trim()) throw new Error('Kid needs a first name');
    var kid = {
      id: nextId(state, 'kid'),
      name: String(opts.name).trim().slice(0, 20),
      avatar: AVATARS.indexOf(opts.avatar) >= 0 ? opts.avatar : '🦊',
      color: COLORS.indexOf(opts.color) >= 0 ? opts.color : COLORS[state.kids.length % COLORS.length],
      ageBand: opts.ageBand === '9-12' ? '9-12' : '6-9',
      kidPinHash: opts.kidPin ? hashPin(opts.kidPin) : null,
      createdAt: Date.now()
    };
    state.kids.push(kid);
    return kid;
  }

  /* ---------- ledger (append-only) ---------- */

  function postEntry(state, kidId, wallet, amountCents, opts) {
    getKid(state, kidId);
    if (WALLETS.indexOf(wallet) < 0) throw new Error('Unknown wallet: ' + wallet);
    if (!Number.isInteger(amountCents) || amountCents === 0) throw new Error('Amount must be a non-zero whole number of cents');
    opts = opts || {};
    var e = {
      id: nextId(state, 'e'),
      kidId: kidId, wallet: wallet, amountCents: amountCents,
      category: opts.category || 'Other',
      note: opts.note || '',
      source: opts.source || 'manual',
      ts: opts.ts || Date.now(),
      goalId: opts.goalId || null,
      transferId: opts.transferId || null,
      choreId: opts.choreId || null,
      reflection: opts.reflection || null
    };
    state.ledger.push(e);
    return e;
  }

  function balance(state, kidId, wallet) {
    return state.ledger.reduce(function (sum, e) {
      return (e.kidId === kidId && e.wallet === wallet) ? sum + e.amountCents : sum;
    }, 0);
  }
  function totalBalance(state, kidId) {
    return WALLETS.reduce(function (s, w) { return s + balance(state, kidId, w); }, 0);
  }
  function kidEntries(state, kidId) {
    return state.ledger.filter(function (e) { return e.kidId === kidId; })
      .slice().sort(function (a, b) { return a.ts - b.ts; });
  }

  function logIncome(state, kidId, wallet, amountCents, opts) {
    if (amountCents <= 0) throw new Error('Income must be positive');
    opts = opts || {};
    return postEntry(state, kidId, wallet, amountCents, {
      category: opts.category || 'Gift', note: opts.note || '',
      source: opts.source || 'gift', ts: opts.ts
    });
  }

  function logSpend(state, kidId, amountCents, opts) {
    opts = opts || {};
    if (amountCents <= 0) throw new Error('Spend must be positive');
    if (balance(state, kidId, 'spend') < amountCents) throw new Error('Not enough in the Spend jar');
    var reflection = null;
    if (opts.needWant === 'need' || opts.needWant === 'want') {
      reflection = { needWant: opts.needWant, worthIt: opts.worthIt || null };
    }
    return postEntry(state, kidId, 'spend', -amountCents, {
      category: opts.category || 'Treats', note: opts.note || '',
      source: 'spend', ts: opts.ts, reflection: reflection
    });
  }

  function transfer(state, kidId, from, to, amountCents, opts) {
    opts = opts || {};
    if (from === to) throw new Error('Pick two different jars');
    if (amountCents <= 0) throw new Error('Transfer must be positive');
    if (balance(state, kidId, from) < amountCents) throw new Error('Not enough in that jar');
    var tid = nextId(state, 't');
    postEntry(state, kidId, from, -amountCents, { category: 'Move money', source: 'transfer', transferId: tid, ts: opts.ts, note: opts.note || '' });
    postEntry(state, kidId, to, amountCents, { category: 'Move money', source: 'transfer', transferId: tid, ts: opts.ts, note: opts.note || '' });
    return tid;
  }

  /* ---------- goals ---------- */

  function addGoal(state, kidId, opts) {
    getKid(state, kidId);
    var lim = limits(state);
    var active = state.goals.filter(function (g) { return g.kidId === kidId && !g.done; }).length;
    if (active >= lim.goalsPerKid) {
      throw new Error('Free plan allows ' + lim.goalsPerKid + ' goals per kid — Premium unlocks unlimited goals');
    }
    if (!opts || !String(opts.name || '').trim()) throw new Error('Goal needs a name');
    if (!Number.isInteger(opts.targetCents) || opts.targetCents <= 0) throw new Error('Goal target must be a positive amount');
    var g = {
      id: nextId(state, 'goal'), kidId: kidId,
      name: String(opts.name).trim().slice(0, 30),
      icon: opts.icon || '🎯',
      targetCents: opts.targetCents,
      targetDate: opts.targetDate || null,
      createdAt: Date.now(), done: false
    };
    state.goals.push(g);
    return g;
  }

  // Goal funding is recorded as negative Save-jar entries tagged with the
  // goalId, so saved-so-far = the total that has flowed out of Save into it.
  function goalSaved(state, goalId) {
    return state.ledger.reduce(function (s, e) { return e.goalId === goalId ? s - e.amountCents : s; }, 0);
  }
  function goalProgress(state, goal) { // 0..1
    if (goal.targetCents <= 0) return 0;
    return Math.max(0, Math.min(1, goalSaved(state, goal.id) / goal.targetCents));
  }

  function fundGoal(state, kidId, goalId, amountCents, opts) {
    opts = opts || {};
    var goal = state.goals.filter(function (g) { return g.id === goalId && g.kidId === kidId; })[0];
    if (!goal) throw new Error('No such goal');
    if (goal.done) throw new Error('That goal is already complete!');
    if (amountCents <= 0) throw new Error('Amount must be positive');
    if (balance(state, kidId, 'save') < amountCents) throw new Error('Not enough in the Save jar');
    // Money leaves the Save jar and lands in the goal.
    var e = postEntry(state, kidId, 'save', -amountCents, { category: 'Goal saving', note: goal.name, source: 'goal', goalId: goalId, ts: opts.ts });
    if (goalSaved(state, goalId) >= goal.targetCents) goal.done = true;
    return e;
  }

  // Average weekly Save-jar inflow over the last 28 days, in cents.
  function weeklySavePace(state, kidId, now) {
    now = now || Date.now();
    var from = now - 28 * 24 * 3600 * 1000;
    var total = state.ledger.reduce(function (s, e) {
      var counts = e.kidId === kidId && e.wallet === 'save' && e.amountCents > 0 &&
        e.source !== 'transfer' && !e.goalId && e.ts >= from && e.ts <= now;
      return counts ? s + e.amountCents : s;
    }, 0);
    return total / 4;
  }

  function weeksToGoal(state, goal, now) {
    var saved = goalSaved(state, goal.id);
    if (saved >= goal.targetCents) return 0;
    var pace = weeklySavePace(state, goal.kidId, now);
    if (pace <= 0) return null; // no pace yet
    return Math.ceil((goal.targetCents - saved) / pace);
  }

  /* ---------- allowance ---------- */

  function setAllowance(state, kidId, opts) {
    getKid(state, kidId);
    opts = opts || {};
    if (!Number.isInteger(opts.amountCents) || opts.amountCents <= 0) throw new Error('Allowance must be a positive amount');
    var split = opts.split || { spend: 50, save: 40, give: 10 };
    if (split.spend + split.save + split.give !== 100) throw new Error('Split must add up to 100%');
    var existing = state.allowanceRules.filter(function (r) { return r.kidId === kidId; })[0];
    var created = new Date(opts.now || Date.now());
    if (existing) {
      existing.amountCents = opts.amountCents;
      existing.dayOfWeek = opts.dayOfWeek;
      existing.split = split; existing.active = true;
      return existing;
    }
    var rule = {
      id: nextId(state, 'al'), kidId: kidId, amountCents: opts.amountCents,
      dayOfWeek: Math.max(0, Math.min(6, opts.dayOfWeek | 0)),
      split: split, active: true,
      createdAtKey: dateKey(created), lastPostedFor: null
    };
    state.allowanceRules.push(rule);
    return rule;
  }

  function splitAmount(amountCents, split) {
    var save = Math.round(amountCents * split.save / 100);
    var give = Math.round(amountCents * split.give / 100);
    return { save: save, give: give, spend: amountCents - save - give };
  }

  // Post every allowance occurrence due on or before `now` that hasn't posted.
  // Returns the list of week-date keys posted. Idempotent: safe to call often.
  function postDueAllowances(state, now) {
    now = now || Date.now();
    var today = new Date(now); today.setHours(0, 0, 0, 0);
    var posted = [];
    state.allowanceRules.forEach(function (rule) {
      if (!rule.active) return;
      // Scan from the day after lastPostedFor (or from creation) to today.
      var start;
      if (rule.lastPostedFor) { start = new Date(rule.lastPostedFor + 'T12:00:00'); start.setDate(start.getDate() + 1); }
      else { start = new Date(rule.createdAtKey + 'T12:00:00'); }
      start.setHours(0, 0, 0, 0);
      var d = new Date(start), guard = 0;
      while (d <= today && guard++ < 400) {
        if (d.getDay() === rule.dayOfWeek) {
          var key = dateKey(d);
          var parts = splitAmount(rule.amountCents, rule.split);
          var ts = d.getTime() + 9 * 3600 * 1000; // 9am on the due day
          WALLETS.forEach(function (w) {
            if (parts[w] > 0) postEntry(state, rule.kidId, w, parts[w], { category: 'Allowance', source: 'allowance', ts: ts, note: 'Weekly allowance' });
          });
          rule.lastPostedFor = key;
          posted.push(key);
        }
        d.setDate(d.getDate() + 1);
      }
    });
    return posted;
  }

  /* ---------- chores ---------- */

  function addChore(state, kidId, opts) {
    getKid(state, kidId);
    if (!opts || !String(opts.title || '').trim()) throw new Error('Chore needs a title');
    if (!Number.isInteger(opts.valueCents) || opts.valueCents <= 0) throw new Error('Chore value must be positive');
    var c = {
      id: nextId(state, 'ch'), kidId: kidId, title: String(opts.title).trim().slice(0, 40),
      valueCents: opts.valueCents, status: 'open', rejectedCount: 0
    };
    state.chores.push(c);
    return c;
  }
  function getChore(state, choreId) {
    var c = state.chores.filter(function (x) { return x.id === choreId; })[0];
    if (!c) throw new Error('No such chore');
    return c;
  }
  function kidCompleteChore(state, choreId) {
    var c = getChore(state, choreId);
    if (c.status !== 'open') throw new Error('That chore is not open');
    c.status = 'pending'; // money moves ONLY on parent approval
    return c;
  }
  function parentApproveChore(state, choreId, opts) {
    opts = opts || {};
    var c = getChore(state, choreId);
    if (c.status !== 'pending') throw new Error('That chore is not waiting for approval');
    c.status = 'paid';
    return postEntry(state, c.kidId, 'spend', c.valueCents, {
      category: 'Chores', source: 'chore', note: c.title, ts: opts.ts, choreId: c.id
    });
  }
  function parentRejectChore(state, choreId) {
    var c = getChore(state, choreId);
    if (c.status !== 'pending') throw new Error('That chore is not waiting for approval');
    c.status = 'open'; c.rejectedCount += 1;
    return c;
  }

  /* ---------- spend requests ---------- */

  function requestSpend(state, kidId, amountCents, note) {
    getKid(state, kidId);
    if (amountCents <= 0) throw new Error('Request must be positive');
    var r = { id: nextId(state, 'sr'), kidId: kidId, amountCents: amountCents, note: note || '', status: 'pending', ts: Date.now() };
    state.spendRequests.push(r);
    return r;
  }
  function resolveSpendRequest(state, reqId, approve, opts) {
    opts = opts || {};
    var r = state.spendRequests.filter(function (x) { return x.id === reqId; })[0];
    if (!r) throw new Error('No such request');
    if (r.status !== 'pending') throw new Error('That request is already resolved');
    if (!approve) { r.status = 'declined'; return null; }
    r.status = 'approved';
    return logSpend(state, r.kidId, r.amountCents, { category: opts.category || 'Treats', note: r.note, needWant: opts.needWant, worthIt: opts.worthIt, ts: opts.ts });
  }

  /* ---------- lessons & badges ---------- */

  function isLessonLocked(state, index) { return index >= limits(state).lessons; }

  function completeLesson(state, kidId, lessonId, index, score, total) {
    getKid(state, kidId);
    if (isLessonLocked(state, index)) throw new Error('That lesson is part of Premium');
    var passMark = Math.ceil(total * 2 / 3);
    var passed = score >= passMark;
    var existing = state.lessonProgress.filter(function (p) { return p.kidId === kidId && p.lessonId === lessonId; })[0];
    if (passed) {
      if (existing) { existing.score = Math.max(existing.score, score); }
      else state.lessonProgress.push({ kidId: kidId, lessonId: lessonId, score: score, completedAt: Date.now() });
    }
    return { passed: passed, passMark: passMark };
  }
  function lessonsCompleted(state, kidId) {
    return state.lessonProgress.filter(function (p) { return p.kidId === kidId; }).length;
  }

  // Consecutive-week saving streak (weeks containing a positive Save entry,
  // goal funding excluded). Current week counts if it has one; otherwise the
  // streak runs through last week (the week isn't over yet).
  function savingStreakWeeks(state, kidId, now) {
    now = now || Date.now();
    var weeks = {};
    state.ledger.forEach(function (e) {
      if (e.kidId === kidId && e.wallet === 'save' && e.amountCents > 0 && e.source !== 'transfer' && !e.goalId) {
        weeks[weekKey(new Date(e.ts))] = true;
      }
    });
    var cursor = new Date(now);
    if (!weeks[weekKey(cursor)]) cursor.setDate(cursor.getDate() - 7);
    var streak = 0, guard = 0;
    while (weeks[weekKey(cursor)] && guard++ < 520) {
      streak++; cursor.setDate(cursor.getDate() - 7);
    }
    return streak;
  }

  var BADGES = [
    { id: 'first-steps', icon: '🌱', name: 'First Steps', test: function (s, k) { return lessonsCompleted(s, k) >= 1; } },
    { id: 'bookworm-5', icon: '📚', name: 'Money Bookworm', test: function (s, k) { return lessonsCompleted(s, k) >= 5; } },
    { id: 'scholar-10', icon: '🎓', name: 'Money Scholar', test: function (s, k) { return lessonsCompleted(s, k) >= 10; } },
    { id: 'goal-setter', icon: '🎯', name: 'Goal Setter', test: function (s, k) { return s.goals.some(function (g) { return g.kidId === k; }); } },
    { id: 'goal-getter', icon: '🏆', name: 'Goal Getter', test: function (s, k) { return s.goals.some(function (g) { return g.kidId === k && g.done; }); } },
    { id: 'streak-2', icon: '🔥', name: '2-Week Saver', test: function (s, k, now) { return savingStreakWeeks(s, k, now) >= 2; } },
    { id: 'streak-4', icon: '🌟', name: '4-Week Super Saver', test: function (s, k, now) { return savingStreakWeeks(s, k, now) >= 4; } },
    { id: 'giver', icon: '❤️', name: 'Kind Giver', test: function (s, k) { return balance(s, k, 'give') > 0 || s.ledger.some(function (e) { return e.kidId === k && e.wallet === 'give' && e.amountCents < 0; }); } },
    { id: 'earner', icon: '💪', name: 'Hard Earner', test: function (s, k) { return s.ledger.some(function (e) { return e.kidId === k && e.source === 'chore'; }); } }
  ];
  function earnedBadges(state, kidId, now) {
    return BADGES.filter(function (b) { return b.test(state, kidId, now); })
      .map(function (b) { return { id: b.id, icon: b.icon, name: b.name }; });
  }

  /* ---------- parent dashboard helpers ---------- */

  function weekSummary(state, kidId, now) {
    now = now || Date.now();
    var d = new Date(now); d.setHours(0, 0, 0, 0);
    var day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); // Monday
    var from = d.getTime();
    var sum = { earned: 0, saved: 0, spent: 0, given: 0, need: 0, want: 0, reflectedSpends: 0 };
    state.ledger.forEach(function (e) {
      if (e.kidId !== kidId || e.ts < from || e.ts > now) return;
      if (e.amountCents > 0 && (e.source === 'allowance' || e.source === 'chore' || e.source === 'gift')) sum.earned += e.amountCents;
      if (e.wallet === 'save' && e.amountCents > 0 && e.source !== 'transfer' && !e.goalId) sum.saved += e.amountCents;
      if (e.goalId) sum.saved += 0; // goal funding counted via goal progress, not double-counted
      if (e.wallet === 'spend' && e.amountCents < 0 && e.source === 'spend') {
        sum.spent += -e.amountCents;
        if (e.reflection) {
          sum.reflectedSpends++;
          if (e.reflection.needWant === 'need') sum.need += -e.amountCents;
          if (e.reflection.needWant === 'want') sum.want += -e.amountCents;
        }
      }
      if (e.wallet === 'give' && e.amountCents < 0) sum.given += -e.amountCents;
    });
    return sum;
  }

  function needWantSplit(state, kidId) {
    var need = 0, want = 0;
    state.ledger.forEach(function (e) {
      if (e.kidId === kidId && e.source === 'spend' && e.reflection) {
        if (e.reflection.needWant === 'need') need += -e.amountCents;
        if (e.reflection.needWant === 'want') want += -e.amountCents;
      }
    });
    return { need: need, want: want };
  }

  /* ---------- persistence ---------- */

  function serialize(state) { return JSON.stringify(state); }
  function deserialize(json) {
    var s = JSON.parse(json);
    if (!s || s.version !== 1 || !Array.isArray(s.kids) || !Array.isArray(s.ledger)) {
      throw new Error('Not a valid GoalJar save');
    }
    return s;
  }

  var api = {
    MAX_KIDS: MAX_KIDS,
    FREE: FREE, PREMIUM: PREMIUM, WALLETS: WALLETS, AVATARS: AVATARS, COLORS: COLORS, BADGES: BADGES,
    hashPin: hashPin, fmtMoney: fmtMoney, dateKey: dateKey, weekKey: weekKey, limits: limits,
    createState: createState, getKid: getKid,
    verifyParentPin: verifyParentPin, setParentPin: setParentPin, verifyKidPin: verifyKidPin,
    addKid: addKid,
    postEntry: postEntry, balance: balance, totalBalance: totalBalance, kidEntries: kidEntries,
    logIncome: logIncome, logSpend: logSpend, transfer: transfer,
    addGoal: addGoal, goalSaved: goalSaved, goalProgress: goalProgress, fundGoal: fundGoal,
    weeklySavePace: weeklySavePace, weeksToGoal: weeksToGoal,
    setAllowance: setAllowance, splitAmount: splitAmount, postDueAllowances: postDueAllowances,
    addChore: addChore, getChore: getChore, kidCompleteChore: kidCompleteChore,
    parentApproveChore: parentApproveChore, parentRejectChore: parentRejectChore,
    requestSpend: requestSpend, resolveSpendRequest: resolveSpendRequest,
    isLessonLocked: isLessonLocked, completeLesson: completeLesson, lessonsCompleted: lessonsCompleted,
    savingStreakWeeks: savingStreakWeeks, earnedBadges: earnedBadges,
    weekSummary: weekSummary, needWantSplit: needWantSplit,
    serialize: serialize, deserialize: deserialize
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GoalJarCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
