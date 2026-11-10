/* XKing Core - dashboard logic for index.html (guest home, feeds, games, account settings, admin tools). */
(function () {
  'use strict';
  var XK = window.XK, esc = XK.esc, $ = XK.$, $$ = XK.$$, nf = XK.nf, EMOJI = XK.EMOJI;

  var NAV = { home: 'Home', announcements: 'Announcements', games: 'ACT Games', events: 'Events', admin: 'Admin' };
  var LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var TICK = '<span class="tick"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg></span>';
  var TREE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l5.2 7.3h-3.1l4.1 6h-4.3l3.4 5H6.7l3.4-5H5.8l4.1-6H6.8z"/><rect x="10.8" y="19.6" width="2.4" height="3.2" rx=".6"/></svg>';
  var CROP = 280;

  var st = {
    view: null, settingsTab: 'photo', adminTab: 'quiz', drafts: {}, replyOpen: {}, answer: '',
    quizForm: { q: '', key: '' }, postForm: { type: 'announcement', title: '', body: '', link: '', when: '' },
    acctFilter: '', crop: null, notified: '', phaseKey: '', refocus: ''
  };
  var viewEl = $('#view'), navEl = $('#nav'), acctEl = $('#acctArea');

  function user() { return XK.auth.current(); }
  function admin() { return XK.admin.on(); }
  function roleLabel(u) { return u.role === 'vip' ? 'VIP Citizen' : 'Player'; }
  function who(id) { var u = XK.auth.byId(id); return u ? u.username : 'Deleted user'; }

  /* ======================= header ======================= */
  function navItems() {
    var a = [];
    if (!user()) a.push('home');
    a.push('announcements', 'games', 'events');
    if (admin()) a.push('admin');
    return a;
  }
  function renderHeader() {
    var u = user();
    navEl.innerHTML = navItems().map(function (v) {
      return '<button type="button" class="tab" data-act="nav" data-view="' + v + '"' + (st.view === v ? ' aria-current="page"' : '') + '>' + NAV[v] + '</button>';
    }).join('');
    if (u) {
      acctEl.innerHTML = XK.avatar(u, 'sm') + '<button type="button" class="btn-ghost btn-sm" data-act="nav" data-view="settings"' + (st.view === 'settings' ? ' aria-current="page"' : '') + '><span><span class="lbl-long">Account </span>Settings</span></button>';
    } else {
      acctEl.innerHTML = '<a class="btn-ghost btn-sm" href="login.html">Sign in</a><a class="btn-primary btn-sm" href="register.html">Sign up</a>';
    }
  }

  /* ======================= shared pieces ======================= */
  function greet() {
    var u = user();
    if (!u) {
      return '<div class="guest-note"><div><strong>You are browsing as a guest.</strong><span>Sign in to react, reply, play games and save your progress.</span></div><div class="guest-actions"><a class="btn-ghost btn-sm" href="login.html">Sign in</a><a class="btn-primary btn-sm" href="register.html">Sign up</a></div></div>';
    }
    return '<section class="greet">' + XK.avatar(u, 'md') + '<div class="greet-text"><p class="eyebrow">' + esc(roleLabel(u)) + (admin() ? ' &middot; Admin mode' : '') + '</p><h1 class="display">Welcome back, ' + esc(u.username) + '</h1></div>' +
      '<div class="balances"><div class="bal"><span>Coins</span><strong>' + nf(u.coins) + '</strong></div><div class="bal bal-gold"><span>Gold Coins</span><strong>' + nf(u.gold) + '</strong></div></div></section>';
  }

  function renderPost(p) {
    var u = user(), isAdm = admin(), open = !!st.replyOpen[p.id], replies = p.replies || [], canReply = !!(u && u.role === 'vip');
    var reacts = EMOJI.map(function (e) {
      var arr = (p.reactions && p.reactions[e]) || [], on = !!(u && arr.indexOf(u.id) >= 0);
      return '<button type="button" class="react" data-act="react" data-emoji="' + e + '" aria-pressed="' + on + '" aria-label="React with ' + e + ', ' + arr.length + ' so far">' + e + '<span class="count">' + arr.length + '</span></button>';
    }).join('');
    var meta = '';
    if (p.type === 'event' && (p.when || p.link)) {
      meta = '<div class="event-meta">' + (p.when ? '<span>' + esc(p.when) + '</span>' : '') +
        (p.link ? '<a class="btn-primary btn-sm" href="' + esc(p.link) + '" target="_blank" rel="noopener noreferrer">Go to event</a>' : '') + '</div>';
    }
    var repliesHtml = '';
    if (open) {
      repliesHtml = '<div class="replies">' +
        (replies.length ? replies.map(function (r) {
          return '<div class="reply" data-rid="' + r.id + '">' + XK.avatar(null, 'sm') + '<div><strong>Anonymous Citizen</strong><time>' + esc(XK.fmtStamp(r.ts)) + '</time><p>' + esc(r.text) + '</p></div>' +
            (isAdm ? '<button type="button" class="link-btn is-danger-text" data-act="del-reply">Delete</button>' : '') + '</div>';
        }).join('') : '<p class="muted">No replies yet.</p>') +
        (canReply
          ? '<div class="reply-form"><label class="sr-only" for="rp-' + p.id + '">Anonymous reply</label><textarea id="rp-' + p.id + '" class="reply-input" data-draft="' + p.id + '" maxlength="400" placeholder="Write an anonymous reply...">' + esc(st.drafts[p.id] || '') + '</textarea><div><button type="button" class="btn-primary btn-sm" data-act="send-reply">Reply anonymously</button></div></div>'
          : '<p class="lock-note">' + LOCK + (u ? 'Replies are for VIP Citizens.' : 'Sign in as a VIP Citizen to reply.') + '</p>') +
        '</div>';
    }
    return '<article class="post" data-id="' + p.id + '">' +
      '<div class="post-head"><span class="chip ' + (p.type === 'event' ? 'chip-event' : '') + '">' + (p.type === 'event' ? 'Event' : 'Announcement') + '</span>' + (p.sample ? '<span class="chip chip-sample">Sample</span>' : '') +
      '<time>' + esc(XK.fmtDate(p.createdAt)) + '</time><span>by ' + esc(p.author) + '</span>' +
      (isAdm ? '<button type="button" class="link-btn is-danger-text push" data-act="del-post">Delete post</button>' : '') + '</div>' +
      '<h3 class="post-title">' + esc(p.title) + '</h3>' + meta + '<div class="md">' + XK.md(p.body) + '</div>' +
      '<div class="reacts" role="group" aria-label="Reactions">' + reacts + '</div>' +
      '<div><button type="button" class="link-btn" data-act="toggle-replies" aria-expanded="' + open + '">' + (open ? 'Hide' : 'Show') + ' anonymous replies (' + replies.length + ')</button></div>' +
      repliesHtml + '</article>';
  }

  /* ======================= views ======================= */
  function viewHome() {
    var points = [
      'Get every announcement, even if you have not joined our Discord!',
      'Get Coins by completing any act and event',
      'Exchange your Coins for useful things for yourself, e.g. a Role on Discord and any Properties of acts and events',
      'Suggest ideas and report bugs without joining Discord, in a more organized way!',
      'And more coming soon!!'
    ];
    var latest = XK.posts.list().slice(0, 2);
    return '<section class="hero"><div class="hero-copy">' +
      '<p class="eyebrow">XKing Studio &middot; Community hub</p>' +
      '<h1 class="display hero-title">Welcome to Official Public <span class="gold">XKing</span>!</h1>' +
      '<h2 class="hero-sub">What you will get here?</h2>' +
      '<ul class="checks">' + points.map(function (t) { return '<li>' + TICK + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' +
      '<div class="cta-stack"><div class="cta-row"><a class="btn-rgb rgb-a" href="register.html">Sign up</a><a class="btn-rgb rgb-b" href="login.html">Sign in</a></div>' +
      '<a class="btn-tree" href="' + esc(XK.CONFIG.linktreeUrl) + '" target="_blank" rel="noopener noreferrer">' + TREE + 'Go to LinkTree</a></div>' +
      '</div><div class="hero-visual"><canvas id="skyline" aria-hidden="true"></canvas></div></section>' +
      '<section class="section-gap"><div class="section-head"><h2 class="display">Latest from XKing</h2><button type="button" class="link-btn" data-act="nav" data-view="announcements">See all announcements</button></div>' +
      '<div class="feed">' + latest.map(renderPost).join('') + '</div></section>';
  }

  function viewFeed(type) {
    var list = XK.posts.list(type), isEv = type === 'event';
    return greet() + '<div class="section-head"><h2 class="display">' + (isEv ? 'Events' : 'Announcements') + '</h2><p class="muted">' +
      (isEv ? 'New events and where to join them.' : 'News from the XKing team, no Discord needed.') + '</p></div>' +
      '<div class="feed">' + (list.length ? list.map(renderPost).join('') : '<p class="empty">Nothing here yet. New ' + (isEv ? 'events' : 'announcements') + ' from the XKing team will appear here.</p>') + '</div>';
  }

  /* ----- games ----- */
  function myAnswer(q, u) { return q && u ? q.answers.filter(function (a) { return a.userId === u.id; })[0] : null; }
  function remaining(q) { return Math.max(0, Math.ceil((q.startsAt - Date.now()) / 1000)); }
  function triviaInner() {
    var q = XK.quiz.get(), ph = XK.quiz.phase(q), u = user(), mine = myAnswer(q, u);
    var h = '<header><span class="chip">ACT Game</span><h2 class="display">Trivia Quiz</h2><p class="muted">Live questions from the operators. A correct answer earns <strong>' + XK.CONFIG.quizReward + ' Coins</strong>.</p></header>';
    if (ph === 'none') h += '<div class="state"><p class="big">No quiz right now.</p><p class="muted">Turn on notifications and you get a 20-second heads-up before the next one.</p></div>';
    else if (ph === 'scheduled') h += '<div class="state" role="status"><p class="big">Trivia Quiz will start in <b data-countdown>' + remaining(q) + '</b> Seconds!</p><p class="muted">Get ready. The question appears here the moment the countdown ends.</p></div>';
    else if (ph === 'closed') h += '<div class="state"><p class="big">This quiz is closed.</p><p class="muted">Watch for the next one.</p></div>' + (mine ? resultLine(mine) : '');
    else {
      h += '<div class="state"><p class="eyebrow">Live question</p><p class="quiz-q">' + esc(q.question) + '</p></div>';
      if (!u) h += '<p class="lock-note">' + LOCK + 'Sign in to answer and save your Coins.</p><div><a class="btn-primary btn-sm" href="login.html">Sign in</a></div>';
      else if (mine) h += resultLine(mine);
      else h += '<form class="answer-form" data-form="answer"><div class="field"><label for="ans">Your answer</label><input id="ans" type="text" maxlength="120" required autocomplete="off" value="' + esc(st.answer) + '"></div><button type="submit" class="btn-primary" style="align-self:end">Submit answer</button></form><p class="hint">You can answer once. An operator checks every answer.</p>';
    }
    if (u) h += '<label class="switch"><input type="checkbox" data-act="notif"' + (u.notifyQuiz ? ' checked' : '') + '><span class="track"></span><span>Notify me when a quiz is coming</span></label>';
    return h;
  }
  function resultLine(a) {
    if (a.result === 'correct') return '<p><span class="pill pill-ok">Correct, +' + XK.CONFIG.quizReward + ' Coins</span> <span class="muted">Your answer: ' + esc(a.text) + '</span></p>';
    if (a.result === 'wrong') return '<p><span class="pill pill-bad">Not this time</span> <span class="muted">Your answer: ' + esc(a.text) + '</span></p>';
    return '<p><span class="pill">Waiting for an operator</span> <span class="muted">Your answer: ' + esc(a.text) + '</span></p>';
  }
  function viewGames() {
    return greet() + '<div class="section-head"><h2 class="display">ACT Games</h2><p class="muted">Play, earn Coins, climb the city.</p></div>' +
      '<div class="games-grid"><article class="game-card" id="triviaCard">' + triviaInner() + '</article>' +
      '<article class="game-card is-soon" role="group" aria-label="Tycoon City, coming soon"><div class="soon-blur" aria-hidden="true"><header><span class="chip">ACT Game</span><h2 class="display">Tycoon City</h2></header><p class="muted">Build, earn and expand your own district.</p></div><div class="soon-label" aria-hidden="true">Coming soon...</div></article></div>';
  }

  /* ----- account settings ----- */
  function viewSettings() {
    var u = user();
    var tabs = [['photo', 'Change Photo Profile'], ['link', 'Link More Account'], ['inventory', 'Inventory']];
    return greet() + '<div class="section-head"><h2 class="display">Account Settings</h2><p class="muted">' + esc(u.email || 'Signed in with a linked account') + '</p></div>' +
      '<div class="settings"><nav class="side-tabs" aria-label="Account settings">' + tabs.map(function (t) {
        return '<button type="button" class="side-tab" data-act="settings-tab" data-tab="' + t[0] + '" aria-current="' + (st.settingsTab === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '<button type="button" class="side-tab is-danger-text" data-act="sign-out">Sign out</button></nav>' +
      '<section class="panel" id="settingsPanel">' + settingsPanel(u) + '</section></div>';
  }
  function settingsPanel(u) {
    if (st.settingsTab === 'link') return panelLink(u);
    if (st.settingsTab === 'inventory') return panelInventory(u);
    return panelPhoto(u);
  }
  function panelPhoto(u) {
    var c = st.crop;
    if (!c) {
      return '<h2 class="display">Change Photo Profile</h2><div class="photo-row">' + XK.avatar(u, 'lg') + '<div class="stack"><p class="muted">Upload an image, then move and resize it until it fits. You see a preview before anything is saved.</p><div class="photo-actions"><span class="btn-primary file-btn">Choose image<input type="file" id="photoFile" accept="image/*" aria-label="Choose profile image"></span>' + (u.avatar ? '<button type="button" class="btn-ghost" data-act="photo-remove">Remove photo</button>' : '') + '</div></div></div>';
    }
    return '<h2 class="display">Adjust your photo</h2><div class="crop-wrap"><div class="crop" id="cropBox" tabindex="0" role="img" aria-label="Photo editor. Drag to move the photo. Arrow keys also move it."><img id="cropImg" src="' + c.url + '" alt=""><div class="crop-ring"></div></div>' +
      '<div class="crop-side"><div class="field"><label for="cropZoom">Resize</label><input type="range" id="cropZoom" min="1" max="3" step="0.01" value="' + c.zoom + '"></div>' +
      '<div><p class="eyebrow" style="margin-bottom:8px">Preview</p><div class="prev"><img id="prevImg" src="' + c.url + '" alt=""></div></div>' +
      '<div class="photo-actions"><button type="button" class="btn-primary" data-act="photo-save">Save photo</button><button type="button" class="btn-ghost" data-act="photo-cancel">Cancel</button></div></div></div>';
  }
  function panelLink(u) {
    var rows = [['google', 'Google'], ['discord', 'Discord']].map(function (p) {
      var h = u.linked[p[0]];
      return '<div class="row"><div><strong>' + p[1] + '</strong><span class="muted">' + (h ? 'Linked as ' + esc(h) : 'Not linked') + '</span></div>' +
        (h ? '<button type="button" class="btn-ghost btn-sm" data-act="unlink" data-provider="' + p[0] + '">Unlink</button>' : '<button type="button" class="btn-primary btn-sm" data-act="link" data-provider="' + p[0] + '">Link ' + p[1] + '</button>') + '</div>';
    }).join('');
    return '<h2 class="display">Link More Account</h2><p class="muted">Link your accounts so signing in with any of them opens the same profile and the same Coins. Linking Discord also lets you buy Discord roles and tags.</p><div class="rows">' + rows + '</div>';
  }
  function panelInventory(u) {
    var items = u.items || [], led = (u.ledger || []).slice(0, 15);
    return '<h2 class="display">Inventory</h2><div class="inv-grid"><div class="bal"><span>Coins</span><strong>' + nf(u.coins) + '</strong></div><div class="bal bal-gold"><span>Gold Coins</span><strong>' + nf(u.gold) + '</strong></div></div>' +
      '<div class="stack"><h3>Items</h3>' + (items.length ? '<div class="rows">' + items.map(function (i) { return '<div class="row"><div><strong>' + esc(i.name) + '</strong></div><span class="badge">x' + nf(i.qty || 1) + '</span></div>'; }).join('') + '</div>' : '<p class="empty">Nothing here yet. Roles, tags and properties you exchange for Coins will show up here.</p>') + '</div>' +
      '<div class="stack"><h3>Recent activity</h3>' + (led.length ? '<ul class="ledger">' + led.map(function (l) {
        return '<li><span>' + esc(l.reason || 'Adjustment') + ' <span class="muted">&middot; ' + esc(XK.fmtDate(l.ts)) + '</span></span><span class="' + (l.delta > 0 ? 'pos' : 'neg') + ' tnum">' + (l.delta > 0 ? '+' : '') + nf(l.delta) + ' ' + (l.currency === 'gold' ? 'Gold' : 'Coins') + '</span></li>';
      }).join('') + '</ul>' : '<p class="empty">No activity yet. Earn your first Coins in ACT Games.</p>') + '</div>';
  }

  /* ----- admin ----- */
  function viewAdmin() {
    var tabs = [['quiz', 'Post Quiz'], ['post', 'Post Announcement or Event'], ['accounts', 'Accounts']];
    var body = st.adminTab === 'post' ? adminPost() : st.adminTab === 'accounts' ? adminAccounts() : adminQuiz();
    return greet() + '<div class="section-head"><h2 class="display">Admin tools</h2><p class="muted">Operator access is on for this tab.</p></div>' +
      '<div class="subtabs" role="group" aria-label="Admin sections">' + tabs.map(function (t) {
        return '<button type="button" class="subtab" data-act="admin-tab" data-tab="' + t[0] + '" aria-current="' + (st.adminTab === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div><div class="stack">' + body + '</div>';
  }
  function adminQuiz() {
    var q = XK.quiz.get(), ph = XK.quiz.phase(q), status;
    if (ph === 'none') status = '<p class="muted">No quiz has been posted yet.</p>';
    else if (ph === 'scheduled') status = '<div class="state" role="status"><p class="big">Going live in <b data-countdown>' + remaining(q) + '</b>s</p><p class="muted">Players with notifications on were told: Trivia Quiz will start in 20 Seconds!</p><div><button type="button" class="btn-ghost btn-sm" data-act="quiz-close">Cancel quiz</button></div></div>';
    else if (ph === 'live') status = '<div class="state"><p class="big">Quiz is live</p><p class="quiz-q">' + esc(q.question) + '</p>' + (q.key ? '<p class="muted">Your answer key: <strong>' + esc(q.key) + '</strong></p>' : '') + '<div><button type="button" class="btn-ghost btn-sm" data-act="quiz-close">Close quiz</button></div></div>';
    else status = '<div class="state"><p class="big">Last quiz is closed</p><p class="muted">' + esc(q.question) + '</p></div>';
    var answers = '';
    if (q) {
      answers = '<div class="panel"><h3>Answers (' + q.answers.length + ')</h3>' + (q.answers.length ? '<div class="rows">' + q.answers.map(function (a) {
        var act = a.result === 'pending'
          ? '<div class="photo-actions"><button type="button" class="btn-primary btn-sm" data-act="mark" data-id="' + a.id + '" data-result="correct">Correct +' + XK.CONFIG.quizReward + '</button><button type="button" class="btn-ghost btn-sm" data-act="mark" data-id="' + a.id + '" data-result="wrong">Wrong</button></div>'
          : '<span class="pill ' + (a.result === 'correct' ? 'pill-ok' : 'pill-bad') + '">' + (a.result === 'correct' ? 'Correct' : 'Wrong') + '</span>';
        return '<div class="row"><div><strong>' + esc(who(a.userId)) + '</strong><span class="muted">' + esc(a.text) + ' &middot; ' + esc(XK.fmtTime(a.ts)) + '</span></div>' + act + '</div>';
      }).join('') + '</div>' : '<p class="empty">No answers yet.</p>') + '</div>';
    }
    return '<div class="panel"><h2 class="display">Post a Trivia Quiz</h2>' +
      '<form class="form-stack" data-form="quiz"><fieldset style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:16px" ' + (ph === 'scheduled' ? 'disabled' : '') + '>' +
      '<div class="field"><label for="aq">Question</label><textarea id="aq" required maxlength="400" placeholder="Which block drops the most Coins in XKing City?">' + esc(st.quizForm.q) + '</textarea></div>' +
      '<div class="field"><label for="akey">Answer key (only you see this)</label><input id="akey" type="text" maxlength="120" value="' + esc(st.quizForm.key) + '"><p class="hint">You decide which answers are correct. Posting a new quiz replaces the current one.</p></div>' +
      '<div><button type="submit" class="btn-primary">Post quiz</button></div></fieldset>' +
      '<p class="hint">After you press Post, the quiz waits 20 seconds. Players with notifications on get: Trivia Quiz will start in 20 Seconds!</p></form></div>' + status + answers;
  }
  function adminPost() {
    var f = st.postForm, isEv = f.type === 'event';
    return '<div class="panel"><h2 class="display">Post an announcement or event</h2><form class="form-stack" data-form="post">' +
      '<div class="seg" role="radiogroup" aria-label="Post type"><label><input type="radio" name="ptype" value="announcement"' + (!isEv ? ' checked' : '') + '><span>Announcement</span></label><label><input type="radio" name="ptype" value="event"' + (isEv ? ' checked' : '') + '><span>Event</span></label></div>' +
      '<div class="field"><label for="ptitle">Title</label><input id="ptitle" type="text" maxlength="120" required value="' + esc(f.title) + '"></div>' +
      (isEv ? '<div class="field"><label for="pwhen">When</label><input id="pwhen" type="text" maxlength="120" placeholder="Saturday, 8 PM (UTC+7)" value="' + esc(f.when) + '"></div><div class="field"><label for="plink">Event link (the Go to event button)</label><input id="plink" type="url" placeholder="https://" value="' + esc(f.link) + '"></div>' : '') +
      '<div class="field"><label for="mdBody">Message</label><div class="toolbar" role="toolbar" aria-label="Formatting">' +
      '<button type="button" data-act="md" data-tool="bold" aria-label="Bold"><b>B</b></button><button type="button" data-act="md" data-tool="italic" aria-label="Italic"><i>I</i></button><button type="button" data-act="md" data-tool="h" aria-label="Heading">H</button><button type="button" data-act="md" data-tool="quote" aria-label="Quote">&ldquo;</button><button type="button" data-act="md" data-tool="list" aria-label="Bulleted list">&bull; List</button><button type="button" data-act="md" data-tool="link" aria-label="Link">Link</button><button type="button" data-act="md" data-tool="code" aria-label="Code">&lt;/&gt;</button></div>' +
      '<div class="editor"><textarea id="mdBody" required rows="9" placeholder="Write with **bold**, *italic*, - lists and [links](https://example.com)">' + esc(f.body) + '</textarea><div><p class="preview-title">Live preview</p><div class="preview md" id="mdPreview"></div></div></div></div>' +
      '<div><button type="submit" class="btn-primary">Post now</button></div></form></div>';
  }
  function acctRows() {
    var all = XK.auth.list(), f = st.acctFilter.trim().toLowerCase();
    var list = all.filter(function (u) { return !f || (u.username + ' ' + (u.email || '') + ' ' + (u.linked.google || '') + ' ' + (u.linked.discord || '')).toLowerCase().indexOf(f) >= 0; });
    if (!list.length) return '<p class="empty">' + (all.length ? 'No accounts match that search.' : 'No accounts have registered yet. They appear here as soon as someone signs up.') + '</p>';
    return list.map(function (u) {
      return '<div class="acct-row" data-uid="' + u.id + '">' + XK.avatar(u, 'sm') + '<div class="acct-who"><strong>' + esc(u.username) + '</strong><span class="muted">' + esc(u.email || 'Linked-account profile') + '</span></div>' +
        '<span class="badge ' + (u.role === 'vip' ? 'badge-vip' : '') + '">' + roleLabel(u) + '</span>' +
        '<div class="acct-num"><span>Coins</span><strong>' + nf(u.coins) + '</strong></div><div class="acct-num"><span>Gold</span><strong>' + nf(u.gold) + '</strong></div>' +
        '<div class="acct-actions"><button type="button" class="btn-ghost btn-sm" data-act="acct-edit">Edit</button><button type="button" class="btn-ghost btn-sm" data-act="acct-grant">Grant</button><button type="button" class="btn-ghost btn-sm is-danger-text" data-act="acct-delete">Delete</button></div></div>';
    }).join('');
  }
  function adminAccounts() {
    var log = XK.audit.list().slice(0, 40);
    return '<div class="panel"><h2 class="display">Accounts</h2><p class="warn-box"><strong>Sensitive area.</strong> Use this to fix stuck progress, for example giving back Coins that never reached an inventory. Every change is written to the audit log below.</p>' +
      '<div class="field"><label for="acctSearch">Search accounts</label><input id="acctSearch" type="search" placeholder="Username, email or linked handle" value="' + esc(st.acctFilter) + '"></div>' +
      '<div class="rows" id="acctList">' + acctRows() + '</div></div>' +
      '<div class="panel"><h3>Audit log</h3>' + (log.length ? '<ol class="audit">' + log.map(function (a) { return '<li><time>' + esc(XK.fmtStamp(a.ts)) + '</time><strong>' + esc(a.action) + '</strong><span>' + esc(a.target) + (a.detail ? ' &middot; ' + esc(a.detail) : '') + '</span></li>'; }).join('') + '</ol>' : '<p class="empty">No admin actions recorded yet.</p>') + '</div>';
  }

  /* ======================= render ======================= */
  function normalize() {
    var u = user(), items = navItems();
    if (st.view === 'settings') { if (!u) st.view = null; }
    else if (items.indexOf(st.view) < 0) st.view = null;
    if (!st.view) st.view = u ? 'announcements' : 'home';
  }
  function render() {
    normalize(); renderHeader();
    var v = st.view, html;
    if (v === 'home') html = viewHome();
    else if (v === 'games') html = viewGames();
    else if (v === 'events') html = viewFeed('event');
    else if (v === 'settings') html = viewSettings();
    else if (v === 'admin') html = viewAdmin();
    else html = viewFeed('announcement');
    viewEl.innerHTML = html;
    afterRender();
  }
  function afterRender() {
    if (st.view === 'home') XK.mountSkyline($('#skyline'));
    if (st.view === 'admin' && st.adminTab === 'post') updatePreview();
    if (st.crop && $('#cropBox')) { initCrop(); layoutCrop(); }
    if (st.refocus) { var el = $(st.refocus); if (el) el.focus(); st.refocus = ''; }
  }
  var rt = null;
  function scheduleRender() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var a = document.activeElement;
      if (a && viewEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && ['checkbox', 'file', 'range', 'radio'].indexOf(a.type) < 0) { scheduleRender(); return; }
      render();
    }, 120);
  }

  /* ======================= markdown editor ======================= */
  function updatePreview() {
    var p = $('#mdPreview'), t = $('#mdBody');
    if (p && t) p.innerHTML = t.value.trim() ? XK.md(t.value) : '<p class="muted">Your formatted text shows here as you type.</p>';
  }
  function mdTool(tool) {
    var ta = $('#mdBody'); if (!ta) return;
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e), rep, a, b;
    function wrap(l, r, ph) { var inner = sel || ph; rep = l + inner + r; a = s + l.length; b = a + inner.length; }
    function prefix(pre, ph) {
      var ls = v.lastIndexOf('\n', s - 1) + 1, text = sel || ph;
      var lines = text.split('\n').map(function (x) { return pre + x; }).join('\n');
      ta.value = v.slice(0, ls) + lines + v.slice(sel ? e : s); rep = null;
      a = ls + pre.length; b = ls + lines.length;
    }
    if (tool === 'bold') wrap('**', '**', 'bold text');
    else if (tool === 'italic') wrap('*', '*', 'italic text');
    else if (tool === 'code') wrap('`', '`', 'code');
    else if (tool === 'link') { var label = sel || 'link text'; rep = '[' + label + '](https://)'; a = s + label.length + 3; b = a + 8; }
    else if (tool === 'h') prefix('## ', 'Heading');
    else if (tool === 'quote') prefix('> ', 'Quote');
    else if (tool === 'list') prefix('- ', 'List item');
    if (rep != null) ta.value = v.slice(0, s) + rep + v.slice(e);
    ta.focus(); ta.setSelectionRange(a, b);
    st.postForm.body = ta.value; updatePreview();
  }

  /* ======================= photo cropper ======================= */
  function cropMetrics() {
    var c = st.crop, base = Math.max(CROP / c.w, CROP / c.h), s = base * c.zoom, dw = c.w * s, dh = c.h * s;
    var mx = (dw - CROP) / 2, my = (dh - CROP) / 2;
    c.ox = Math.max(-mx, Math.min(mx, c.ox)); c.oy = Math.max(-my, Math.min(my, c.oy));
    return { dw: dw, dh: dh, left: (CROP - dw) / 2 + c.ox, top: (CROP - dh) / 2 + c.oy };
  }
  function layoutCrop() {
    if (!st.crop) return;
    var m = cropMetrics(), im = $('#cropImg'), pv = $('#prevImg'), k = 72 / CROP;
    if (im) { im.style.width = m.dw + 'px'; im.style.height = m.dh + 'px'; im.style.left = m.left + 'px'; im.style.top = m.top + 'px'; }
    if (pv) { pv.style.width = m.dw * k + 'px'; pv.style.height = m.dh * k + 'px'; pv.style.left = m.left * k + 'px'; pv.style.top = m.top * k + 'px'; }
  }
  function initCrop() {
    var box = $('#cropBox'), drag = null;
    box.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, ox: st.crop.ox, oy: st.crop.oy };
      try { box.setPointerCapture(e.pointerId); } catch (er) {}
      e.preventDefault();
    });
    box.addEventListener('pointermove', function (e) {
      if (!drag) return;
      st.crop.ox = drag.ox + (e.clientX - drag.x); st.crop.oy = drag.oy + (e.clientY - drag.y); layoutCrop();
    });
    function end() { drag = null; }
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    box.addEventListener('keydown', function (e) {
      var d = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
      if (!d) return; e.preventDefault(); st.crop.ox += d[0]; st.crop.oy += d[1]; layoutCrop();
    });
    box.addEventListener('wheel', function (e) {
      e.preventDefault();
      st.crop.zoom = Math.max(1, Math.min(3, st.crop.zoom - e.deltaY * 0.002));
      var z = $('#cropZoom'); if (z) z.value = st.crop.zoom; layoutCrop();
    }, { passive: false });
  }
  function startCrop(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { XK.toast('Choose an image file.', 'error'); return; }
    if (file.size > 8 * 1024 * 1024) { XK.toast('That image is over 8 MB. Choose a smaller one.', 'error'); return; }
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () { st.crop = { img: img, url: url, w: img.naturalWidth, h: img.naturalHeight, zoom: 1, ox: 0, oy: 0 }; render(); };
    img.onerror = function () { URL.revokeObjectURL(url); XK.toast('That file could not be read as an image.', 'error'); };
    img.src = url;
  }
  function endCrop() { if (st.crop) { try { URL.revokeObjectURL(st.crop.url); } catch (e) {} st.crop = null; } }
  function saveCrop() {
    var c = st.crop, u = user(); if (!c || !u) return;
    var m = cropMetrics(), k = 256 / CROP, cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    var ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(c.img, m.left * k, m.top * k, m.dw * k, m.dh * k);
    XK.auth.update(u.id, { avatar: cv.toDataURL('image/jpeg', 0.9) });
    endCrop(); XK.toast('Profile photo saved.', 'ok'); render();
  }

  /* ======================= actions ======================= */
  function postId(t) { return t.closest('.post').getAttribute('data-id'); }
  var ACTIONS = {
    nav: function (t) { endCrop(); st.view = t.getAttribute('data-view'); render(); window.scrollTo(0, 0); },
    react: function (t) {
      var u = user();
      if (!u) { XK.toast('Sign in to react to posts.'); return; }
      var pid = postId(t), em = t.getAttribute('data-emoji');
      XK.posts.react(pid, em, u.id); st.refocus = '[data-id="' + pid + '"] [data-emoji="' + em + '"]'; render();
    },
    'toggle-replies': function (t) { var pid = postId(t); st.replyOpen[pid] = !st.replyOpen[pid]; st.refocus = '[data-id="' + pid + '"] [data-act="toggle-replies"]'; render(); },
    'send-reply': function (t) {
      var u = user(), pid = postId(t); if (!u || u.role !== 'vip') return;
      try { XK.posts.reply(pid, u.id, st.drafts[pid] || ''); st.drafts[pid] = ''; XK.toast('Reply posted anonymously.', 'ok'); render(); } catch (e) { XK.toast(e.message, 'error'); }
    },
    'del-post': function (t) {
      var pid = postId(t);
      XK.confirm('Delete this post?', 'It disappears for everyone. This cannot be undone.', 'Delete post', true).then(function (v) { if (v) { XK.posts.remove(pid); XK.toast('Post deleted.'); render(); } });
    },
    'del-reply': function (t) {
      var pid = postId(t), rid = t.closest('.reply').getAttribute('data-rid');
      XK.posts.removeReply(pid, rid); render();
    },
    notif: function (t) {
      var u = user(); if (!u) return;
      XK.auth.update(u.id, { notifyQuiz: t.checked });
      if (t.checked) { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} }
      XK.toast(t.checked ? 'Quiz notifications on.' : 'Quiz notifications off.');
    },
    'settings-tab': function (t) { endCrop(); st.settingsTab = t.getAttribute('data-tab'); render(); },
    'photo-save': saveCrop,
    'photo-cancel': function () { endCrop(); render(); },
    'photo-remove': function () { XK.auth.update(user().id, { avatar: null }); XK.toast('Photo removed.'); render(); },
    link: function (t) {
      var p = t.getAttribute('data-provider'), nm = p === 'google' ? 'Google' : 'Discord';
      XK.providerDialog(p).then(function (h) {
        if (!h) return;
        try { XK.auth.link(user().id, p, h); XK.toast(nm + ' linked.', 'ok'); render(); } catch (e) { XK.toast(e.message, 'error'); }
      });
    },
    unlink: function (t) {
      var p = t.getAttribute('data-provider');
      XK.confirm('Unlink ' + (p === 'google' ? 'Google' : 'Discord') + '?', 'You can link it again later.', 'Unlink', true).then(function (v) {
        if (!v) return;
        try { XK.auth.unlink(user().id, p); render(); } catch (e) { XK.toast(e.message, 'error'); }
      });
    },
    'sign-out': function () { endCrop(); XK.auth.logout(); st.view = null; render(); XK.toast('Signed out.'); },
    'admin-tab': function (t) { st.adminTab = t.getAttribute('data-tab'); render(); },
    'quiz-close': function () { XK.quiz.close(); render(); },
    mark: function (t) { try { XK.quiz.mark(t.getAttribute('data-id'), t.getAttribute('data-result')); render(); } catch (e) { XK.toast(e.message, 'error'); } },
    md: function (t) { mdTool(t.getAttribute('data-tool')); },
    'acct-edit': function (t) {
      var u = XK.auth.byId(t.closest('.acct-row').getAttribute('data-uid')); if (!u) return;
      XK.dialog({
        title: 'Edit account',
        fields: [
          { name: 'username', label: 'Username', value: u.username, required: true },
          { name: 'email', label: 'Email', type: 'email', value: u.email || '' },
          { name: 'role', label: 'Role', type: 'select', value: u.role, options: [{ value: 'player', label: 'Player' }, { value: 'vip', label: 'VIP Citizen' }] },
          { name: 'coins', label: 'Coins', type: 'number', value: u.coins },
          { name: 'gold', label: 'Gold Coins', type: 'number', value: u.gold },
          { name: 'reason', label: 'Reason for balance changes', type: 'textarea', hint: 'Required when Coins or Gold Coins change. Saved in the audit log.' }
        ],
        confirmLabel: 'Save changes',
        onSubmit: function (v) {
          return XK.attempt(function () {
            var name = v.username.trim(), err = XK.auth.checkUsername(name, u.id); if (err) throw new Error(err);
            var email = v.email.trim().toLowerCase();
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Enter a valid email address.');
            if (email && XK.auth.list().some(function (x) { return x.id !== u.id && x.email === email; })) throw new Error('Another account already uses that email.');
            var c = parseInt(v.coins, 10), g = parseInt(v.gold, 10);
            if (isNaN(c) || c < 0 || isNaN(g) || g < 0) throw new Error('Balances must be whole numbers, 0 or more.');
            var dc = c - (u.coins || 0), dg = g - (u.gold || 0), reason = v.reason.trim();
            if ((dc || dg) && !reason) throw new Error('Add a reason for the balance change.');
            XK.auth.update(u.id, { username: name, email: email || null, role: v.role });
            if (dc) XK.auth.award(u.id, dc, 'coins', reason, 'Operator');
            if (dg) XK.auth.award(u.id, dg, 'gold', reason, 'Operator');
            XK.audit.add('Edited account', name, (dc ? 'Coins ' + (dc > 0 ? '+' : '') + dc + '. ' : '') + (dg ? 'Gold ' + (dg > 0 ? '+' : '') + dg + '. ' : '') + (reason || ''));
          });
        }
      }).then(function (v) { if (v) { XK.toast('Account updated.', 'ok'); render(); } });
    },
    'acct-grant': function (t) {
      var u = XK.auth.byId(t.closest('.acct-row').getAttribute('data-uid')); if (!u) return;
      XK.dialog({
        title: 'Grant to ' + u.username,
        message: 'Use a negative number to take back. Balances cannot go below 0.',
        fields: [
          { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '20' },
          { name: 'currency', label: 'Currency', type: 'select', value: 'coins', options: [{ value: 'coins', label: 'Coins' }, { value: 'gold', label: 'Gold Coins' }] },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true, hint: 'Example: Quiz reward did not reach the inventory.' }
        ],
        confirmLabel: 'Apply',
        onSubmit: function (v) {
          return XK.attempt(function () {
            var n = parseInt(v.amount, 10); if (isNaN(n)) throw new Error('Enter a whole number.');
            XK.auth.award(u.id, n, v.currency, v.reason.trim(), 'Operator');
            XK.audit.add((n > 0 ? 'Granted ' : 'Removed ') + Math.abs(n) + ' ' + (v.currency === 'gold' ? 'Gold Coins' : 'Coins'), u.username, v.reason.trim());
          });
        }
      }).then(function (v) { if (v) { XK.toast('Balance updated.', 'ok'); render(); } });
    },
    'acct-delete': function (t) {
      var u = XK.auth.byId(t.closest('.acct-row').getAttribute('data-uid')); if (!u) return;
      XK.dialog({
        title: 'Delete account', danger: true, confirmLabel: 'Delete account',
        message: 'This permanently removes the account, its Coins and its inventory. Type the username to confirm.',
        fields: [{ name: 'confirm', label: 'Type "' + u.username + '"', required: true }],
        onSubmit: function (v) {
          return XK.attempt(function () {
            if (v.confirm.trim() !== u.username) throw new Error('The username does not match.');
            XK.auth.remove(u.id); XK.audit.add('Deleted account', u.username, '');
          });
        }
      }).then(function (v) { if (v) { XK.toast('Account deleted.'); render(); } });
    }
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t || !viewEl.contains(t) && !navEl.contains(t) && !acctEl.contains(t)) return;
    var h = ACTIONS[t.getAttribute('data-act')];
    if (h && t.type !== 'checkbox') h(t, e);
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'photoFile') { startCrop(t.files && t.files[0]); return; }
    if (t.getAttribute && t.getAttribute('data-act') === 'notif') { ACTIONS.notif(t); return; }
    if (t.name === 'ptype') { st.postForm.type = t.value; render(); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target, id = t.id;
    if (id === 'cropZoom') { st.crop.zoom = parseFloat(t.value); layoutCrop(); }
    else if (t.getAttribute && t.getAttribute('data-draft')) st.drafts[t.getAttribute('data-draft')] = t.value;
    else if (id === 'ans') st.answer = t.value;
    else if (id === 'aq') st.quizForm.q = t.value;
    else if (id === 'akey') st.quizForm.key = t.value;
    else if (id === 'mdBody') { st.postForm.body = t.value; updatePreview(); }
    else if (id === 'ptitle') st.postForm.title = t.value;
    else if (id === 'pwhen') st.postForm.when = t.value;
    else if (id === 'plink') st.postForm.link = t.value;
    else if (id === 'acctSearch') { st.acctFilter = t.value; $('#acctList').innerHTML = acctRows(); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-form'); if (!f) return;
    e.preventDefault();
    try {
      if (f === 'answer') {
        var u = user(); if (!u) return;
        XK.quiz.answer(u.id, st.answer); st.answer = ''; XK.toast('Answer sent. An operator will check it.', 'ok'); render();
      } else if (f === 'quiz') {
        XK.quiz.post(st.quizForm.q, st.quizForm.key); st.quizForm = { q: '', key: '' };
        XK.toast('Quiz queued. It goes live in 20 seconds.', 'ok'); render();
      } else if (f === 'post') {
        var p = st.postForm, title = p.title.trim(), body = p.body.trim(), link = p.link.trim();
        if (!title) throw new Error('Add a title.');
        if (!body) throw new Error('Write the message.');
        if (p.type === 'event' && link && !/^https?:\/\/\S+$/i.test(link)) throw new Error('The event link must start with http:// or https://');
        XK.posts.add({ type: p.type, title: title, body: body, link: p.type === 'event' ? link : '', when: p.type === 'event' ? p.when.trim() : '' });
        st.postForm = { type: p.type, title: '', body: '', link: '', when: '' };
        XK.toast('Posted.', 'ok'); render();
      }
    } catch (er) { XK.toast(er.message, 'error'); }
  });

  /* ======================= live quiz ticker ======================= */
  function quizKey() {
    var q = XK.quiz.get(), u = user();
    if (!q) return 'none';
    var m = myAnswer(q, u);
    return q.id + ':' + XK.quiz.phase(q) + ':' + (m ? m.result : '-') + ':' + q.answers.length;
  }
  function tick() {
    var q = XK.quiz.get(), ph = XK.quiz.phase(q), u = user();
    if (ph === 'scheduled' && q.id !== st.notified) {
      st.notified = q.id;
      if (u && u.notifyQuiz) {
        XK.toast('Trivia Quiz will start in 20 Seconds!');
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification('XKing Trivia Quiz', { body: 'Trivia Quiz will start in 20 Seconds!' }); } catch (e) {}
      }
    }
    var rem = ph === 'scheduled' ? remaining(q) : 0;
    $$('[data-countdown]').forEach(function (el) { el.textContent = rem; });
    var k = quizKey();
    if (k !== st.phaseKey) { st.phaseKey = k; if (st.view === 'games' || st.view === 'admin') scheduleRender(); }
  }

  XK.on('data', function () { scheduleRender(); });
  XK.on('admin', function () { render(); });

  XK.boot();
  render();
  st.phaseKey = quizKey();
  var q0 = XK.quiz.get();
  if (q0 && XK.quiz.phase(q0) === 'scheduled') st.notified = q0.id;
  setInterval(tick, 1000);
})();
