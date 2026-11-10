/* XKing Core - shared logic for index.html, login.html and register.html.
   Preview build: every account, coin, post and quiz is saved in this browser's localStorage only.
   Before going public, replace the "Data layer" section with calls to a real backend. */
(function () {
  'use strict';

  var CONFIG = {
    linktreeUrl: 'https://claude.ai/artifact/DSbtEpBz75QjDKtX4Mrm33',
    quizDelayMs: 20000,
    quizReward: 10,
    userIterations: 100000,
    admin: {
      salt: 'xk-core-admin-v1-4d68d7ba4b7e81ac',
      iterations: 150000,
      hash: 'f97634139944fbe28db9b7cc3a19a611ddf56d782605e5f57bfda9c5abbaf8ec'
    }
  };
  var K = { users: 'xk1.users', posts: 'xk1.posts', quiz: 'xk1.quiz', audit: 'xk1.audit', session: 'xk1.session', theme: 'xk1.theme', admin: 'xk1.admin' };
  var EMOJI = ['\u{1F44D}', '❤️', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F389}'];

  var ICON = {
    device: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10" rx="2"/><path d="M7 17h6M10 13.5V17"/></svg>',
    light: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.3"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 11.6A6.8 6.8 0 0 1 8.4 3.5a6.8 6.8 0 1 0 8.1 8.1z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.4-2.9 8-7 9.5-4.1-1.5-7-5.1-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>',
    person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>'
  };

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function emit(n, d) { document.dispatchEvent(new CustomEvent('xk:' + n, { detail: d || {} })); }
  function on(n, f) { document.addEventListener('xk:' + n, f); }
  function fmtDate(ts) { try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
  function fmtTime(ts) { try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
  function fmtStamp(ts) { return fmtDate(ts) + ', ' + fmtTime(ts); }
  function nf(n) { return Number(n || 0).toLocaleString('en-US'); }
  function attempt(fn) { return new Promise(function (res) { res(fn()); }); }

  /* ---------- storage (falls back to memory when the browser blocks it) ---------- */
  var lsOk = (function () { try { var k = '__xk'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })();
  var mem = {};
  function rawGet(k) { if (lsOk) { try { return localStorage.getItem(k); } catch (e) {} } return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }
  function rawSet(k, v) { if (lsOk) { try { localStorage.setItem(k, v); return; } catch (e) {} } mem[k] = v; }
  function rawDel(k) { if (lsOk) { try { localStorage.removeItem(k); } catch (e) {} } delete mem[k]; }
  function get(k, d) { var v = rawGet(k); if (v == null) return d; try { return JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { rawSet(k, JSON.stringify(v)); }

  var adminMem = false;
  function adminOn() { try { return sessionStorage.getItem(K.admin) === '1'; } catch (e) { return adminMem; } }
  function setAdmin(v) { adminMem = v; try { if (v) sessionStorage.setItem(K.admin, '1'); else sessionStorage.removeItem(K.admin); } catch (e) {} }

  /* ---------- password hashing ---------- */
  function b2h(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function derive(pw, salt, iter) {
    if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('This page needs a secure (HTTPS) connection to check passwords.'));
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: iter, hash: 'SHA-256' }, k, 256);
    }).then(b2h);
  }
  function throttle(max, ms) {
    var n = 0, until = 0;
    return {
      wait: function () { return Math.max(0, Math.ceil((until - Date.now()) / 1000)); },
      fail: function () { n++; if (n >= max) { until = Date.now() + ms; n = 0; } },
      reset: function () { n = 0; }
    };
  }
  var loginThrottle = throttle(5, 30000), adminThrottle = throttle(5, 30000);

  /* ======================= Data layer ======================= */
  function users() { return get(K.users, []); }
  function saveUsers(a) { set(K.users, a); emit('data'); }
  function userById(id) { return users().filter(function (u) { return u.id === id; })[0] || null; }
  function currentUser() {
    var s = get(K.session, null);
    if (!s) return null;
    var u = userById(s.id);
    if (!u) { rawDel(K.session); return null; }
    return u;
  }
  function setSession(id) { set(K.session, { id: id }); emit('data'); }
  function newUser(o) {
    return {
      id: uid(), username: o.username, email: o.email || null, salt: o.salt || null, hash: o.hash || null,
      role: 'player', avatar: null, coins: 0, gold: 0, linked: { google: null, discord: null },
      items: [], ledger: [], notifyQuiz: false, createdAt: Date.now()
    };
  }
  function checkUsername(name, ignoreId) {
    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(name)) return 'Username must be 3 to 20 characters: letters, numbers, dot, dash or underscore.';
    var clash = users().some(function (u) { return u.id !== ignoreId && u.username.toLowerCase() === name.toLowerCase(); });
    return clash ? 'That username is taken.' : '';
  }
  function checkEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? '' : 'Enter a valid email address.'; }

  var auth = {
    current: currentUser,
    list: users,
    byId: userById,
    checkUsername: checkUsername,
    register: function (o) {
      var username = String(o.username || '').trim(), email = String(o.email || '').trim().toLowerCase();
      var e = checkUsername(username) || checkEmail(email) || (String(o.password || '').length < 8 ? 'Password must be at least 8 characters.' : '');
      if (e) return Promise.reject(new Error(e));
      if (users().some(function (u) { return u.email === email; })) return Promise.reject(new Error('An account with that email already exists.'));
      var salt = uid() + uid();
      return derive(o.password, salt, CONFIG.userIterations).then(function (hash) {
        var list = users(), u = newUser({ username: username, email: email, salt: salt, hash: hash });
        list.push(u); saveUsers(list); setSession(u.id);
        return u;
      });
    },
    login: function (id, pw) {
      var w = loginThrottle.wait();
      if (w) return Promise.reject(new Error('Too many attempts. Try again in ' + w + 's.'));
      var key = String(id || '').trim().toLowerCase();
      var u = users().filter(function (x) { return x.username.toLowerCase() === key || (x.email && x.email === key); })[0];
      var bad = new Error('Incorrect email, username or password.');
      if (!u) { loginThrottle.fail(); return Promise.reject(bad); }
      if (!u.hash) return Promise.reject(new Error('This account signs in with Google or Discord. Use one of those buttons.'));
      return derive(pw, u.salt, CONFIG.userIterations).then(function (h) {
        if (h !== u.hash) { loginThrottle.fail(); throw bad; }
        loginThrottle.reset(); setSession(u.id); return u;
      });
    },
    provider: function (p, handle) {
      handle = String(handle || '').trim();
      if (handle.length < 2 || handle.length > 32) throw new Error('Enter a handle between 2 and 32 characters.');
      var list = users(), lc = handle.toLowerCase();
      var u = list.filter(function (x) { return x.linked[p] && x.linked[p].toLowerCase() === lc; })[0];
      if (!u) {
        var base = handle.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 16) || 'player', name = base, n = 1;
        while (name.length < 3 || checkUsername(name)) { name = base + (++n); }
        u = newUser({ username: name });
        u.linked[p] = handle; list.push(u); saveUsers(list);
      }
      setSession(u.id); return u;
    },
    logout: function () { rawDel(K.session); emit('data'); },
    update: function (id, patch) {
      var list = users(), u = list.filter(function (x) { return x.id === id; })[0];
      if (!u) throw new Error('Account not found.');
      Object.keys(patch).forEach(function (k) { u[k] = patch[k]; });
      saveUsers(list); return u;
    },
    link: function (id, p, handle) {
      handle = String(handle || '').trim();
      if (handle.length < 2 || handle.length > 32) throw new Error('Enter a handle between 2 and 32 characters.');
      var list = users(), lc = handle.toLowerCase();
      var other = list.filter(function (x) { return x.id !== id && x.linked[p] && x.linked[p].toLowerCase() === lc; })[0];
      if (other) throw new Error('That ' + p + ' account is already linked to another profile.');
      var u = list.filter(function (x) { return x.id === id; })[0];
      u.linked[p] = handle; saveUsers(list); return u;
    },
    unlink: function (id, p) {
      var list = users(), u = list.filter(function (x) { return x.id === id; })[0];
      var n = (u.hash ? 1 : 0) + (u.linked.google ? 1 : 0) + (u.linked.discord ? 1 : 0);
      if (n <= 1) throw new Error('Keep at least one way to sign in. Link another account first.');
      u.linked[p] = null; saveUsers(list); return u;
    },
    award: function (userId, delta, currency, reason, by) {
      delta = Math.trunc(Number(delta));
      if (!delta) throw new Error('Enter an amount other than 0.');
      var list = users(), u = list.filter(function (x) { return x.id === userId; })[0];
      if (!u) throw new Error('Account not found.');
      var key = currency === 'gold' ? 'gold' : 'coins', next = (u[key] || 0) + delta;
      if (next < 0) throw new Error('Balance cannot go below 0.');
      u[key] = next;
      u.ledger = u.ledger || [];
      u.ledger.unshift({ id: uid(), ts: Date.now(), delta: delta, currency: key, reason: reason || '', by: by || 'System' });
      u.ledger = u.ledger.slice(0, 100);
      saveUsers(list); return u;
    },
    remove: function (id) {
      saveUsers(users().filter(function (u) { return u.id !== id; }));
      var s = get(K.session, null); if (s && s.id === id) rawDel(K.session);
    }
  };

  /* ---------- audit log ---------- */
  function auditAdd(action, target, detail) {
    var a = get(K.audit, []);
    a.unshift({ id: uid(), ts: Date.now(), action: action, target: target || '', detail: detail || '' });
    set(K.audit, a.slice(0, 200)); emit('data');
  }

  /* ---------- posts ---------- */
  function seedPosts() {
    var now = Date.now();
    return [
      { id: uid(), type: 'announcement', title: 'Welcome to the XKing hub', createdAt: now - 3600000, author: 'XKing Studio', sample: true, reactions: {}, replies: [],
        body: 'This is where announcements, events and games for **XKing Supreme Large City** live.\n\n- Read every announcement, even if you are not on Discord\n- Join events and earn Coins\n- Play ACT Games\n\nSign up to save your progress.' },
      { id: uid(), type: 'announcement', title: 'Where to download the modpacks', createdAt: now - 7200000, author: 'XKing Studio', sample: true, reactions: {}, replies: [],
        body: 'The modpacks are published on CurseForge and Modrinth. Every link is on our LinkTree.\n\n> Forge 1.20.1 is the main version. NeoForge 1.21.1 is the lighter one for weaker PCs and laptops.' },
      { id: uid(), type: 'event', title: 'Live Trivia Quiz nights', createdAt: now - 5400000, author: 'XKing Studio', sample: true, reactions: {}, replies: [], when: 'Whenever an operator posts a quiz', link: '',
        body: 'Operators run live Trivia Quizzes from the **ACT Games** tab. A correct answer earns **10 Coins**.\n\nTurn on quiz notifications to get a 20-second heads-up.' }
    ];
  }
  function allPosts() { var p = get(K.posts, null); if (!p) { p = seedPosts(); set(K.posts, p); } return p; }
  function savePosts(p) { set(K.posts, p); emit('data'); }
  var posts = {
    list: function (type) { return allPosts().filter(function (p) { return !type || p.type === type; }).sort(function (a, b) { return b.createdAt - a.createdAt; }); },
    add: function (o) {
      var list = allPosts();
      var p = { id: uid(), type: o.type === 'event' ? 'event' : 'announcement', title: o.title, body: o.body, createdAt: Date.now(), author: 'XKing Studio', reactions: {}, replies: [], link: o.link || '', when: o.when || '' };
      list.unshift(p); savePosts(list); auditAdd('Posted ' + p.type, p.title); return p;
    },
    remove: function (id) {
      var list = allPosts(), p = list.filter(function (x) { return x.id === id; })[0];
      savePosts(list.filter(function (x) { return x.id !== id; }));
      if (p) auditAdd('Deleted ' + p.type, p.title);
    },
    react: function (pid, emoji, userId) {
      var list = allPosts(), p = list.filter(function (x) { return x.id === pid; })[0];
      if (!p || EMOJI.indexOf(emoji) < 0) return;
      p.reactions = p.reactions || {};
      var arr = p.reactions[emoji] || [], i = arr.indexOf(userId);
      if (i >= 0) arr.splice(i, 1); else arr.push(userId);
      p.reactions[emoji] = arr; savePosts(list);
    },
    reply: function (pid, userId, text) {
      text = String(text || '').trim();
      if (!text) throw new Error('Write something first.');
      if (text.length > 400) throw new Error('Replies are limited to 400 characters.');
      var list = allPosts(), p = list.filter(function (x) { return x.id === pid; })[0];
      if (!p) throw new Error('That post no longer exists.');
      p.replies = p.replies || [];
      p.replies.push({ id: uid(), ts: Date.now(), text: text, userId: userId });
      savePosts(list);
    },
    removeReply: function (pid, rid) {
      var list = allPosts(), p = list.filter(function (x) { return x.id === pid; })[0];
      if (!p) return;
      p.replies = (p.replies || []).filter(function (r) { return r.id !== rid; });
      savePosts(list); auditAdd('Deleted a reply', p.title);
    }
  };

  /* ---------- trivia quiz ---------- */
  function getQuiz() { return get(K.quiz, null); }
  function phase(q) { if (!q) return 'none'; if (q.status === 'closed') return 'closed'; return Date.now() < q.startsAt ? 'scheduled' : 'live'; }
  var quiz = {
    get: getQuiz,
    phase: phase,
    post: function (question, key) {
      question = String(question || '').trim();
      if (!question) throw new Error('Write the question first.');
      var now = Date.now();
      var q = { id: uid(), question: question, key: String(key || '').trim(), postedAt: now, startsAt: now + CONFIG.quizDelayMs, status: 'open', answers: [] };
      set(K.quiz, q); auditAdd('Posted Trivia Quiz', question.slice(0, 80)); return q;
    },
    answer: function (userId, text) {
      var q = getQuiz();
      if (phase(q) !== 'live') throw new Error('There is no live quiz right now.');
      text = String(text || '').trim();
      if (!text) throw new Error('Type your answer first.');
      if (q.answers.some(function (a) { return a.userId === userId; })) throw new Error('You already answered this quiz.');
      q.answers.push({ id: uid(), userId: userId, text: text.slice(0, 120), ts: Date.now(), result: 'pending' });
      set(K.quiz, q); emit('data');
    },
    mark: function (answerId, result) {
      var q = getQuiz();
      var a = q && q.answers.filter(function (x) { return x.id === answerId; })[0];
      if (!a) throw new Error('Answer not found.');
      if (a.result !== 'pending') throw new Error('That answer is already marked.');
      if (result === 'correct') auth.award(a.userId, CONFIG.quizReward, 'coins', 'Trivia Quiz: correct answer', 'Operator');
      a.result = result === 'correct' ? 'correct' : 'wrong';
      set(K.quiz, q);
      var who = userById(a.userId);
      auditAdd('Marked answer ' + a.result, who ? who.username : 'Deleted user', a.text);
    },
    close: function () {
      var q = getQuiz(); if (!q) return;
      q.status = 'closed'; set(K.quiz, q); auditAdd('Closed Trivia Quiz', q.question.slice(0, 80));
    }
  };

  /* ---------- markdown (HTML is escaped first, so output is safe) ---------- */
  function md(src) {
    var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n'), out = [], i = 0;
    function inline(t) {
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
      t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, a, b) { return '<a href="' + b + '" target="_blank" rel="noopener noreferrer">' + a + '</a>'; });
      return t;
    }
    var BLOCK = /^(```|#{1,3}\s|>|\s*[-*]\s+|\s*\d+[.)]\s+)/;
    while (i < lines.length) {
      var ln = lines[i], m;
      if (/^\s*$/.test(ln)) { i++; continue; }
      if (/^```/.test(ln)) {
        var code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++; out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); continue;
      }
      if ((m = /^(#{1,3})\s+(.*)$/.exec(ln))) { var l = 3 + m[1].length; out.push('<h' + l + '>' + inline(m[2]) + '</h' + l + '>'); i++; continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(ln)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(ln)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
        out.push('<blockquote>' + inline(q.join(' ')) + '</blockquote>'); continue;
      }
      if (/^\s*[-*]\s+/.test(ln)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { ul.push('<li>' + inline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>'); i++; }
        out.push('<ul>' + ul.join('') + '</ul>'); continue;
      }
      if (/^\s*\d+[.)]\s+/.test(ln)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { ol.push('<li>' + inline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++; }
        out.push('<ol>' + ol.join('') + '</ol>'); continue;
      }
      var para = [ln]; i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !BLOCK.test(lines[i])) { para.push(lines[i]); i++; }
      out.push('<p>' + para.map(inline).join('<br>') + '</p>');
    }
    return out.join('');
  }

  /* ======================= UI helpers ======================= */
  function toast(msg, kind) {
    var host = $('#toasts');
    if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.className = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    var t = document.createElement('div');
    t.className = 'toast' + (kind === 'error' ? ' is-error' : kind === 'ok' ? ' is-ok' : '');
    t.textContent = msg; host.appendChild(t);
    setTimeout(function () { t.remove(); }, 4800);
  }

  function dialog(o) {
    return new Promise(function (resolve) {
      var opener = document.activeElement, id = 'dlg' + uid();
      var ov = document.createElement('div'); ov.className = 'overlay';
      var fieldsHtml = (o.fields || []).map(function (f, i) {
        var fid = id + '_' + i, ctl;
        var common = ' id="' + fid + '" name="' + esc(f.name) + '"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '');
        if (f.type === 'select') {
          ctl = '<select' + common + '>' + f.options.map(function (op) {
            return '<option value="' + esc(op.value) + '"' + (String(op.value) === String(f.value) ? ' selected' : '') + '>' + esc(op.label) + '</option>';
          }).join('') + '</select>';
        } else if (f.type === 'textarea') {
          ctl = '<textarea' + common + ' rows="3">' + esc(f.value || '') + '</textarea>';
        } else {
          ctl = '<input' + common + ' type="' + (f.type || 'text') + '" value="' + esc(f.value == null ? '' : f.value) + '" autocomplete="' + (f.autocomplete || 'off') + '"' + (f.step ? ' step="' + f.step + '"' : '') + '>';
        }
        return '<div class="field"><label for="' + fid + '">' + esc(f.label) + (f.required ? ' <span class="req" aria-hidden="true">*</span>' : '') + '</label>' + ctl + (f.hint ? '<p class="hint">' + esc(f.hint) + '</p>' : '') + '</div>';
      }).join('');
      ov.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="' + id + 't"><h2 id="' + id + 't" class="display">' + esc(o.title) + '</h2>' +
        (o.message ? '<p class="modal-msg">' + esc(o.message) + '</p>' : '') +
        '<form novalidate>' + fieldsHtml + '<p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="btn-ghost" data-x="cancel">' + esc(o.cancelLabel || 'Cancel') + '</button><button type="submit" class="' + (o.danger ? 'btn-danger' : 'btn-primary') + '">' + esc(o.confirmLabel || 'OK') + '</button></div></form></div>';
      document.body.appendChild(ov);
      var form = $('form', ov), err = $('.form-error', ov), submit = $('[type="submit"]', ov);

      function close(val) {
        document.removeEventListener('keydown', onKey, true); ov.remove();
        try { if (opener && opener.focus) opener.focus(); } catch (e) {}
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
        if (e.key === 'Tab') {
          var f = $$('input, select, textarea, button', ov).filter(function (x) { return !x.disabled; });
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      function showErr(m) { err.textContent = m; err.hidden = false; }
      document.addEventListener('keydown', onKey, true);
      ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(null); });
      $('[data-x="cancel"]', ov).addEventListener('click', function () { close(null); });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var vals = {}, missing = '';
        (o.fields || []).forEach(function (f, i) {
          var c = $('#' + id + '_' + i, ov); vals[f.name] = c.value;
          if (f.required && !String(c.value).trim() && !missing) missing = f.label;
        });
        if (missing) { showErr(missing + ' is required.'); return; }
        err.hidden = true; submit.disabled = true;
        Promise.resolve().then(function () { return o.onSubmit ? o.onSubmit(vals) : null; }).then(
          function () { close(vals); },
          function (er) { submit.disabled = false; showErr(er && er.message ? er.message : String(er)); }
        );
      });
      var firstField = $('input, select, textarea', ov);
      setTimeout(function () { (firstField || submit).focus(); }, 30);
    });
  }
  function confirmDialog(title, message, confirmLabel, danger) {
    return dialog({ title: title, message: message, confirmLabel: confirmLabel || 'Confirm', danger: danger });
  }
  function providerDialog(provider) {
    var name = provider === 'google' ? 'Google' : 'Discord';
    return dialog({
      title: 'Continue with ' + name,
      message: 'Preview build: ' + name + ' sign-in is not connected to a server yet. Enter a handle to simulate it. Coins stay in sync across every account linked to the same profile.',
      fields: [{ name: 'handle', label: name + ' handle', required: true, placeholder: provider === 'google' ? 'you@gmail.com' : 'yourname' }],
      confirmLabel: 'Continue'
    }).then(function (v) { return v ? v.handle.trim() : null; });
  }

  /* ---------- theme ---------- */
  function themeMode() { var m = rawGet(K.theme); return m === 'light' || m === 'dark' ? m : 'device'; }
  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function applyTheme(mode) {
    var r = document.documentElement;
    if (mode === 'light' || mode === 'dark') r.setAttribute('data-theme', mode); else r.removeAttribute('data-theme');
    $$('.theme button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === mode ? 'true' : 'false'); });
    emit('theme');
  }
  function mountThemeSwitch(host) {
    host.innerHTML = '<div class="theme" role="group" aria-label="Color theme">' +
      [['device', 'Device'], ['light', 'Light'], ['dark', 'Dark']].map(function (m) {
        return '<button type="button" data-mode="' + m[0] + '" aria-pressed="false" aria-label="' + m[1] + ' theme">' + ICON[m[0]] + '<span class="lbl">' + m[1] + '</span></button>';
      }).join('') + '</div>';
    $$('button', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-mode');
        if (m === 'device') rawDel(K.theme); else rawSet(K.theme, m);
        applyTheme(m);
      });
    });
    applyTheme(themeMode());
  }

  /* ---------- skyline banner (drawn with code, no screenshots) ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hexA(c) { return [1, 3, 5].map(function (i) { return parseInt(c.slice(i, i + 2), 16); }); }
  function rgbS(a) { return 'rgb(' + a.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))); }).join(',') + ')'; }
  function shade(c, n) { return rgbS(hexA(c).map(function (v) { return v + n; })); }
  function mix(a, b, t) { var x = hexA(a), y = hexA(b); return rgbS(x.map(function (v, i) { return v + (y[i] - v) * t; })); }
  var PAL = {
    day: { skyTop: '#7FB4E8', skyBot: '#F6E6C6', layers: ['#BCCBDB', '#A2B5C9', '#8399B2', '#627B97', '#445A73'], glass: '#CFE6F7', haze: 'rgba(246,230,198,', hazeA: '.30' },
    night: { skyTop: '#08111F', skyBot: '#C9712F', layers: ['#2E4058', '#243448', '#1B283A', '#121B2A', '#0B111B'], lit: ['#FFD98A', '#FFE9B8', '#BFE3FF', '#FFC46B'], litP: 0.4, haze: 'rgba(201,113,47,', hazeA: '.10' }
  };
  var LAY = [
    { w0: 40, w1: 90, h0: .60, h1: .84, ws: 5, hs: 8, hg: 4, vg: 5 },
    { w0: 50, w1: 110, h0: .52, h1: .80, ws: 6, hs: 9, hg: 4, vg: 5 },
    { w0: 60, w1: 120, h0: .42, h1: .72, ws: 7, hs: 10, hg: 5, vg: 6 },
    { w0: 70, w1: 140, h0: .30, h1: .60, ws: 8, hs: 12, hg: 5, vg: 6 },
    { w0: 90, w1: 180, h0: .16, h1: .40, ws: 10, hs: 14, hg: 6, vg: 7 }
  ];
  function drawSkyline(cv) {
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, d = isDark(), P = d ? PAL.night : PAL.day, R = rng(20261026);
    function windows(x, top, w, h, L, col) {
      var base = d ? shade(col, 9) : mix(col, P.glass, 0.38);
      for (var yy = top + 7; yy + L.hs < top + h - 3; yy += L.hs + L.vg) {
        for (var xx = x + 5; xx + L.ws <= x + w - 4.5; xx += L.ws + L.hg) {
          var r = R();
          if (d) ctx.fillStyle = r < P.litP ? P.lit[(R() * P.lit.length) | 0] : base;
          else ctx.fillStyle = r < 0.12 ? mix(col, '#FFFFFF', 0.55) : (r < 0.5 ? base : mix(col, P.glass, 0.22));
          ctx.fillRect(xx, yy, L.ws, L.hs);
        }
      }
    }
    function block(x, top, w, h, col, L) {
      var gr = ctx.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, shade(col, d ? 12 : 16)); gr.addColorStop(0.6, col); gr.addColorStop(1, shade(col, -14));
      ctx.fillStyle = gr; ctx.fillRect(x, top, w, h);
      ctx.fillStyle = shade(col, d ? 22 : 26); ctx.fillRect(x, top, w, 2);
      windows(x, top + 2, w, h - 2, L, col);
    }
    ctx.clearRect(0, 0, W, H);
    var g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    g.addColorStop(0, P.skyTop); g.addColorStop(1, P.skyBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!d) {
      var sun = ctx.createRadialGradient(W * 0.78, H * 0.16, 10, W * 0.78, H * 0.16, 300);
      sun.addColorStop(0, 'rgba(255,244,214,.95)'); sun.addColorStop(1, 'rgba(255,244,214,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    }
    LAY.forEach(function (L, i) {
      var col = P.layers[i], x = -30 - R() * 40;
      while (x < W + 20) {
        var w = L.w0 + R() * (L.w1 - L.w0), h = H * (L.h0 + R() * (L.h1 - L.h0)), top = H - h;
        block(x, top, w, h + 2, col, L);
        if (w > 50 && R() < 0.6) {
          var tw = w * (0.45 + R() * 0.3), th = H * (0.03 + R() * 0.07), tx = x + (w - tw) / 2;
          block(tx, top - th, tw, th + 1, col, L);
          if (i < 4 && R() < 0.4) {
            var sh = 26 + R() * 60, cx = tx + tw / 2;
            ctx.fillStyle = shade(col, -8); ctx.fillRect(cx - 1.5, top - th - sh, 3, sh);
            if (d) { ctx.fillStyle = '#FF5A4F'; ctx.beginPath(); ctx.arc(cx, top - th - sh, 2.4, 0, 6.2832); ctx.fill(); }
          }
        }
        x += w * (0.78 + R() * 0.2);
      }
      if (i < LAY.length - 1) {
        var hz = ctx.createLinearGradient(0, H * 0.25, 0, H);
        hz.addColorStop(0, P.haze + '0)'); hz.addColorStop(1, P.haze + P.hazeA + ')');
        ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
      }
    });
  }
  function mountSkyline(cv) {
    if (!cv) return;
    cv.width = 1200; cv.height = 800; cv.setAttribute('data-sky', '1');
    drawSkyline(cv);
  }

  /* ---------- avatar ---------- */
  function avatar(u, size) {
    var cls = 'avatar avatar-' + (size || 'sm');
    if (u && typeof u.avatar === 'string' && u.avatar.indexOf('data:image/') === 0) return '<img class="' + cls + '" src="' + esc(u.avatar) + '" alt="">';
    return '<span class="' + cls + ' avatar-empty" aria-hidden="true">' + ICON.person + '</span>';
  }

  /* ---------- admin gate ---------- */
  var admin = {
    on: adminOn,
    unlock: function (pw) {
      var w = adminThrottle.wait();
      if (w) return Promise.reject(new Error('Too many attempts. Try again in ' + w + 's.'));
      return derive(pw, CONFIG.admin.salt, CONFIG.admin.iterations).then(function (h) {
        if (h === CONFIG.admin.hash) { adminThrottle.reset(); setAdmin(true); emit('admin'); return true; }
        adminThrottle.fail(); throw new Error('Wrong password.');
      });
    },
    lock: function () { setAdmin(false); emit('admin'); }
  };
  function mountAdminFab() {
    if ($('#adminFab')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'admin-fab'; b.id = 'adminFab';
    document.body.appendChild(b);
    function paint() {
      var onNow = adminOn();
      b.setAttribute('data-on', onNow ? '1' : '0');
      b.setAttribute('aria-pressed', onNow ? 'true' : 'false');
      b.innerHTML = ICON.shield + '<span>' + (onNow ? 'Admin mode on · Exit' : 'Operate as Admin') + '</span>';
    }
    b.addEventListener('click', function () {
      if (adminOn()) { admin.lock(); toast('Admin mode off.'); return; }
      dialog({
        title: 'Operate as Admin',
        message: 'Insert passwords, and operate as admin',
        fields: [{ name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'off' }],
        confirmLabel: 'Unlock',
        onSubmit: function (v) { return admin.unlock(v.password); }
      }).then(function (v) { if (v) toast('Admin mode on.', 'ok'); });
    });
    on('admin', paint);
    paint();
  }

  /* ---------- auth pages ---------- */
  function strength(pw) {
    var s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }
  function initAuth(kind) {
    if (currentUser()) { location.replace('index.html'); return; }
    var form = $('#authForm'), err = $('#authErr'), btn = $('#authSubmit');
    function fail(m) { err.textContent = m; err.hidden = false; btn.disabled = false; }
    function done() { location.assign('index.html'); }
    $$('[data-reveal]').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = $('#' + b.getAttribute('data-reveal')), show = inp.type === 'password';
        inp.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', show ? 'true' : 'false');
      });
    });
    $$('[data-provider]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-provider');
        providerDialog(p).then(function (handle) {
          if (!handle) return;
          try { auth.provider(p, handle); done(); } catch (e) { fail(e.message); }
        });
      });
    });
    if (kind === 'register') {
      var pw = $('#password'), meter = $('#meterBar'), label = $('#meterLabel');
      pw.addEventListener('input', function () {
        var s = strength(pw.value), names = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'], cols = ['var(--bad)', 'var(--bad)', '#D98A1E', 'var(--ok)', 'var(--ok)'];
        var sc = pw.value ? Math.max(1, s) : 0;
        meter.style.width = (sc * 25) + '%'; meter.style.background = cols[sc]; label.textContent = pw.value ? names[sc] : 'Use 8+ characters. Mix letters, numbers and symbols.';
      });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true; btn.disabled = true;
      if (kind === 'login') {
        auth.login($('#identifier').value, $('#password').value).then(done, function (er) { fail(er.message); });
      } else {
        if ($('#password').value !== $('#confirm').value) { fail('The two passwords do not match.'); return; }
        auth.register({ username: $('#username').value, email: $('#email').value, password: $('#password').value }).then(done, function (er) { fail(er.message); });
      }
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    var host = $('#themeHost'); if (host) mountThemeSwitch(host); else applyTheme(themeMode());
    mountAdminFab();
    mountSkyline($('#skyline'));
    on('theme', function () { $$('canvas[data-sky]').forEach(drawSkyline); });
    window.addEventListener('storage', function (e) { if (e.key && e.key.indexOf('xk1.') === 0) emit('data', { remote: true }); });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var chg = function () { emit('theme'); };
      if (mq.addEventListener) mq.addEventListener('change', chg); else if (mq.addListener) mq.addListener(chg);
    }
  }

  window.XK = {
    CONFIG: CONFIG, EMOJI: EMOJI, ICON: ICON, $: $, $$: $$, esc: esc, uid: uid, nf: nf, on: on, emit: emit, attempt: attempt,
    fmtDate: fmtDate, fmtTime: fmtTime, fmtStamp: fmtStamp,
    auth: auth, posts: posts, quiz: quiz, admin: admin, audit: { add: auditAdd, list: function () { return get(K.audit, []); } },
    md: md, toast: toast, dialog: dialog, confirm: confirmDialog, providerDialog: providerDialog,
    avatar: avatar, mountSkyline: mountSkyline, boot: boot, initAuth: initAuth
  };
})();
