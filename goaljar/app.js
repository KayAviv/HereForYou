/* GoalJar app — local-first. All family data lives in this device's
 * localStorage. No accounts, no servers, no ads. Virtual money only. */
(function () {
  'use strict';
  var C = window.GoalJarCore;
  var LESSONS = window.GoalJarLessons;
  var KEY = 'goaljar-save-v1';

  var state = null;
  try { var raw = localStorage.getItem(KEY); if (raw) state = C.deserialize(raw); } catch (e) { state = null; }

  var ui = { screen: 'picker', kidId: null, tab: 'home', ptab: 'dash', lessonIdx: null, quizStep: -1, quizScore: 0, quizPick: null };

  var INCOME_CATS = ['🎁 Gift', '⭐ Bonus', '🧺 Odd job', '💵 Found money', '❓ Other'];
  var SPEND_CATS = ['🍦 Treats', '🎮 Games', '📚 Books', '🧸 Toys', '🎨 Crafts', '🍿 Outings', '🎁 For others', '❓ Other'];
  var GOAL_ICONS = ['🚲', '🎮', '🧸', '📚', '🔭', '👟', '🎸', '🧩', '🐶', '☂️', '🎯', '⭐'];
  var DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function save() {
    try { localStorage.setItem(KEY, C.serialize(state)); } catch (e) {}
    // Family Sync (opt-in): stamp edits as they happen so offline
    // changes keep true last-write-wins order. No-op when local-only.
    if (window.GoalJarSync) window.GoalJarSync.onLocalSave(state);
  }
  function money(c) { return C.fmtMoney(c, state ? state.currency : 'CAD'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function el(id) { return document.getElementById(id); }
  function toCents(v) { var n = Math.round(parseFloat(v) * 100); return isFinite(n) ? n : NaN; }

  function toast(msg, ms) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2600);
  }
  function confetti() {
    var c = document.createElement('div'); c.className = 'confetti';
    var icons = ['🎉', '⭐', '🪙', '✨', '🎊', '💛'];
    for (var i = 0; i < 26; i++) {
      var s = document.createElement('span'); s.textContent = icons[i % icons.length];
      s.style.left = (Math.random() * 96) + 'vw';
      s.style.animationDelay = (Math.random() * 0.7) + 's';
      c.appendChild(s);
    }
    document.body.appendChild(c);
    setTimeout(function () { c.remove(); }, 3400);
  }
  function badgeDelta(before, after) {
    var old = {}; before.forEach(function (b) { old[b.id] = 1; });
    after.forEach(function (b) { if (!old[b.id]) toast(b.icon + ' New badge: ' + b.name + '!', 3200); });
  }
  function withBadges(kidId, fn) {
    var before = C.earnedBadges(state, kidId);
    var out = fn();
    save();
    badgeDelta(before, C.earnedBadges(state, kidId));
    return out;
  }
  function tryDo(fn) {
    try { return fn(); } catch (e) { toast('⚠️ ' + e.message, 3000); return null; }
  }

  /* ---------------- modal + PIN pad ---------------- */
  function closeModal() { el('modal').innerHTML = ''; }
  function sheet(html) {
    el('modal').innerHTML = '<div class="overlay"><div class="sheet">' + html + '</div></div>';
  }
  function pinPad(title, cb) {
    var entered = '';
    function draw() {
      sheet('<h3 class="center">' + esc(title) + '</h3>' +
        '<div class="pindots">' + (entered ? '•'.repeat(entered.length) : '· · · ·') + '</div>' +
        '<div class="pinpad">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9, '✕', 0, '⌫'].map(function (k) {
          return '<button data-pin="' + k + '">' + k + '</button>';
        }).join('') + '</div>' +
        '<p class="small center">PINs stay on this device.</p>');
      Array.prototype.forEach.call(document.querySelectorAll('[data-pin]'), function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-pin');
          if (k === '✕') { closeModal(); return; }
          if (k === '⌫') { entered = entered.slice(0, -1); draw(); return; }
          entered += k; draw();
          if (entered.length >= 4) {
            var pin = entered; entered = '';
            setTimeout(function () { cb(pin); }, 120);
          }
        };
      });
    }
    draw();
  }

  /* ---------------- chrome ---------------- */
  function topbar(right) {
    return '<div class="topbar"><div class="logo"><span class="jarlogo">🫙</span> GoalJar</div>' +
      '<div>' + (right || '') + '</div></div>';
  }
  function tabbar(tabs, current, attr) {
    return '<nav class="tabbar">' + tabs.map(function (t) {
      return '<button data-' + attr + '="' + t.id + '" class="' + (t.id === current ? 'on' : '') + '">' + t.label + '</button>';
    }).join('') + '</nav>';
  }
  function bindTabs(attr, fn) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-' + attr + ']'), function (b) {
      b.onclick = function () { fn(b.getAttribute('data-' + attr)); };
    });
  }

  /* ---------------- setup ---------------- */
  function renderSetup() {
    ui.screen = 'setup';
    el('app').innerHTML = topbar() +
      '<div class="card"><h1>Welcome to GoalJar 🫙</h1>' +
      '<p>Help your kids <strong>save for goals</strong>, <strong>earn</strong> with chores and allowance, <strong>track money in &amp; out</strong>, and learn money skills — one tiny lesson at a time.</p>' +
      '<p class="small">GoalJar is a <strong>tracker, not a bank</strong>: every dollar in the app is pretend tracking, and the real money stays safely with you. By default everything is stored only on this device — step 3 below is your choice.</p></div>' +
      '<div class="card"><h3>1 · Choose a parent PIN</h3>' +
      '<p class="small">Parent mode (approvals, settings, money setup) hides behind this PIN. Kids never need an account or email.</p>' +
      '<label>Parent PIN (4–8 digits)</label><input id="pin1" type="password" inputmode="numeric" maxlength="8" placeholder="e.g. 2468">' +
      '<label>Type it again</label><input id="pin2" type="password" inputmode="numeric" maxlength="8"></div>' +
      '<div class="card"><h3>2 · Add your first kid</h3>' +
      '<label>First name</label><input id="kidname" maxlength="20" placeholder="e.g. Maya">' +
      '<label>Pick an avatar</label><div class="avatarpick" id="avpick">' +
      C.AVATARS.map(function (a, i) { return '<span class="chip' + (i === 0 ? ' on' : '') + '" data-av="' + a + '">' + a + '</span>'; }).join('') + '</div>' +
      '<label>Age band</label><select id="kidband"><option value="6-9">6–9 years</option><option value="9-12">9–12 years</option></select>' +
      '<label>Optional kid PIN (for older kids sharing a device)</label><input id="kidpin" type="password" inputmode="numeric" maxlength="8" placeholder="Leave blank for none"></div>' +
      '<div class="card"><h3>3 · Your family\'s devices</h3>' +
      '<p class="small">GoalJar works fully on this one device — nothing ever leaves it. Or <strong>connect your family</strong>: a parent account lets a second phone (yours, or your kid\'s own phone) share the same jars, chores and lessons. <strong>You choose</strong> — and you can change your mind anytime in Parent Mode → More.</p>' +
      '<div><span class="chip on" data-dev="local">📱 This device only</span><span class="chip" data-dev="family">👨‍👩‍👧 Connect my family</span></div>' +
      '<div id="famfields" style="display:none"><label>Parent email</label><input id="famemail" type="email" placeholder="you@example.com">' +
      '<label>Password (8+ characters)</label><input id="fampw" type="password" placeholder="For the family account">' +
      '<p class="small">Accounts are for parents only. A second device joins later with a 6-digit family code and picks a profile — kids never need an email or password.</p></div></div>' +
      '<button class="big primary" id="startBtn">Start saving! 🌱</button>' +
      '<p class="small center">Free plan: up to 4 kids · 2 goals per kid · first 10 lessons. No ads, ever.</p>';
    var avatar = C.AVATARS[0];
    Array.prototype.forEach.call(document.querySelectorAll('[data-av]'), function (ch) {
      ch.onclick = function () {
        avatar = ch.getAttribute('data-av');
        Array.prototype.forEach.call(document.querySelectorAll('[data-av]'), function (x) { x.classList.toggle('on', x === ch); });
      };
    });
    var devChoice = 'local';
    Array.prototype.forEach.call(document.querySelectorAll('[data-dev]'), function (ch) {
      ch.onclick = function () {
        devChoice = ch.getAttribute('data-dev');
        el('famfields').style.display = devChoice === 'family' ? '' : 'none';
        Array.prototype.forEach.call(document.querySelectorAll('[data-dev]'), function (x) { x.classList.toggle('on', x === ch); });
      };
    });
    el('startBtn').onclick = function () {
      var p1 = el('pin1').value.trim(), p2 = el('pin2').value.trim();
      if (p1 !== p2) { toast('⚠️ The two parent PINs do not match'); return; }
      var made = tryDo(function () {
        state = C.createState(p1);
        var kid = C.addKid(state, { name: el('kidname').value, avatar: avatar, ageBand: el('kidband').value, kidPin: el('kidpin').value.trim() || null });
        save();
        return kid;
      });
      if (made) {
        toast('🎉 Family created! Say hi to ' + made.name);
        var F = syncFacade();
        if (F && devChoice === 'family') {
          var em = el('famemail').value.trim(), pw = el('fampw').value;
          if (em && pw) {
            F.createFamily(em, pw).then(function (r) {
              toast('👨‍👩‍👧 Family connected! Your family code is ' + r.code, 4500);
            }).catch(function (e) {
              toast('⚠️ Family account not created (' + e.message + ') — you can set it up later in Parent Mode → More.', 4200);
            });
          } else F.setPendingIntent(true);
        }
        enterKid(made.id);
      }
    };
  }

  /* ---------------- profile picker ---------------- */
  function renderPicker() {
    ui.screen = 'picker'; ui.kidId = null;
    el('app').innerHTML = topbar('<span class="pill">' + (state.plan === 'premium' ? '⭐ Premium' : 'Free plan') + '</span>') +
      '<h2 class="center">Who\'s playing?</h2>' +
      '<div class="kidgrid">' + state.kids.map(function (k) {
        return '<div class="kidcard" data-kid="' + k.id + '"><div class="avatar" style="background:' + k.color + '33">' + k.avatar + '</div>' +
          '<div class="kname">' + esc(k.name) + '</div><div class="small">' + money(C.totalBalance(state, k.id)) + ' in jars</div></div>';
      }).join('') + '</div>' +
      '<div style="margin-top:18px"><button class="big gold" id="parentBtn">🔐 Parent mode</button></div>' +
      '<p class="small center" style="margin-top:14px">Money here is pretend tracking — real dollars stay with parents.<br>' +
      (syncFacade() && syncFacade().status().mode === 'family'
        ? '👨‍👩‍👧 This device is connected to your family — jars, chores and lessons sync.'
        : 'Your family\'s data stays on this device.') + '</p>';
    Array.prototype.forEach.call(document.querySelectorAll('[data-kid]'), function (card) {
      card.onclick = function () {
        var kid = C.getKid(state, card.getAttribute('data-kid'));
        if (kid.kidPinHash) {
          pinPad(kid.name + '\'s PIN', function (pin) {
            if (C.verifyKidPin(kid, pin)) { closeModal(); enterKid(kid.id); }
            else toast('⚠️ Wrong PIN — try again');
          });
        } else enterKid(kid.id);
      };
    });
    el('parentBtn').onclick = function () {
      pinPad('Parent PIN', function (pin) {
        if (C.verifyParentPin(state, pin)) { closeModal(); ui.screen = 'parent'; ui.ptab = 'dash'; render(); }
        else toast('⚠️ Wrong parent PIN');
      });
    };
  }

  function enterKid(kidId) {
    ui.screen = 'kid'; ui.kidId = kidId; ui.tab = 'home';
    C.postDueAllowances(state); save();
    if (window.GoalJarSync) window.GoalJarSync.kick();
    render();
  }
  function lock() { ui.screen = 'picker'; ui.kidId = null; render(); }

  /* ---------------- kid mode ---------------- */
  var KID_TABS = [
    { id: 'home', label: '🏠 Home' }, { id: 'goals', label: '🎯 Goals' },
    { id: 'earn', label: '💪 Earn' }, { id: 'move', label: '🔄 Money' },
    { id: 'learn', label: '📚 Learn' }, { id: 'badges', label: '🏅 Badges' }
  ];
  function jarHtml(wallet, label, cents, maxCents) {
    var pct = maxCents > 0 ? Math.max(4, Math.min(100, cents / maxCents * 100)) : 4;
    return '<div class="jarwrap"><div class="jar"><div class="fill ' + wallet + '" style="height:' + pct + '%">' +
      '<span class="bub" style="left:18%;width:9px;height:9px;bottom:8px"></span>' +
      '<span class="bub" style="left:58%;width:6px;height:6px;bottom:16px;animation-delay:1.2s"></span></div></div>' +
      '<div class="jarlabel">' + label + '</div><div class="jaramount">' + money(cents) + '</div></div>';
  }
  function renderKid() {
    var kid = C.getKid(state, ui.kidId);
    var body = '';
    if (ui.tab === 'home') body = kidHome(kid);
    else if (ui.tab === 'goals') body = kidGoals(kid);
    else if (ui.tab === 'earn') body = kidEarn(kid);
    else if (ui.tab === 'move') body = kidMove(kid);
    else if (ui.tab === 'learn') body = kidLearn(kid);
    else if (ui.tab === 'badges') body = kidBadges(kid);
    el('app').innerHTML = topbar('<button class="ghost" id="lockBtn">👋 Done</button>') + body +
      tabbar(KID_TABS, ui.tab, 'ktab');
    el('lockBtn').onclick = lock;
    bindTabs('ktab', function (t) { ui.tab = t; render(); });
    bindKidActions(kid);
  }

  function kidHome(kid) {
    var total = C.totalBalance(state, kid.id);
    var maxJar = Math.max(C.balance(state, kid.id, 'spend'), C.balance(state, kid.id, 'save'), C.balance(state, kid.id, 'give'), 1);
    var streak = C.savingStreakWeeks(state, kid.id);
    var wk = C.weekSummary(state, kid.id);
    var goals = state.goals.filter(function (g) { return g.kidId === kid.id && !g.done; });
    var goalsDone = state.goals.filter(function (g) { return g.kidId === kid.id && g.done; });
    var goalHtml = goals.map(function (g) {
      var pct = Math.round(C.goalProgress(state, g) * 100);
      var wks = C.weeksToGoal(state, g);
      return '<div class="item"><span class="ic">' + g.icon + '</span><div class="grow"><strong>' + esc(g.name) + '</strong>' +
        '<div class="progressbar"><div style="width:' + pct + '%"></div></div>' +
        '<span class="small">' + money(C.goalSaved(state, g.id)) + ' of ' + money(g.targetCents) + ' · ' + pct + '%' +
        (wks === null ? ' · save something to see your pace!' : wks === 0 ? ' · done!' : ' · at this pace: about ' + wks + ' week' + (wks === 1 ? '' : 's') + ' to go!') + '</span></div></div>';
    }).join('');
    return '<div class="card totalcard"><div>' + kid.avatar + ' Hi, ' + esc(kid.name) + '!</div>' +
      '<div class="small" style="color:#eafff3">All my jars together</div><div class="amount">' + money(total) + '</div>' +
      (streak > 0 ? '<div>🔥 Saving streak: ' + streak + ' week' + (streak === 1 ? '' : 's') + '!</div>' : '<div class="small" style="color:#eafff3">Add to Save this week to start a streak 🔥</div>') + '</div>' +
      '<div class="card"><div class="jars">' +
      jarHtml('spend', '🟠 Spend', C.balance(state, kid.id, 'spend'), maxJar) +
      jarHtml('save', '🟢 Save', C.balance(state, kid.id, 'save'), maxJar) +
      jarHtml('give', '🩷 Give', C.balance(state, kid.id, 'give'), maxJar) +
      '</div></div>' +
      (goals.length ? '<h3>My goals</h3>' + goalHtml : '<div class="card center"><p>🎯 No goal yet!<br><span class="small">A goal makes saving exciting. Create one in the Goals tab.</span></p></div>') +
      (goalsDone.length ? '<p class="small center">🏆 Finished: ' + goalsDone.map(function (g) { return esc(g.name); }).join(', ') + '</p>' : '') +
      '<div class="card"><h3>My week</h3><p class="small">Earned ' + money(wk.earned) + ' · Saved ' + money(wk.saved) + ' · Spent ' + money(wk.spent) + ' this week.</p></div>';
  }

  function kidGoals(kid) {
    var goals = state.goals.filter(function (g) { return g.kidId === kid.id; });
    var list = goals.map(function (g) {
      var pct = Math.round(C.goalProgress(state, g) * 100);
      return '<div class="card"><div class="row" style="align-items:center;flex-wrap:nowrap">' +
        '<div class="jar goaljar"><div class="fill" style="height:' + Math.max(3, pct) + '%"></div></div>' +
        '<div style="flex:1"><h3>' + g.icon + ' ' + esc(g.name) + (g.done ? ' 🏆' : '') + '</h3>' +
        '<div class="progressbar"><div style="width:' + pct + '%"></div></div>' +
        '<p class="small">' + money(C.goalSaved(state, g.id)) + ' of ' + money(g.targetCents) + ' (' + pct + '%)' +
        (g.targetDate ? '<br>🎯 Target date: ' + esc(g.targetDate) : '') + '</p>' +
        (g.done ? '<p><strong>🎉 Goal reached! Amazing saving!</strong></p>' :
          '<div class="row"><input id="fund-' + g.id + '" type="number" min="0" step="0.25" placeholder="$ to move from Save jar" style="flex:2">' +
          '<button class="primary" data-fund="' + g.id + '">Add to jar</button></div>' +
          '<p class="small">Save jar balance: ' + money(C.balance(state, kid.id, 'save')) + '</p>') +
        '</div></div></div>';
    }).join('');
    return '<h2>🎯 My goals</h2>' + (list || '<div class="card"><p>No goals yet — dream something up below!</p></div>') +
      '<div class="card"><h3>✨ New goal</h3>' +
      '<label>What are you saving for?</label><input id="gname" maxlength="30" placeholder="e.g. A shiny red bike">' +
      '<label>How much does it cost? ($)</label><input id="gcost" type="number" min="0" step="0.25" placeholder="e.g. 60">' +
      '<label>Pick a picture</label><div class="avatarpick" id="gicons">' +
      GOAL_ICONS.map(function (ic, i) { return '<span class="chip' + (i === 0 ? ' on' : '') + '" data-gi="' + ic + '">' + ic + '</span>'; }).join('') + '</div>' +
      '<label>Target date (optional)</label><input id="gdate" type="date">' +
      '<button class="big primary" id="gcreate">Create my goal 🎯</button></div>';
  }

  function kidEarn(kid) {
    var mine = state.chores.filter(function (c) { return c.kidId === kid.id; });
    var open = mine.filter(function (c) { return c.status === 'open'; });
    var pending = mine.filter(function (c) { return c.status === 'pending'; });
    var paid = mine.filter(function (c) { return c.status === 'paid'; });
    var rule = state.allowanceRules.filter(function (r) { return r.kidId === kid.id && r.active; })[0];
    function choreRow(c, btn) {
      return '<div class="item"><span class="ic">🧹</span><div class="grow"><strong>' + esc(c.title) + '</strong><br>' +
        '<span class="small">Worth ' + money(c.valueCents) + '</span></div>' + (btn || '') + '</div>';
    }
    return '<h2>💪 Earn</h2>' +
      (rule ? '<div class="card"><h3>📅 My allowance</h3><p class="small">' + money(rule.amountCents) + ' every ' + DAYNAMES[rule.dayOfWeek] +
        ' — split ' + rule.split.spend + '% Spend · ' + rule.split.save + '% Save · ' + rule.split.give + '% Give. It lands automatically!</p></div>' :
        '<div class="card"><p class="small">No allowance set up yet — a parent can add one in Parent Mode.</p></div>') +
      '<h3>Chores to do</h3>' + (open.map(function (c) { return choreRow(c, '<button class="primary" data-done="' + c.id + '">I did it! ✓</button>'); }).join('') || '<p class="small">All done. Great work! 🎉</p>') +
      '<h3>Waiting for a parent ✓</h3>' + (pending.map(function (c) { return choreRow(c, '<span class="pill">waiting…</span>'); }).join('') || '<p class="small">Nothing waiting.</p>') +
      (paid.length ? '<h3>Paid 🎉</h3>' + paid.slice(-5).map(function (c) { return choreRow(c, '<span class="amt pos">' + money(c.valueCents) + '</span>'); }).join('') : '');
  }

  function kidMove(kid) {
    var entries = C.kidEntries(state, kid.id).slice(-14).reverse();
    var reqs = state.spendRequests.filter(function (r) { return r.kidId === kid.id; }).slice(-4).reverse();
    var hist = entries.map(function (e) {
      var wname = { spend: '🟠 Spend', save: '🟢 Save', give: '🩷 Give' }[e.wallet];
      return '<div class="item"><span class="ic">' + (e.amountCents > 0 ? '⬇️' : '⬆️') + '</span><div class="grow"><strong>' + esc(e.category) + '</strong> · ' + wname +
        (e.note ? '<br><span class="small">' + esc(e.note) + '</span>' : '') +
        (e.reflection ? '<br><span class="small">' + (e.reflection.needWant === 'need' ? '🧺 It was a need' : '🎈 It was a want') + (e.reflection.worthIt ? ' · worth it: ' + e.reflection.worthIt : '') + '</span>' : '') +
        '<br><span class="small">' + new Date(e.ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + '</span></div>' +
        '<span class="amt ' + (e.amountCents > 0 ? 'pos' : 'neg') + '">' + (e.amountCents > 0 ? '+' : '−') + money(Math.abs(e.amountCents)) + '</span></div>';
    }).join('');
    return '<h2>🔄 Money in &amp; out</h2>' +
      '<div class="card"><h3>⬇️ Money in</h3>' +
      '<label>Amount ($)</label><input id="inAmt" type="number" min="0" step="0.25" placeholder="e.g. 5">' +
      '<label>Into which jar?</label><select id="inWallet"><option value="spend">🟠 Spend</option><option value="save">🟢 Save</option><option value="give">🩷 Give</option></select>' +
      '<label>Where from?</label><select id="inCat">' + INCOME_CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>' +
      '<label>Note (optional)</label><input id="inNote" maxlength="40" placeholder="e.g. Birthday money from Grandma">' +
      '<button class="big primary" id="inBtn">Add money in</button></div>' +
      '<div class="card"><h3>⬆️ I spent money</h3>' +
      '<label>Amount ($)</label><input id="outAmt" type="number" min="0" step="0.25" placeholder="e.g. 2.50">' +
      '<label>On what?</label><select id="outCat">' + SPEND_CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>' +
      '<label>Note (optional)</label><input id="outNote" maxlength="40">' +
      '<p style="margin:8px 0 2px"><strong>Quick think: was it a need or a want?</strong></p>' +
      '<div id="nw"><span class="chip" data-nw="need">🧺 Need</span><span class="chip" data-nw="want">🎈 Want</span><span class="chip on" data-nw="">🤷 Not sure</span></div>' +
      '<p style="margin:10px 0 2px"><strong>Was it worth it?</strong></p>' +
      '<div id="wi"><span class="chip" data-wi="😀">😀 Yes!</span><span class="chip" data-wi="😐">😐 Meh</span><span class="chip" data-wi="😞">😞 Not really</span></div>' +
      '<button class="big gold" id="outBtn">Log my spend</button>' +
      '<p class="small">Comes out of your 🟠 Spend jar (' + money(C.balance(state, kid.id, 'spend')) + ' available).</p></div>' +
      '<div class="card"><h3>🙋 Ask a parent to buy something</h3>' +
      '<label>Amount ($)</label><input id="rqAmt" type="number" min="0" step="0.25">' +
      '<label>What for?</label><input id="rqNote" maxlength="40" placeholder="e.g. Sticker book">' +
      '<button class="big ghost" id="rqBtn">Send request</button>' +
      (reqs.length ? reqs.map(function (r) {
        return '<p class="small">' + money(r.amountCents) + ' — ' + esc(r.note || 'request') + ' · <strong>' + r.status + '</strong></p>';
      }).join('') : '') + '</div>' +
      '<div class="card"><h3>🔀 Move between my jars</h3>' +
      '<div class="row"><select id="mvFrom"><option value="spend">From 🟠 Spend</option><option value="save">From 🟢 Save</option><option value="give">From 🩷 Give</option></select>' +
      '<select id="mvTo"><option value="save">To 🟢 Save</option><option value="spend">To 🟠 Spend</option><option value="give">To 🩷 Give</option></select></div>' +
      '<label>Amount ($)</label><input id="mvAmt" type="number" min="0" step="0.25">' +
      '<button class="big ghost" id="mvBtn">Move it</button></div>' +
      '<h3>My money story</h3>' + (hist || '<p class="small">Nothing yet — your money movements will appear here.</p>');
  }

  function kidLearn(kid) {
    var done = {}; state.lessonProgress.filter(function (p) { return p.kidId === kid.id; }).forEach(function (p) { done[p.lessonId] = 1; });
    var streak = C.savingStreakWeeks(state, kid.id);
    var cards = LESSONS.map(function (l, i) {
      var locked = C.isLessonLocked(state, i);
      return '<button class="lessoncard ' + (done[l.id] ? 'done' : '') + ' ' + (locked ? 'locked' : '') + '" data-lesson="' + i + '">' +
        '<span class="ic">' + (locked ? '🔒' : l.icon) + '</span><span class="grow"><strong>' + (i + 1) + '. ' + esc(l.title) + '</strong><br>' +
        '<span class="small">' + esc(l.topic) + ' · ~' + l.minutes + ' min · ages ' + l.band + (locked ? ' · ⭐ Premium' : '') + '</span></span>' +
        '<span>' + (done[l.id] ? '✅' : locked ? '' : '▶️') + '</span></button>';
    }).join('');
    return '<h2>📚 Money lessons</h2>' +
      '<p class="small">' + C.lessonsCompleted(state, kid.id) + ' of ' + LESSONS.length + ' lessons finished · 🔥 saving streak: ' + streak + ' week' + (streak === 1 ? '' : 's') + '</p>' + cards;
  }

  function kidBadges(kid) {
    var got = {}; C.earnedBadges(state, kid.id).forEach(function (b) { got[b.id] = 1; });
    return '<h2>🏅 My badges</h2><div class="badgegrid">' +
      C.BADGES.map(function (b) {
        return '<div class="badgechip ' + (got[b.id] ? '' : 'locked') + '"><span class="bic">' + b.icon + '</span>' + esc(b.name) + '</div>';
      }).join('') + '</div>' +
      '<div class="card"><h3>How to earn more</h3><p class="small">Finish lessons 📚, set and reach goals 🎯, add to your Save jar every week 🔥, finish chores 💪, and share from your Give jar ❤️.</p></div>';
  }

  function bindKidActions(kid) {
    if (ui.tab === 'goals') {
      var icon = GOAL_ICONS[0];
      Array.prototype.forEach.call(document.querySelectorAll('[data-gi]'), function (ch) {
        ch.onclick = function () {
          icon = ch.getAttribute('data-gi');
          Array.prototype.forEach.call(document.querySelectorAll('[data-gi]'), function (x) { x.classList.toggle('on', x === ch); });
        };
      });
      var gc = el('gcreate');
      if (gc) gc.onclick = function () {
        var made = tryDo(function () {
          return C.addGoal(state, kid.id, { name: el('gname').value, icon: icon, targetCents: toCents(el('gcost').value), targetDate: el('gdate').value || null });
        });
        if (made) { save(); toast('🎯 Goal created: ' + made.name); render(); }
        else if (state.goals.filter(function (g) { return g.kidId === kid.id && !g.done; }).length >= C.limits(state).goalsPerKid && state.plan !== 'premium') showPaywall();
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-fund]'), function (b) {
        b.onclick = function () {
          var gid = b.getAttribute('data-fund');
          var goal = state.goals.filter(function (g) { return g.id === gid; })[0];
          var wasDone = goal.done;
          var r = tryDo(function () {
            return withBadges(kid.id, function () { return C.fundGoal(state, kid.id, gid, toCents(el('fund-' + gid).value)); });
          });
          if (r) {
            if (!wasDone && goal.done) { confetti(); toast('🏆 GOAL REACHED! You did it, ' + kid.name + '!', 4000); }
            else toast('🫙 Added to ' + goal.name + '!');
            render();
          }
        };
      });
    }
    if (ui.tab === 'earn') {
      Array.prototype.forEach.call(document.querySelectorAll('[data-done]'), function (b) {
        b.onclick = function () {
          tryDo(function () { C.kidCompleteChore(state, b.getAttribute('data-done')); });
          save(); toast('✓ Sent to a parent for a check!'); render();
        };
      });
    }
    if (ui.tab === 'move') {
      var nw = '', wi = null;
      Array.prototype.forEach.call(document.querySelectorAll('[data-nw]'), function (ch) {
        ch.onclick = function () {
          nw = ch.getAttribute('data-nw');
          Array.prototype.forEach.call(document.querySelectorAll('[data-nw]'), function (x) { x.classList.toggle('on', x === ch); });
        };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-wi]'), function (ch) {
        ch.onclick = function () {
          wi = (wi === ch.getAttribute('data-wi')) ? null : ch.getAttribute('data-wi');
          Array.prototype.forEach.call(document.querySelectorAll('[data-wi]'), function (x) { x.classList.toggle('on', x.getAttribute('data-wi') === wi); });
        };
      });
      el('inBtn').onclick = function () {
        var r = tryDo(function () {
          return C.logIncome(state, kid.id, el('inWallet').value, toCents(el('inAmt').value), { category: el('inCat').value.replace(/^\S+ /, ''), note: el('inNote').value, source: 'gift' });
        });
        if (r) { save(); toast('⬇️ Money in!'); render(); }
      };
      el('outBtn').onclick = function () {
        var r = tryDo(function () {
          return withBadges(kid.id, function () {
            return C.logSpend(state, kid.id, toCents(el('outAmt').value), { category: el('outCat').value.replace(/^\S+ /, ''), note: el('outNote').value, needWant: nw || null, worthIt: wi });
          });
        });
        if (r) { save(); toast('⬆️ Spend logged. Honest tracking! 🧭'); render(); }
      };
      el('rqBtn').onclick = function () {
        var r = tryDo(function () { return C.requestSpend(state, kid.id, toCents(el('rqAmt').value), el('rqNote').value); });
        if (r) { save(); toast('🙋 Request sent to a parent!'); render(); }
      };
      el('mvBtn').onclick = function () {
        var r = tryDo(function () { return C.transfer(state, kid.id, el('mvFrom').value, el('mvTo').value, toCents(el('mvAmt').value)); });
        if (r) { save(); toast('🔀 Moved!'); render(); }
      };
    }
    if (ui.tab === 'learn') {
      Array.prototype.forEach.call(document.querySelectorAll('[data-lesson]'), function (b) {
        b.onclick = function () {
          var idx = parseInt(b.getAttribute('data-lesson'), 10);
          if (C.isLessonLocked(state, idx)) { showPaywall(); return; }
          openLesson(kid, idx);
        };
      });
    }
  }

  /* ---------------- lesson player ---------------- */
  function openLesson(kid, idx) {
    var l = LESSONS[idx];
    ui.lessonIdx = idx; ui.quizStep = -1; ui.quizScore = 0;
    function drawRead() {
      sheet('<h3>' + l.icon + ' ' + esc(l.title) + '</h3>' +
        l.text.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
        '<div class="card" style="margin:10px 0"><strong>🌟 ' + esc(l.tip) + '</strong></div>' +
        '<div class="row"><button class="ghost" id="lzClose">Later</button><button class="primary" id="lzQuiz">Take the quiz ▶</button></div>');
      el('lzClose').onclick = closeModal;
      el('lzQuiz').onclick = function () { ui.quizStep = 0; drawQuiz(); };
    }
    function drawQuiz() {
      var q = l.quiz[ui.quizStep];
      sheet('<h3>Quiz · question ' + (ui.quizStep + 1) + ' of ' + l.quiz.length + '</h3>' +
        '<p><strong>' + esc(q.q) + '</strong></p>' +
        q.options.map(function (o, i) { return '<button class="quizopt" data-opt="' + i + '">' + esc(o) + '</button>'; }).join('') +
        '<div id="lzNext"></div>');
      Array.prototype.forEach.call(document.querySelectorAll('[data-opt]'), function (b) {
        b.onclick = function () {
          var pick = parseInt(b.getAttribute('data-opt'), 10);
          var right = pick === q.answer;
          if (right) ui.quizScore++;
          b.classList.add(right ? 'right' : 'wrong');
          document.querySelector('[data-opt="' + q.answer + '"]').classList.add('right');
          Array.prototype.forEach.call(document.querySelectorAll('[data-opt]'), function (x) { x.disabled = true; });
          el('lzNext').innerHTML = '<p class="center"><strong>' + (right ? '🎉 Correct!' : 'Good try — the green one is right.') + '</strong></p>' +
            '<button class="big primary" id="lzGo">' + (ui.quizStep === l.quiz.length - 1 ? 'See my result' : 'Next question ▶') + '</button>';
          el('lzGo').onclick = function () {
            ui.quizStep++;
            if (ui.quizStep < l.quiz.length) drawQuiz(); else drawResult();
          };
        };
      });
    }
    function drawResult() {
      var res = C.completeLesson(state, kid.id, l.id, idx, ui.quizScore, l.quiz.length);
      save();
      var badges = C.earnedBadges(state, kid.id);
      sheet('<div class="center"><div style="font-size:3rem">' + (res.passed ? '🎉' : '🌱') + '</div>' +
        '<h3>' + (res.passed ? 'Lesson complete!' : 'So close!') + '</h3>' +
        '<p>You scored ' + ui.quizScore + ' of ' + l.quiz.length + '.' + (res.passed ? ' Badge progress updated!' : ' You need ' + res.passMark + ' — read it once more and try again. You\'ve got this!') + '</p>' +
        '<p class="small">' + badges.length + ' badge' + (badges.length === 1 ? '' : 's') + ' earned so far.</p>' +
        '<button class="big primary" id="lzDone">Back to lessons</button></div>');
      if (res.passed) confetti();
      el('lzDone').onclick = function () { closeModal(); render(); };
    }
    drawRead();
  }

  /* ---------------- paywall (placeholder) ---------------- */
  function showPaywall() {
    sheet('<div class="card paywall" style="margin:0"><div class="center"><div style="font-size:2.4rem">⭐</div>' +
      '<h3>GoalJar Premium</h3><p class="small">For the whole family — one price, no per-kid fees, cancel in two taps.</p></div>' +
      '<div class="row"><div class="card center" style="margin:6px 0"><div class="price">$6.99</div><div class="small">CAD / month</div></div>' +
      '<div class="card center" style="margin:6px 0"><div class="price">$54.99</div><div class="small">CAD / year · best value</div></div></div>' +
      '<p>✅ <strong>Unlimited goals</strong> per kid<br>✅ <strong>All ' + LESSONS.length + ' lessons</strong> + new packs<br>✅ Weekly family summary &amp; streaks</p>' +
      '<p class="small">Every plan — free included — holds up to 4 kid profiles. Free plan: 2 goals per kid · first 10 lessons. No ads in either plan — ever.</p>' +
      '<button class="big gold" disabled>Premium arrives at launch 🎉</button>' +
      '<p class="small center">Purchases will be parent-gated with Google Play Billing when GoalJar launches. Nothing can be bought in this preview.</p>' +
      '<button class="big ghost" id="pwClose">Keep exploring free</button></div>');
    el('pwClose').onclick = closeModal;
  }

  /* ---------------- family sync (opt-in) ---------------- */
  function syncFacade() { return window.GoalJarSync || null; }
  function backupLocalState() {
    try { if (state) localStorage.setItem(KEY + '-preconnect-backup', C.serialize(state)); } catch (e) {}
  }
  function syncCardHtml() {
    var F = syncFacade();
    if (!F) return '';
    var st = F.status();
    if (st.mode === 'family') {
      var who = 'This device has parent access';
      if (st.role === 'kid') {
        var mine = state.kids.filter(function (k) { return k.id === st.profileLocalId; })[0];
        who = 'This device is signed in as ' + (mine ? esc(mine.name) + '’s profile' : 'a kid profile');
      }
      return '<div class="card"><h3>👨‍👩‍👧 Family Sync — on</h3>' +
        '<p class="small">' + who + '. Jars, chores, goals and lessons sync with your family. Premium stays with the Google account that bought it — it is never copied between devices by sync.</p>' +
        '<p class="small">Family code: <strong style="font-size:1.25rem;letter-spacing:3px">' + esc(st.code || '——————') + '</strong><br>On another device: Parent Mode → More → “Join with a code”, or enter the code during setup.</p>' +
        '<p class="small">' + (st.lastSyncAt ? 'Last synced ' + new Date(st.lastSyncAt).toLocaleTimeString('en-CA') + '.' : 'Not synced yet on this device.') + (st.lastError ? '<br>⚠️ ' + esc(st.lastError) : '') + '</p>' +
        '<div class="row"><button class="primary" id="syncNowBtn">🔄 Sync now</button><button class="ghost" id="syncLeaveBtn">Disconnect</button></div>' +
        '<p class="small">Disconnecting keeps everything on this device — it just stops syncing.</p>' +
        (st.role === 'kid' ? '' :
        '<h4 style="margin-top:16px">Delete the family account</h4>' +
        '<p class="small">This permanently deletes your Family Sync account, its family code, and <strong>everything stored on the sync server</strong>. Every connected device loses access. The copy of your family’s data on <em>this</em> device stays — to remove that too, use “Delete everything” below afterwards.</p>' +
        '<button class="danger" id="syncDeleteBtn" style="width:100%">🗑️ Delete family account</button>') +
        '</div>';
    }
    return '<div class="card"><h3>👨‍👩‍👧 Family Sync</h3>' +
      '<p class="small">By default GoalJar lives only on this device. Connect your family to share jars, chores, goals and lessons with a second phone — yours, or your kid’s. Accounts are for <strong>parents only</strong>; a kid’s device joins with a 6-digit family code and picks a profile. No kid emails, ever.</p>' +
      (st.pendingIntent ? '<p class="small"><strong>You picked “Connect my family” at setup — finish it here:</strong></p>' : '') +
      '<label>Parent email</label><input id="syncEmail" type="email" placeholder="you@example.com">' +
      '<label>Password</label><input id="syncPw" type="password" placeholder="8+ characters">' +
      '<div class="row"><button class="primary" id="syncCreateBtn">Create family account</button><button class="ghost" id="syncLoginBtn">Log in</button></div>' +
      '<h4 style="margin-top:16px">Joining a family instead?</h4>' +
      '<label>6-digit family code</label><input id="syncCode" inputmode="numeric" maxlength="6" placeholder="e.g. 123456">' +
      '<button class="big ghost" id="syncJoinBtn">Join with a code</button>' +
      '<label>Sync server</label><input id="syncBase" value="' + esc(st.base) + '">' +
      '<button class="ghost" id="syncBaseBtn" style="width:100%">Save server address</button></div>';
  }

  function startJoinFlow() {
    var F = syncFacade();
    if (!F) return;
    var code = (el('syncCode').value || '').trim();
    if (!/^\d{6}$/.test(code)) { toast('⚠️ Enter the 6-digit family code'); return; }
    sheet('<h3 class="center">Whose device is this?</h3>' +
      '<button class="big primary" id="joinKid">🧒 A kid’s device</button>' +
      '<button class="big gold" id="joinParent" style="margin-top:10px">👩 A parent’s device</button>' +
      '<button class="big ghost" id="joinCancel" style="margin-top:10px">Cancel</button>');
    el('joinCancel').onclick = closeModal;
    el('joinParent').onclick = function () {
      F.join(code, 'parent', null).then(function (jr) {
        var settings = (jr.snapshot || []).filter(function (r) { return r.collection === 'settings'; })[0];
        var famHash = settings && settings.data ? settings.data.parentPinHash : null;
        pinPad('Family parent PIN', function (pin) {
          if (!famHash || C.hashPin(pin) !== famHash) { toast('⚠️ That’s not the family parent PIN'); return; }
          backupLocalState();
          F.commitJoin(jr);
          save(); closeModal();
          toast('👨‍👩‍👧 This device joined the family as a parent!');
          lock();
        });
      }).catch(function (e) { closeModal(); toast('⚠️ ' + e.message, 3200); });
    };
    el('joinKid').onclick = function () {
      F.join(code, 'kid', null).then(function (listing) {
        if (!listing.profiles || !listing.profiles.length) { closeModal(); toast('⚠️ No kid profiles in that family yet'); return; }
        sheet('<h3 class="center">Who plays on this device?</h3>' +
          listing.profiles.map(function (p) {
            return '<button class="big ghost" data-joinprofile="' + esc(p.uid) + '" style="margin-top:8px">' + esc(p.avatar || '🦊') + ' ' + esc(p.name) + '</button>';
          }).join('') +
          '<button class="big ghost" id="joinCancel2" style="margin-top:10px">Cancel</button>');
        el('joinCancel2').onclick = closeModal;
        Array.prototype.forEach.call(document.querySelectorAll('[data-joinprofile]'), function (b) {
          b.onclick = function () {
            var uid = b.getAttribute('data-joinprofile');
            var prof = listing.profiles.filter(function (p) { return p.uid === uid; })[0];
            F.join(code, 'kid', uid).then(function (jr) {
              backupLocalState();
              F.commitJoin(jr);
              save(); closeModal();
              toast('🧒 All set — this is ' + (prof ? prof.name : 'your kid') + '’s device now!');
              lock();
            }).catch(function (e) { closeModal(); toast('⚠️ ' + e.message, 3200); });
          };
        });
      }).catch(function (e) { closeModal(); toast('⚠️ ' + e.message, 3200); });
    };
  }

  function bindSyncActions() {
    var F = syncFacade();
    if (!F) return;
    var sc = el('syncCreateBtn');
    if (sc) sc.onclick = function () {
      F.createFamily(el('syncEmail').value.trim(), el('syncPw').value).then(function (r) {
        F.setPendingIntent(false);
        toast('🎉 Family created! Your family code is ' + r.code, 4500);
        save(); render();
      }).catch(function (e) { toast('⚠️ ' + e.message, 3400); });
    };
    var sl = el('syncLoginBtn');
    if (sl) sl.onclick = function () {
      backupLocalState();
      F.login(el('syncEmail').value.trim(), el('syncPw').value).then(function () {
        save();
        toast('👨‍👩‍👧 Welcome back! Your family is loaded on this device.');
        lock();
      }).catch(function (e) { toast('⚠️ ' + e.message, 3400); });
    };
    var sj = el('syncJoinBtn');
    if (sj) sj.onclick = startJoinFlow;
    var sb = el('syncBaseBtn');
    if (sb) sb.onclick = function () { F.setBase(el('syncBase').value); toast('Server address saved'); };
    var sn = el('syncNowBtn');
    if (sn) sn.onclick = function () {
      F.syncNow().then(function (r) {
        save();
        toast(r.skipped ? 'Sync is off on this device' : '🔄 Synced!');
        render();
      }).catch(function (e) { toast('⚠️ ' + e.message, 3200); render(); });
    };
    var lv = el('syncLeaveBtn');
    if (lv) lv.onclick = function () {
      F.disconnect().then(function () {
        toast('Disconnected — everything stays on this device.');
        render();
      });
    };
    var del = el('syncDeleteBtn');
    if (del) del.onclick = function () {
      sheet('<h3>🗑️ Delete the family account?</h3>' +
        '<p>This <strong>permanently</strong> deletes your Family Sync account and all of your family’s data on the sync server — jars, chores, goals, lessons, the family code, everything. Every connected device loses access. This cannot be undone.</p>' +
        '<p>Your data on <em>this</em> device is kept as a local-only copy.</p>' +
        '<label>Enter your account password to confirm</label><input id="delPw" type="password" placeholder="Account password">' +
        '<div class="row"><button class="ghost" id="delNo">Keep the account</button><button class="danger" id="delYes">Yes, delete it forever</button></div>');
      el('delNo').onclick = closeModal;
      el('delYes').onclick = function () {
        var pw = el('delPw').value;
        if (!pw) { toast('⚠️ Enter your account password to confirm'); return; }
        F.deleteFamily(pw).then(function () {
          closeModal();
          toast('Family account deleted. This device is local-only now.', 3800);
          save(); render();
        }).catch(function (e) { toast('⚠️ ' + e.message, 3400); });
      };
    };
  }

  /* ---------------- parent mode ---------------- */
  var PARENT_TABS = [
    { id: 'dash', label: '📊 Dashboard' }, { id: 'inbox', label: '✅ Approvals' },
    { id: 'setup', label: '⚙️ Setup' }, { id: 'more', label: '⭐ More' }
  ];
  function renderParent() {
    var body = '';
    if (ui.ptab === 'dash') body = parentDash();
    else if (ui.ptab === 'inbox') body = parentInbox();
    else if (ui.ptab === 'setup') body = parentSetup();
    else if (ui.ptab === 'more') body = parentMore();
    el('app').innerHTML = topbar('<button class="ghost" id="lockBtn">🔒 Lock</button>') + body +
      tabbar(PARENT_TABS, ui.ptab, 'ptab');
    el('lockBtn').onclick = lock;
    bindTabs('ptab', function (t) { ui.ptab = t; render(); });
    bindParentActions();
  }

  function parentDash() {
    var cards = state.kids.map(function (kid) {
      var wk = C.weekSummary(state, kid.id);
      var split = C.needWantSplit(state, kid.id);
      var splitTotal = split.need + split.want;
      var needPct = splitTotal > 0 ? Math.round(split.need / splitTotal * 100) : 50;
      var goals = state.goals.filter(function (g) { return g.kidId === kid.id; });
      var pendingCt = state.chores.filter(function (c) { return c.kidId === kid.id && c.status === 'pending'; }).length +
        state.spendRequests.filter(function (r) { return r.kidId === kid.id && r.status === 'pending'; }).length;
      return '<div class="card"><h3>' + kid.avatar + ' ' + esc(kid.name) + ' <span class="small">· ages ' + kid.ageBand + '</span>' +
        (pendingCt ? ' <span class="pill" style="border-color:#ffb3b3;color:#c0392b">' + pendingCt + ' waiting ✅</span>' : '') + '</h3>' +
        '<div class="row"><div class="center"><div class="small">🟠 Spend</div><strong>' + money(C.balance(state, kid.id, 'spend')) + '</strong></div>' +
        '<div class="center"><div class="small">🟢 Save</div><strong>' + money(C.balance(state, kid.id, 'save')) + '</strong></div>' +
        '<div class="center"><div class="small">🩷 Give</div><strong>' + money(C.balance(state, kid.id, 'give')) + '</strong></div>' +
        '<div class="center"><div class="small">Total</div><strong>' + money(C.totalBalance(state, kid.id)) + '</strong></div></div>' +
        (goals.length ? goals.map(function (g) {
          var pct = Math.round(C.goalProgress(state, g) * 100);
          return '<p class="small" style="margin:8px 0 2px">' + g.icon + ' ' + esc(g.name) + ' — ' + money(C.goalSaved(state, g.id)) + ' / ' + money(g.targetCents) + (g.done ? ' 🏆' : '') + '</p><div class="progressbar"><div style="width:' + pct + '%"></div></div>';
        }).join('') : '<p class="small">No goals yet.</p>') +
        '<p class="small">📅 This week — earned ' + money(wk.earned) + ' · saved ' + money(wk.saved) + ' · spent ' + money(wk.spent) + ' · gave ' + money(wk.given) +
        '<br>📚 Lessons: ' + C.lessonsCompleted(state, kid.id) + '/' + LESSONS.length + ' · 🔥 streak: ' + C.savingStreakWeeks(state, kid.id) + ' wk</p>' +
        (splitTotal > 0 ? '<p class="small" style="margin-bottom:4px">Needs vs wants (from reflections): ' + money(split.need) + ' needs · ' + money(split.want) + ' wants</p>' +
          '<div class="splitbar"><div class="need" style="width:' + needPct + '%"></div><div class="want" style="width:' + (100 - needPct) + '%"></div></div>' : '<p class="small">No need/want reflections logged yet.</p>') +
        '</div>';
    }).join('');
    return '<h2>📊 Family dashboard</h2>' + cards +
      '<p class="small center">Reminder: GoalJar tracks pretend money — the real dollars stay with you. Review the weekly numbers together; it takes two minutes and it\'s where the learning happens.</p>';
  }

  function parentInbox() {
    var chores = state.chores.filter(function (c) { return c.status === 'pending'; });
    var reqs = state.spendRequests.filter(function (r) { return r.status === 'pending'; });
    var choreHtml = chores.map(function (c) {
      var kid = C.getKid(state, c.kidId);
      return '<div class="item"><span class="ic">🧹</span><div class="grow"><strong>' + esc(c.title) + '</strong><br>' +
        '<span class="small">' + kid.avatar + ' ' + esc(kid.name) + ' says it\'s done · worth ' + money(c.valueCents) + '</span></div>' +
        '<button class="primary" data-approve-chore="' + c.id + '">Approve</button><button class="danger" data-reject-chore="' + c.id + '">Not yet</button></div>';
    }).join('');
    var reqHtml = reqs.map(function (r) {
      var kid = C.getKid(state, r.kidId);
      return '<div class="item"><span class="ic">🙋</span><div class="grow"><strong>' + money(r.amountCents) + '</strong> — ' + esc(r.note || 'spend request') + '<br>' +
        '<span class="small">' + kid.avatar + ' ' + esc(kid.name) + ' · Spend jar has ' + money(C.balance(state, kid.id, 'spend')) + '</span></div>' +
        '<button class="primary" data-approve-req="' + r.id + '">Approve</button><button class="danger" data-decline-req="' + r.id + '">Decline</button></div>';
    }).join('');
    if (!chores.length && !reqs.length) return '<h2>✅ Approvals</h2><div class="card center"><p style="font-size:2rem">🎉</p><p>All caught up!<br><span class="small">Chore checks and spend requests will appear here.</span></p></div>';
    return '<h2>✅ Approvals</h2>' + (choreHtml ? '<h3>Chores to check</h3>' + choreHtml : '') + (reqHtml ? '<h3>Spend requests</h3>' + reqHtml : '');
  }

  function parentSetup() {
    var kidBlocks = state.kids.map(function (kid) {
      var rule = state.allowanceRules.filter(function (r) { return r.kidId === kid.id; })[0];
      return '<div class="card"><h3>' + kid.avatar + ' ' + esc(kid.name) + '</h3>' +
        '<h4>🧹 Add a chore</h4>' +
        '<label>Chore</label><input id="ch-title-' + kid.id + '" maxlength="40" placeholder="e.g. Take out recycling">' +
        '<label>Value ($)</label><input id="ch-val-' + kid.id + '" type="number" min="0" step="0.25" placeholder="e.g. 1.50">' +
        '<button class="ghost" data-addchore="' + kid.id + '" style="width:100%">Add chore</button>' +
        '<h4 style="margin-top:18px">📅 Allowance</h4>' +
        (rule ? '<p class="small">Current: ' + money(rule.amountCents) + ' every ' + DAYNAMES[rule.dayOfWeek] + ' · split ' + rule.split.spend + '/' + rule.split.save + '/' + rule.split.give + ' (Spend/Save/Give)</p>' : '<p class="small">Not set yet.</p>') +
        '<label>Amount ($)</label><input id="al-amt-' + kid.id + '" type="number" min="0" step="0.25" placeholder="e.g. 5">' +
        '<label>Day</label><select id="al-day-' + kid.id + '">' + DAYNAMES.map(function (d, i) { return '<option value="' + i + '"' + (i === 6 ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
        '<div class="row"><div><label>🟠 Spend %</label><input id="al-sp-' + kid.id + '" type="number" value="50"></div>' +
        '<div><label>🟢 Save %</label><input id="al-sv-' + kid.id + '" type="number" value="40"></div>' +
        '<div><label>🩷 Give %</label><input id="al-gv-' + kid.id + '" type="number" value="10"></div></div>' +
        '<button class="ghost" data-setallow="' + kid.id + '" style="width:100%">Save allowance</button></div>';
    }).join('');
    return '<h2>⚙️ Setup</h2>' + kidBlocks +
      '<div class="card"><h3>👧 Add another kid</h3>' +
      '<label>First name</label><input id="nk-name" maxlength="20">' +
      '<label>Avatar</label><div class="avatarpick" id="nk-av">' + C.AVATARS.map(function (a, i) { return '<span class="chip' + (i === 1 ? ' on' : '') + '" data-nav="' + a + '">' + a + '</span>'; }).join('') + '</div>' +
      '<label>Age band</label><select id="nk-band"><option value="6-9">6–9 years</option><option value="9-12">9–12 years</option></select>' +
      '<label>Optional kid PIN</label><input id="nk-pin" type="password" inputmode="numeric" maxlength="8" placeholder="Leave blank for none">' +
      '<button class="big primary" id="nk-add">Add kid</button>' +
      '<p class="small">GoalJar families can hold up to 4 kids — on every plan.</p></div>';
  }

  function parentMore() {
    return '<h2>⭐ More</h2>' + syncCardHtml() +
      '<div class="card paywall"><h3>⭐ GoalJar Premium</h3>' +
      '<p class="small">$6.99 CAD/month or $54.99 CAD/year — unlimited goals, all lessons, weekly family summary. Purchases will be parent-gated with Google Play Billing at launch.</p>' +
      '<button class="big gold" id="pwBtn">See Premium</button></div>' +
      '<div class="card"><h3>🔐 Change parent PIN</h3>' +
      '<label>Current PIN</label><input id="cp-old" type="password" inputmode="numeric" maxlength="8">' +
      '<label>New PIN</label><input id="cp-new" type="password" inputmode="numeric" maxlength="8">' +
      '<button class="ghost" id="cpBtn" style="width:100%">Change PIN</button></div>' +
      '<div class="card"><h3>🛡️ Privacy &amp; your data</h3>' +
      '<p class="small">Staying on this device? Everything stays here — no accounts, nothing collected. Turned on <strong>Family Sync</strong>? Your jars, chores, goals and lessons are stored on the family sync server so your own devices can share them. Either way: accounts belong to parents only, kids use first names and a cartoon avatar, and GoalJar collects no location, no contacts, and shows <strong>no ads at all</strong>. GoalJar is a money <em>tracker and teacher</em>, not a bank — no real money is held, moved, or promised by the app.</p>' +
      '<div class="row"><button class="ghost" id="exportBtn">⬇️ Export family data (JSON)</button>' +
      '<button class="danger" id="wipeBtn">🗑️ Delete everything</button></div></div>';
  }

  function bindParentActions() {
    if (ui.ptab === 'inbox') {
      Array.prototype.forEach.call(document.querySelectorAll('[data-approve-chore]'), function (b) {
        b.onclick = function () {
          var c = C.getChore(state, b.getAttribute('data-approve-chore'));
          var r = tryDo(function () { return withBadges(c.kidId, function () { return C.parentApproveChore(state, c.id); }); });
          if (r) { save(); toast('💪 Chore approved — ' + money(c.valueCents) + ' paid!'); render(); }
        };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-reject-chore]'), function (b) {
        b.onclick = function () { tryDo(function () { C.parentRejectChore(state, b.getAttribute('data-reject-chore')); }); save(); toast('Sent back — not quite done yet'); render(); };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-approve-req]'), function (b) {
        b.onclick = function () {
          var r = tryDo(function () { return C.resolveSpendRequest(state, b.getAttribute('data-approve-req'), true, {}); });
          if (r !== null) { save(); toast('✅ Request approved'); render(); }
        };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-decline-req]'), function (b) {
        b.onclick = function () { tryDo(function () { C.resolveSpendRequest(state, b.getAttribute('data-decline-req'), false); }); save(); toast('Request declined — good chance to talk about why 💬'); render(); };
      });
    }
    if (ui.ptab === 'setup') {
      var navatar = C.AVATARS[1];
      Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (ch) {
        ch.onclick = function () {
          navatar = ch.getAttribute('data-nav');
          Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (x) { x.classList.toggle('on', x === ch); });
        };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-addchore]'), function (b) {
        b.onclick = function () {
          var kidId = b.getAttribute('data-addchore');
          var r = tryDo(function () {
            return C.addChore(state, kidId, { title: el('ch-title-' + kidId).value, valueCents: toCents(el('ch-val-' + kidId).value) });
          });
          if (r) { save(); toast('🧹 Chore added!'); render(); }
        };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-setallow]'), function (b) {
        b.onclick = function () {
          var kidId = b.getAttribute('data-setallow');
          var r = tryDo(function () {
            return C.setAllowance(state, kidId, {
              amountCents: toCents(el('al-amt-' + kidId).value),
              dayOfWeek: parseInt(el('al-day-' + kidId).value, 10),
              split: { spend: parseInt(el('al-sp-' + kidId).value, 10) || 0, save: parseInt(el('al-sv-' + kidId).value, 10) || 0, give: parseInt(el('al-gv-' + kidId).value, 10) || 0 }
            });
          });
          if (r) { C.postDueAllowances(state); save(); toast('📅 Allowance saved!'); render(); }
        };
      });
      var nk = el('nk-add');
      if (nk) nk.onclick = function () {
        var r = tryDo(function () {
          return C.addKid(state, { name: el('nk-name').value, avatar: navatar, ageBand: el('nk-band').value, kidPin: el('nk-pin').value.trim() || null });
        });
        // On failure tryDo has already toasted the reason — at the
        // 4-kid cap that's the friendly "families can hold up to 4
        // kids" message. Kid profiles are NOT a Premium unlock, so
        // never answer this failure with the paywall.
        if (r) { save(); toast('👋 Welcome, ' + r.name + '!'); render(); }
      };
    }
    if (ui.ptab === 'more') {
      bindSyncActions();
      el('pwBtn').onclick = showPaywall;
      el('cpBtn').onclick = function () {
        var r = tryDo(function () { C.setParentPin(state, el('cp-old').value.trim(), el('cp-new').value.trim()); return true; });
        if (r) { save(); toast('🔐 Parent PIN changed'); render(); }
      };
      el('exportBtn').onclick = function () {
        var blob = new Blob([C.serialize(state)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'goaljar-family-data.json'; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      };
      el('wipeBtn').onclick = function () {
        sheet('<h3>🗑️ Delete everything?</h3><p>This removes all kids, jars, goals, chores and lessons from this device. This cannot be undone.</p>' +
          '<div class="row"><button class="ghost" id="wNo">Keep it</button><button class="danger" id="wYes">Yes, delete</button></div>');
        el('wNo').onclick = closeModal;
        el('wYes').onclick = function () {
          localStorage.removeItem(KEY); state = null; closeModal(); render();
        };
      };
    }
  }

  /* ---------------- router / boot ---------------- */
  function render() {
    closeModal();
    if (!state) { renderSetup(); return; }
    if (ui.screen === 'kid' && ui.kidId) renderKid();
    else if (ui.screen === 'parent') renderParent();
    else renderPicker();
  }
  if (window.GoalJarSync) {
    window.GoalJarSync.bind({
      getState: function () { return state; },
      setState: function (s) { state = s; },
      save: save,
      render: render,
      onSynced: function () {
        if (!state) return;
        // A sync may have brought a newer allowance rule or clock —
        // post anything now due, then push those entries back out.
        var posted = C.postDueAllowances(state);
        save();
        if (posted && posted.length) window.GoalJarSync.kick();
      }
    });
  }
  render();
  if (window.GoalJarSync) window.GoalJarSync.kick();
})();
