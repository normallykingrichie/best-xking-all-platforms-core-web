/* XKing Core - shared logic for index.html, login.html and register.html.
   Connected build: accounts, Coins, posts and quizzes live in your Supabase project.
   The browser only holds the public (publishable) key. Balances and admin actions go through
   server-side functions that check who is asking, so nothing here can be used to cheat. */
(function () {
  'use strict';

  var C = window.XK_CONFIG || {};
  var CONFIG = {
    linktreeUrl: C.linktreeUrl || 'https://xking-supremax-studios-linktree.netlify.app/',
    quizReward: 10,
    pollMs: 6000
  };
  var K = { theme: 'xk1.theme', remember: 'xk.remember', adminMode: 'xk.adminMode' };
  var EMOJI = ['\u{1F44D}', '❤️', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F389}'];

  var ICON = {
    device: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10" rx="2"/><path d="M7 17h6M10 13.5V17"/></svg>',
    light: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.3"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 11.6A6.8 6.8 0 0 1 8.4 3.5a6.8 6.8 0 1 0 8.1 8.1z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.4-2.9 8-7 9.5-4.1-1.5-7-5.1-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>',
    person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>',
    discord: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M19.6 5.3A16.6 16.6 0 0 0 15.5 4l-.5 1.1a15.4 15.4 0 0 0-4.6 0L9.9 4a16.6 16.6 0 0 0-4.1 1.3C3.2 9.2 2.5 13 2.8 16.7a16.7 16.7 0 0 0 5 2.5l1.1-1.7a10.8 10.8 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 10.1 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5-2.5c.4-4.3-.7-8.1-2.9-11.4zM9.4 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm5.2 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/></svg>'
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
  var skew = 0; /* server time minus this device's time, in ms */
  function now() { return Date.now() + skew; }
  function fmtDate(ts) { try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
  function fmtTime(ts) { try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
  function fmtStamp(ts) { return fmtDate(ts) + ', ' + fmtTime(ts); }
  function nf(n) { return Number(n || 0).toLocaleString('en-US'); }
  function attempt(fn) { return new Promise(function (res) { res(fn()); }); }
  function msg(e) {
    var m = (e && e.message) ? String(e.message) : String(e || 'Something went wrong.');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Cannot reach the server. Check your connection and try again.';
    if (/Invalid login credentials/i.test(m)) return 'Incorrect email or password.';
    if (/already registered|already been registered/i.test(m)) return 'An account with that email already exists. Try signing in.';
    if (/Password should be at least/i.test(m)) return 'Password must be at least 8 characters.';
    if (/Token has expired|otp_expired|invalid.*(token|otp)/i.test(m)) return 'That code is wrong or has expired. Check it, or ask for a new one.';
    if (/Email not confirmed/i.test(m)) return 'EMAIL_NOT_CONFIRMED';
    if (/rate limit|security purposes|too many/i.test(m)) return 'Too many tries. Please wait a little and try again.';
    if (/Identity is already linked|already linked/i.test(m)) return 'That Discord account is already linked to another profile.';
    if (/Manual linking is disabled/i.test(m)) return 'Linking is switched off on the server. The site owner must turn on "Allow manual linking".';
    return m;
  }

  /* ---------- browser storage (never throws; falls back to memory) ---------- */
  var lsOk = (function () { try { var k = '__xk'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })();
  var mem = {};
  function rawGet(k) { if (lsOk) { try { return localStorage.getItem(k); } catch (e) {} } return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }
  function rawSet(k, v) { if (lsOk) { try { localStorage.setItem(k, v); return; } catch (e) {} } mem[k] = v; }
  function rawDel(k) { if (lsOk) { try { localStorage.removeItem(k); } catch (e) {} } delete mem[k]; }
  function sGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return mem['s:' + k] || null; } }
  function sSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { mem['s:' + k] = v; } }
  function sDel(k) { try { sessionStorage.removeItem(k); } catch (e) { delete mem['s:' + k]; } }

  /* Remember Me: ticked = the sign-in is kept on this device (localStorage).
     Unticked = it lives only in this tab/browser session (sessionStorage) and disappears when it closes. */
  function remember() { return rawGet(K.remember) !== '0'; }
  function setRemember(v) { rawSet(K.remember, v ? '1' : '0'); }
  var authStore = {
    getItem: function (k) {
      var v = null;
      try { v = localStorage.getItem(k); } catch (e) {}
      if (v == null) { try { v = sessionStorage.getItem(k); } catch (e) {} }
      return v == null ? (Object.prototype.hasOwnProperty.call(mem, 'a:' + k) ? mem['a:' + k] : null) : v;
    },
    setItem: function (k, v) {
      var keep = remember(), main = keep ? 'localStorage' : 'sessionStorage', other = keep ? 'sessionStorage' : 'localStorage';
      try { window[main].setItem(k, v); try { window[other].removeItem(k); } catch (e) {} } catch (e) { mem['a:' + k] = v; }
    },
    removeItem: function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
      try { sessionStorage.removeItem(k); } catch (e) {}
      delete mem['a:' + k];
    }
  };

  /* ======================= Supabase connection ======================= */
  var sb = null, fatal = '';
  (function () {
    if (!window.supabase || !window.supabase.createClient) { fatal = 'The Supabase library did not load. Check that vendor/supabase.js is uploaded next to the pages.'; return; }
    if (!C.supabaseUrl || !C.supabaseKey) { fatal = 'config.js is missing the Supabase URL or key.'; return; }
    var baseFetch = window.fetch.bind(window);
    function clockFetch(a, b) {
      return baseFetch(a, b).then(function (r) {
        try { var d = r.headers && r.headers.get('date'); if (d) { var t = Date.parse(d); if (t) skew = t - Date.now(); } } catch (e) {}
        return r;
      });
    }
    sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
      auth: { storage: authStore, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      global: { fetch: clockFetch },
      realtime: { params: { eventsPerSecond: 5 } }
    });
  })();

  /* The folder the site lives in, with a trailing slash. Used as the OAuth return address. */
  function siteDir() { return location.origin + location.pathname.replace(/[^\/]*$/, ''); }

  function must(res) { if (res && res.error) throw res.error; return res ? res.data : null; }
  function rpc(name, args) { return sb.rpc(name, args || {}).then(must); }

  /* ======================= state ======================= */
  var S = {
    ready: false, session: null, user: null, me: null, identities: [],
    posts: [], shop: [], quiz: null, orders: [], ledger: [], myReports: [],
    adminActive: false, adminMode: sGet(K.adminMode) === '1',
    adm: { accounts: [], audit: [], reports: [], sessions: [], loaded: false }
  };

  function normAvatar(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u : null; }
  function normMe(p) {
    return {
      id: p.id, username: p.username, email: S.user && S.user.email || null, avatar: normAvatar(p.avatar_url),
      coins: Number(p.coins || 0), gold: Number(p.gold || 0), vip: !!p.is_vip, staff: p.staff_role || null,
      notifyQuiz: !!p.notify_quiz
    };
  }
  function me() { return S.me; }

  function loadMe() {
    if (!S.session) { S.me = null; S.identities = []; return Promise.resolve(); }
    S.user = S.session.user;
    return sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      S.me = r.data ? normMe(r.data) : null;
    }).then(function () {
      return sb.auth.getUserIdentities().then(function (r) { S.identities = (r.data && r.data.identities) || []; }, function () { S.identities = S.user.identities || []; });
    });
  }

  function loadPosts() {
    return Promise.all([
      sb.from('posts').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('reactions').select('post_id,user_id,emoji').limit(5000),
      sb.from('replies_public').select('id,post_id,body,created_at').order('created_at', { ascending: true }).limit(2000)
    ]).then(function (r) {
      r.forEach(function (x) { if (x.error) throw x.error; });
      var reacts = {}, reps = {};
      r[1].data.forEach(function (x) { ((reacts[x.post_id] = reacts[x.post_id] || {})[x.emoji] = (reacts[x.post_id][x.emoji] || [])).push(x.user_id); });
      r[2].data.forEach(function (x) { (reps[x.post_id] = reps[x.post_id] || []).push({ id: x.id, ts: Date.parse(x.created_at), text: x.body }); });
      S.posts = r[0].data.map(function (p) {
        return { id: p.id, type: p.kind, title: p.title, body: p.body, createdAt: Date.parse(p.created_at), author: 'XKing Studio',
          when: p.event_when || '', link: p.event_link || '', reactions: reacts[p.id] || {}, replies: reps[p.id] || [] };
      });
    });
  }

  function loadShop() {
    return sb.from('shop_items').select('*').eq('available', true).order('sort', { ascending: true }).then(function (r) {
      if (r.error) throw r.error; S.shop = r.data;
    });
  }

  /* ----- quiz ----- */
  var qFetchAt = 0;
  function loadQuestion(q) {
    qFetchAt = Date.now();
    return sb.from('quiz_questions').select('question').eq('quiz_id', q.id).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      if (r.data) q.question = r.data.question;
    });
  }
  function loadQuiz() {
    return sb.from('quizzes').select('*').order('created_at', { ascending: false }).limit(1).then(function (r) {
      if (r.error) throw r.error;
      var row = r.data && r.data[0];
      if (!row) { S.quiz = null; return; }
      var prev = S.quiz && S.quiz.id === row.id ? S.quiz : null;
      var q = { id: row.id, startsAt: Date.parse(row.starts_at), status: row.status, question: prev ? prev.question : null, key: null, answers: [], mine: null };
      S.quiz = q;
      var jobs = [];
      if (!q.question && now() >= q.startsAt - 500) jobs.push(loadQuestion(q));
      if (S.me) {
        jobs.push(sb.from('quiz_answers').select('id,user_id,answer,result,created_at').eq('quiz_id', q.id).then(function (a) {
          if (a.error) throw a.error;
          var rows = a.data.map(function (x) { return { id: x.id, userId: x.user_id, text: x.answer, result: x.result, ts: Date.parse(x.created_at) }; });
          q.mine = rows.filter(function (x) { return x.userId === S.me.id; })[0] || null;
          if (adminOn()) q.answers = rows;
        }));
      }
      if (adminOn()) jobs.push(sb.from('quiz_keys').select('answer_key').eq('quiz_id', q.id).maybeSingle().then(function (k) { if (!k.error && k.data) q.key = k.data.answer_key; }));
      return Promise.all(jobs);
    });
  }
  function quizPhase(q) {
    if (!q) return 'none';
    if (q.status === 'closed') return 'closed';
    if (now() < q.startsAt) return 'scheduled';
    return q.question ? 'live' : 'starting';
  }

  /* ----- orders and activity ----- */
  function loadWallet() {
    if (!S.me) { S.orders = []; S.ledger = []; S.myReports = []; return Promise.resolve(); }
    return Promise.all([
      sb.from('purchase_orders').select('id,item_id,status,created_at,shop_items(name)').order('created_at', { ascending: false }).limit(50),
      sb.from('ledger').select('id,currency,delta,reason,created_at').order('created_at', { ascending: false }).limit(15),
      sb.from('reports').select('id,kind,title,status,created_at').order('created_at', { ascending: false }).limit(20)
    ]).then(function (r) {
      S.orders = r[0].error ? [] : r[0].data;
      S.ledger = r[1].error ? [] : r[1].data;
      S.myReports = r[2].error ? [] : r[2].data;
    });
  }

  /* ----- admin ----- */
  function adminOn() { return !!(S.me && S.me.staff && S.adminMode && S.adminActive); }
  function checkAdmin() {
    if (!S.me || !S.me.staff) { S.adminActive = false; return Promise.resolve(); }
    return sb.rpc('is_admin_active').then(function (r) {
      var was = S.adminActive; S.adminActive = r.error ? false : !!r.data;
      if (S.adminMode && !S.adminActive) { setMode(false); if (was) toast('Your admin session ended.'); }
    });
  }
  function setMode(v) { S.adminMode = v; if (v) sSet(K.adminMode, '1'); else sDel(K.adminMode); emit('admin'); }
  function loadAdmin() {
    if (!adminOn()) { S.adm.loaded = false; return Promise.resolve(); }
    var leader = S.me.staff === 'leader';
    return Promise.all([
      sb.rpc('admin_list_accounts'),
      sb.from('audit_log').select('id,actor,action,target,detail,created_at').order('created_at', { ascending: false }).limit(60),
      sb.from('reports').select('*').order('created_at', { ascending: false }).limit(100),
      leader ? sb.from('admin_sessions').select('*').order('requested_at', { ascending: false }).limit(40) : Promise.resolve({ data: [] })
    ]).then(function (r) {
      var a = S.adm;
      a.accounts = r[0].error ? [] : (r[0].data || []);
      var names = {}; a.accounts.forEach(function (x) { names[x.id] = x.username; });
      a.names = names;
      a.audit = r[1].error ? [] : r[1].data.map(function (x) { return { id: x.id, ts: Date.parse(x.created_at), action: x.action, target: x.target, detail: x.detail, actor: names[x.actor] || '' }; });
      a.reports = r[2].error ? [] : r[2].data.map(function (x) { return { id: x.id, kind: x.kind, title: x.title, details: x.details, link: x.external_link, status: x.status, ts: Date.parse(x.created_at), who: names[x.user_id] || 'Deleted user' }; });
      a.sessions = (r[3].data || []).map(function (x) { return { id: x.id, who: names[x.user_id] || 'Unknown', status: x.status, requestedAt: Date.parse(x.requested_at), expiresAt: x.expires_at ? Date.parse(x.expires_at) : 0 }; });
      a.loaded = true;
    });
  }

  /* ----- refresh everything ----- */
  var refreshing = null, again = false;
  function swallow(label) { return function (e) { try { console.warn('[xking] ' + label + ':', e && e.message || e); } catch (x) {} }; }
  function refresh() {
    if (!sb) return Promise.resolve();
    if (refreshing) { again = true; return refreshing; }
    refreshing = loadMe().catch(swallow('profile'))
      .then(function () { return checkAdmin().catch(swallow('admin check')); })
      .then(function () {
        return Promise.all([
          loadPosts().catch(swallow('posts')), loadQuiz().catch(swallow('quiz')), loadShop().catch(swallow('shop')),
          loadWallet().catch(swallow('wallet')), loadAdmin().catch(swallow('admin data'))
        ]);
      })
      .then(function () { S.ready = true; })
      .then(function () { refreshing = null; emit('data'); if (again) { again = false; return refresh(); } }, function (e) { refreshing = null; throw e; });
    return refreshing;
  }
  function quick() { return Promise.all([loadPosts().catch(swallow('posts')), loadQuiz().catch(swallow('quiz'))]).then(function () { emit('data'); }); }

  var rtTimer = null, channel = null;
  function startLive() {
    if (!sb) return;
    try {
      if (channel) { sb.removeChannel(channel); channel = null; }
      var ch = sb.channel('xk-live');
      ['posts', 'quizzes', 'quiz_answers', 'profiles', 'admin_sessions'].forEach(function (t) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, function () {
          clearTimeout(rtTimer); rtTimer = setTimeout(function () { refresh().catch(swallow('live refresh')); }, 250);
        });
      });
      ch.subscribe(); channel = ch;
    } catch (e) { swallow('realtime')(e); }
    /* Realtime can drop or be blocked, so the page also checks on a timer. */
    if (!startLive.timer) startLive.timer = setInterval(function () { if (!document.hidden) refresh().catch(swallow('poll')); }, CONFIG.pollMs);
  }

  /* ======================= actions ======================= */
  var api = {
    signUp: function (username, email, password, keep) {
      setRemember(keep);
      return sb.auth.signUp({ email: email, password: password, options: { data: { username: username }, emailRedirectTo: siteDir() } }).then(must).then(function (d) {
        if (!d.session && d.user && d.user.identities && d.user.identities.length === 0) throw new Error('User already registered');
        return refresh().then(function () { return { signedIn: !!d.session, username: S.me ? S.me.username : username }; });
      });
    },
    verifyCode: function (email, code, keep) {
      setRemember(keep);
      return sb.auth.verifyOtp({ email: email, token: code, type: 'signup' }).then(must).then(function (d) { if (d && d.session) S.session = d.session; return refresh(); }).then(function () { return { username: S.me ? S.me.username : '' }; });
    },
    resendCode: function (email) { return sb.auth.resend({ type: 'signup', email: email }).then(must); },
    signIn: function (email, password, keep) {
      setRemember(keep);
      return sb.auth.signInWithPassword({ email: email, password: password }).then(must);
    },
    discord: function (keep) {
      setRemember(keep);
      return sb.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: siteDir(), scopes: 'identify email' } }).then(must);
    },
    linkDiscord: function () {
      return sb.auth.linkIdentity({ provider: 'discord', options: { redirectTo: siteDir(), scopes: 'identify email' } }).then(must);
    },
    unlink: function (identity) { return sb.auth.unlinkIdentity(identity).then(must).then(refresh); },
    signOut: function () { setMode(false); return sb.auth.signOut().then(function () { S.session = null; S.me = null; S.identities = []; S.adminActive = false; S.adm.loaded = false; return refresh(); }); },
    react: function (pid, emoji) {
      var p = S.posts.filter(function (x) { return x.id === pid; })[0], arr = p && (p.reactions[emoji] = p.reactions[emoji] || []);
      if (!p) return Promise.resolve();
      var i = arr.indexOf(S.me.id), q;
      if (i >= 0) { arr.splice(i, 1); q = sb.from('reactions').delete().eq('post_id', pid).eq('user_id', S.me.id).eq('emoji', emoji); }
      else { arr.push(S.me.id); q = sb.from('reactions').insert({ post_id: pid, emoji: emoji }); }
      emit('data');
      return q.then(must).catch(function (e) { return loadPosts().then(function () { emit('data'); throw e; }); });
    },
    reply: function (pid, text) { return rpc('post_reply', { p_post: pid, p_body: text }).then(loadPosts).then(function () { emit('data'); }); },
    setNotify: function (v) { return sb.from('profiles').update({ notify_quiz: v }).eq('id', S.me.id).then(must).then(function () { S.me.notifyQuiz = v; }); },
    rename: function (name) {
      return sb.from('profiles').update({ username: name }).eq('id', S.me.id).then(function (r) {
        if (r.error) { throw (r.error.code === '23505' ? new Error('That username is taken.') : r.error.code === '23514' ? new Error('Username must be 3 to 20 characters: letters, numbers, dot, dash or underscore.') : r.error); }
        S.me.username = name; emit('data');
      });
    },
    uploadAvatar: function (blob) {
      var path = S.me.id + '/avatar-' + Date.now() + '.jpg', old = S.me.avatar;
      return sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }).then(must).then(function () {
        var url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
        return sb.from('profiles').update({ avatar_url: url }).eq('id', S.me.id).then(must).then(function () {
          S.me.avatar = url; emit('data');
          if (old && old.indexOf('/avatars/' + S.me.id + '/') > 0) { sb.storage.from('avatars').remove([old.split('/avatars/')[1]]).catch(function () {}); }
        });
      });
    },
    removeAvatar: function () {
      var old = S.me.avatar;
      return sb.from('profiles').update({ avatar_url: null }).eq('id', S.me.id).then(must).then(function () {
        S.me.avatar = null; emit('data');
        if (old && old.indexOf('/avatars/' + S.me.id + '/') > 0) { sb.storage.from('avatars').remove([old.split('/avatars/')[1]]).catch(function () {}); }
      });
    },
    answer: function (quizId, text) { return rpc('submit_answer', { p_quiz: quizId, p_answer: text }).then(loadQuiz).then(function () { emit('data'); }); },
    buy: function (id) { return rpc('purchase_item', { p_item: id }).then(refresh); },
    sendReport: function (o) {
      return sb.from('reports').insert({ kind: o.kind, title: o.title, details: o.details, external_link: o.link || null }).then(must).then(loadWallet).then(function () { emit('data'); });
    },
    /* ----- staff ----- */
    postQuiz: function (q, key) { return rpc('post_quiz', { p_question: q, p_key: key || null }).then(function () { return refresh(); }); },
    closeQuiz: function (id) { return rpc('close_quiz', { p_quiz: id }).then(refresh); },
    mark: function (id, ok) { return rpc('mark_answer', { p_answer: id, p_correct: ok }).then(refresh); },
    addPost: function (o) { return rpc('admin_create_post', { p_kind: o.type, p_title: o.title, p_body: o.body, p_when: o.when || null, p_link: o.link || null }).then(refresh); },
    delPost: function (id) { return rpc('admin_delete_post', { p_id: id }).then(refresh); },
    delReply: function (id) { return rpc('admin_delete_reply', { p_id: id }).then(refresh); },
    reportStatus: function (id, s) { return rpc('admin_set_report_status', { p_id: id, p_status: s }).then(refresh); },
    adjust: function (user, cur, delta, reason) { return rpc('admin_adjust_balance', { p_user: user, p_currency: cur, p_delta: delta, p_reason: reason }).then(refresh); },
    setVip: function (user, vip, usd, method, note) { return rpc('admin_set_vip', { p_user: user, p_vip: vip, p_amount_usd: usd, p_method: method, p_note: note || '' }).then(refresh); },
    renameUser: function (user, name) { return rpc('admin_rename_user', { p_user: user, p_username: name }).then(refresh); },
    deleteUser: function (user) { return rpc('admin_delete_user', { p_user: user }).then(refresh); },
    setStaff: function (user, role) { return rpc('set_staff_role', { p_user: user, p_role: role }).then(refresh); },
    transfer: function (user) { return rpc('transfer_leader', { p_user: user }).then(function () { setMode(false); return refresh(); }); },
    decide: function (id, ok, hours) { return rpc('decide_admin_session', { p_id: id, p_approve: ok, p_hours: hours }).then(refresh); },
    revoke: function (id) { return rpc('revoke_admin_session', { p_id: id }).then(refresh); },
    setAdminPassword: function (pw) { return rpc('set_admin_password', { p_new: pw }); }
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
    if (u && u.avatar) return '<img class="' + cls + '" src="' + esc(u.avatar) + '" alt="" loading="lazy">';
    return '<span class="' + cls + ' avatar-empty" aria-hidden="true">' + ICON.person + '</span>';
  }

  /* ---------- admin gate ---------- */
  var admin = {
    on: adminOn,
    exit: function () { setMode(false); }
  };
  function enterAdmin(res) {
    return checkAdmin().then(function () {
      if (!S.adminActive) throw new Error('The server did not grant admin access.');
      setMode(true); return refresh();
    });
  }
  function waitOverlay(sid) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div'); ov.className = 'overlay';
      ov.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="wt"><h2 id="wt" class="display">Waiting for the Leader</h2>' +
        '<p class="modal-msg">Your password is correct. The Leader must approve this admin session before you can operate. Keep this page open.</p>' +
        '<p class="wait-dots" role="status" aria-live="polite">Waiting for approval<span>.</span><span>.</span><span>.</span></p>' +
        '<div class="modal-actions"><button type="button" class="btn-ghost" data-x="cancel">Stop waiting</button></div></div>';
      document.body.appendChild(ov);
      var timer = null, done = false;
      function close(v) { if (done) return; done = true; clearTimeout(timer); ov.remove(); resolve(v); }
      $('[data-x="cancel"]', ov).addEventListener('click', function () { close('cancel'); });
      function poll() {
        if (done) return;
        sb.from('admin_sessions').select('status').eq('id', sid).maybeSingle().then(function (r) {
          var s = r.data && r.data.status;
          if (s === 'approved') close('approved');
          else if (s === 'denied' || s === 'revoked') close(s);
          else timer = setTimeout(poll, 3000);
        }, function () { timer = setTimeout(poll, 4000); });
      }
      poll();
    });
  }
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
    function after(status, sid) {
      if (status === 'pending') {
        return waitOverlay(sid).then(function (r) {
          if (r === 'approved') return enterAdmin().then(function () { toast('Admin mode on.', 'ok'); });
          if (r === 'denied') toast('The Leader declined this admin session.', 'error');
          else if (r === 'revoked') toast('This admin session was revoked.', 'error');
        });
      }
      return enterAdmin().then(function () { toast('Admin mode on.', 'ok'); });
    }
    b.addEventListener('click', function () {
      if (!sb) { toast(fatal, 'error'); return; }
      if (!S.me) { toast('Sign in first, then use Operate as Admin.'); return; }
      if (adminOn()) { setMode(false); toast('Admin mode off.'); return; }
      if (S.me.staff === 'leader') {
        rpc('request_admin_session', { p_password: '' }).then(function (r) { return after(r.status, r.session_id); }).catch(function (e) { toast(msg(e), 'error'); });
        return;
      }
      var out = null;
      dialog({
        title: 'Operate as Admin',
        message: 'Insert passwords, and operate as admin',
        fields: [{ name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'off' }],
        confirmLabel: 'Unlock',
        onSubmit: function (v) {
          return rpc('request_admin_session', { p_password: v.password }).then(function (r) {
            if (r.status === 'wrong_password') throw new Error('Wrong password.');
            out = r;
          }, function (e) { throw new Error(msg(e)); });
        }
      }).then(function (v) { if (v && out) return after(out.status, out.session_id); }).catch(function (e) { toast(msg(e), 'error'); });
    });
    on('admin', paint); on('data', paint);
    paint();
  }

  /* ---------- auth pages ---------- */
  var WARN_TEXT = 'Your account is easy to lose! Link a Discord account so you can always get back in. Without a linked account, you could lose all the progress and rewards you worked so hard to earn.';
  function strength(pw) {
    var s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }
  function showDone(username) {
    var card = $('.auth-card');
    card.innerHTML = '<div><p class="eyebrow">Email verified</p><h1 class="display">Welcome, ' + esc(username) + '!</h1></div>' +
      '<p class="muted">Your account is ready and you are signed in. It is your one XKing account for everything we build, now and in the future.</p>' +
      '<div class="warn-red" role="alert"><strong>Warning</strong><p>' + esc(WARN_TEXT) + '</p></div>' +
      '<a class="btn-primary" href="index.html" data-focus>Continue to XKing</a>';
    var f = $('[data-focus]', card); if (f) f.focus();
  }
  function showVerify(email, fromLogin) {
    var card = $('.auth-card'), left = 0, timer = null;
    card.innerHTML = '<div><p class="eyebrow">Verify your email</p><h1 class="display">Enter your code</h1></div>' +
      '<p class="muted">We sent a code to <strong>' + esc(email) + '</strong>. It can take a minute. Check your spam folder too.</p>' +
      '<form id="otpForm" class="form-stack" novalidate><div class="field"><label for="otp">Code from the email</label>' +
      '<input id="otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]*" required style="letter-spacing:.3em;font-size:1.3rem;text-align:center"></div>' +
      '<p class="form-error" id="otpErr" role="alert" hidden></p><button type="submit" class="btn-primary" id="otpBtn">Verify</button></form>' +
      '<div class="provider-row"><button type="button" class="btn-ghost" id="otpResend">Send a new code</button></div>' +
      '<p class="hint"><a href="' + (fromLogin ? 'login.html' : 'register.html') + '">Use a different email</a></p>';
    var err = $('#otpErr'), btn = $('#otpBtn'), rs = $('#otpResend'), box = $('#otp');
    box.focus();
    function cool(sec) {
      left = sec; clearInterval(timer);
      timer = setInterval(function () { left--; if (left <= 0) { clearInterval(timer); rs.disabled = false; rs.textContent = 'Send a new code'; } else rs.textContent = 'Send a new code (' + left + 's)'; }, 1000);
      rs.disabled = true; rs.textContent = 'Send a new code (' + sec + 's)';
    }
    cool(60);
    rs.addEventListener('click', function () {
      err.hidden = true;
      api.resendCode(email).then(function () { toast('A new code was sent.', 'ok'); cool(60); }, function (e) { err.textContent = msg(e); err.hidden = false; });
    });
    $('#otpForm').addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      var code = box.value.replace(/\s+/g, '');
      if (!/^\d{6,10}$/.test(code)) { err.textContent = 'Type the digits from the email.'; err.hidden = false; return; }
      btn.disabled = true;
      api.verifyCode(email, code, remember()).then(function (r) { clearInterval(timer); showDone(r.username || 'friend'); }, function (er) { btn.disabled = false; err.textContent = msg(er); err.hidden = false; box.select(); });
    });
  }
  function initAuth(kind) {
    var form = $('#authForm'), err = $('#authErr'), btn = $('#authSubmit'), keepBox = $('#remember');
    function fail(m) { err.textContent = m; err.hidden = false; btn.disabled = false; $$('[data-provider]').forEach(function (x) { x.disabled = false; }); }
    function done() { location.assign('index.html'); }
    if (keepBox) keepBox.checked = remember();
    function keep() { return keepBox ? keepBox.checked : true; }
    if (!sb) { fail(fatal); return; }
    sb.auth.getSession().then(function (r) { if (r.data && r.data.session) location.replace('index.html'); });
    $$('[data-reveal]').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = $('#' + b.getAttribute('data-reveal')), show = inp.type === 'password';
        inp.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', show ? 'true' : 'false');
      });
    });
    $$('[data-provider="discord"]').forEach(function (b) {
      b.addEventListener('click', function () {
        err.hidden = true; b.disabled = true;
        api.discord(keep()).catch(function (e) { fail(msg(e)); });
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
      e.preventDefault(); err.hidden = true;
      var email = $('#email').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { fail('Enter a valid email address.'); return; }
      if (kind === 'login') {
        btn.disabled = true;
        api.signIn(email, $('#password').value, keep()).then(done, function (er) {
          if (msg(er) === 'EMAIL_NOT_CONFIRMED') { api.resendCode(email).catch(function () {}); showVerify(email, true); return; }
          fail(msg(er));
        });
        return;
      }
      var name = $('#username').value.trim(), p1 = $('#password').value;
      if (!/^[A-Za-z0-9_.-]{3,20}$/.test(name)) { fail('Username must be 3 to 20 characters: letters, numbers, dot, dash or underscore.'); return; }
      if (p1.length < 8) { fail('Password must be at least 8 characters.'); return; }
      if (p1 !== $('#confirm').value) { fail('The two passwords do not match.'); return; }
      btn.disabled = true;
      api.signUp(name, email, p1, keep()).then(function (r) {
        if (r.signedIn) showDone(r.username); else showVerify(email);
      }, function (er) { fail(msg(er)); });
    });
  }

  /* ---------- boot ---------- */
  function urlProblem() {
    var q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
    var d = q.get('error_description') || h.get('error_description');
    if (!d) return;
    try { history.replaceState({}, document.title, location.pathname); } catch (e) {}
    toast(msg(new Error(d.replace(/\+/g, ' '))), 'error');
  }
  function init() {
    if (!sb) { S.ready = true; emit('data'); return Promise.resolve(); }
    sb.auth.onAuthStateChange(function (ev, session) {
      S.session = session;
      if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') setTimeout(function () { refresh().catch(swallow('auth change')); }, 0);
    });
    return sb.auth.getSession().then(function (r) { S.session = r.data && r.data.session || null; return refresh(); })
      .catch(function (e) { swallow('start')(e); S.ready = true; emit('data'); })
      .then(startLive);
  }
  function boot() {
    var host = $('#themeHost'); if (host) mountThemeSwitch(host); else applyTheme(themeMode());
    mountAdminFab();
    mountSkyline($('#skyline'));
    on('theme', function () { $$('canvas[data-sky]').forEach(drawSkyline); });
    urlProblem();
    /* A broken profile photo falls back to the plain person icon. */
    document.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && /(^| )avatar( |$)/.test(t.className)) { var s = document.createElement('span'); s.className = t.className + ' avatar-empty'; s.setAttribute('aria-hidden', 'true'); s.innerHTML = ICON.person; t.replaceWith(s); }
    }, true);
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var chg = function () { emit('theme'); };
      if (mq.addEventListener) mq.addEventListener('change', chg); else if (mq.addListener) mq.addListener(chg);
    }
  }

  window.XK = {
    CONFIG: CONFIG, EMOJI: EMOJI, ICON: ICON, $: $, $$: $$, esc: esc, uid: uid, nf: nf, on: on, emit: emit, attempt: attempt,
    fmtDate: fmtDate, fmtTime: fmtTime, fmtStamp: fmtStamp, now: now, msg: msg,
    S: S, me: me, api: api, admin: admin, quizPhase: quizPhase, fatal: function () { return fatal; },
    refresh: refresh, quick: quick, loadQuestion: function () { return S.quiz ? loadQuestion(S.quiz).then(function () { emit('data'); }) : Promise.resolve(); },
    qFetchedAt: function () { return qFetchAt; },
    md: md, toast: toast, dialog: dialog, confirm: confirmDialog, WARN_TEXT: WARN_TEXT,
    avatar: avatar, mountSkyline: mountSkyline, boot: boot, init: init, initAuth: initAuth
  };
})();
