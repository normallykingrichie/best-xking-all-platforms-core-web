/* XKing Core - dashboard logic for index.html (guest home, feeds, games, exchange, account settings, staff tools). */
(function () {
  'use strict';
  var XK = window.XK, esc = XK.esc, $ = XK.$, $$ = XK.$$, nf = XK.nf, EMOJI = XK.EMOJI, S = XK.S, api = XK.api;

  var NAV = { home: 'Home', announcements: 'Announcements', games: 'ACT Games', events: 'Events', exchange: 'Exchange', feedback: 'Suggest / Report', admin: 'Admin' };
  var LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var TICK = '<span class="tick"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg></span>';
  var TREE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l5.2 7.3h-3.1l4.1 6h-4.3l3.4 5H6.7l3.4-5H5.8l4.1-6H6.8z"/><rect x="10.8" y="19.6" width="2.4" height="3.2" rx=".6"/></svg>';
  var CROP = 280;

  var st = {
    view: null, settingsTab: 'photo', adminTab: 'quiz', drafts: {}, replyOpen: {}, answer: '',
    quizForm: { q: '', key: '' }, postForm: { type: 'announcement', title: '', body: '', link: '', when: '' },
    reportForm: { kind: 'suggestion', title: '', details: '', link: '' },
    acctFilter: '', crop: null, notified: '', phaseKey: '', refocus: '', busy: false
  };
  var viewEl = $('#view'), navEl = $('#nav'), acctEl = $('#acctArea');

  function user() { return XK.me(); }
  function admin() { return XK.admin.on(); }
  function isLeader() { var u = user(); return !!(u && u.staff === 'leader'); }
  function roleLabel(u) { return u.staff === 'leader' ? 'Leader' : u.staff === 'admin' ? 'Admin' : u.vip ? 'VIP Citizen' : 'Player'; }
  function fail(e) { XK.toast(XK.msg(e), 'error'); }
  function hasDiscord() { return S.identities.some(function (i) { return i.provider === 'discord'; }); }

  /* ======================= header ======================= */
  function navItems() {
    var a = [];
    if (!user()) a.push('home');
    a.push('announcements', 'games', 'events', 'exchange', 'feedback');
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
    } else if (!S.ready) {
      acctEl.innerHTML = '';
    } else {
      acctEl.innerHTML = '<a class="btn-ghost btn-sm" href="login.html">Sign in</a><a class="btn-primary btn-sm" href="register.html">Sign up</a>';
    }
  }

  /* ======================= shared pieces ======================= */
  function greet() {
    var u = user();
    if (!u) {
      return '<div class="guest-note"><div><strong>You are browsing as a guest.</strong><span>Sign in to react, play games and save your progress.</span></div><div class="guest-actions"><a class="btn-ghost btn-sm" href="login.html">Sign in</a><a class="btn-primary btn-sm" href="register.html">Sign up</a></div></div>';
    }
    return '<section class="greet">' + XK.avatar(u, 'md') + '<div class="greet-text"><p class="eyebrow">' + esc(roleLabel(u)) + (admin() ? ' &middot; Admin mode' : '') + '</p><h1 class="display">Welcome back, ' + esc(u.username) + '</h1></div>' +
      '<div class="balances"><div class="bal"><span>Coins</span><strong>' + nf(u.coins) + '</strong></div><div class="bal bal-gold"><span>Gold Coins</span><strong>' + nf(u.gold) + '</strong></div></div></section>';
  }

  function renderPost(p) {
    var u = user(), isAdm = admin(), open = !!st.replyOpen[p.id], replies = p.replies || [], canReply = !!(u && u.vip);
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
      '<div class="post-head"><span class="chip ' + (p.type === 'event' ? 'chip-event' : '') + '">' + (p.type === 'event' ? 'Event' : 'Announcement') + '</span>' +
      '<time>' + esc(XK.fmtDate(p.createdAt)) + '</time><span>by ' + esc(p.author) + '</span>' +
      (isAdm ? '<button type="button" class="link-btn is-danger-text push" data-act="del-post">Delete post</button>' : '') + '</div>' +
      '<h3 class="post-title">' + esc(p.title) + '</h3>' + meta + '<div class="md">' + XK.md(p.body) + '</div>' +
      '<div class="reacts" role="group" aria-label="Reactions">' + reacts + '</div>' +
      '<div><button type="button" class="link-btn" data-act="toggle-replies" aria-expanded="' + open + '">' + (open ? 'Hide' : 'Show') + ' anonymous replies (' + replies.length + ')</button></div>' +
      repliesHtml + '</article>';
  }

  /* ======================= views ======================= */
  function viewLoading() { return '<p class="empty" role="status">Loading...</p>'; }
  function viewFatal() { return '<div class="panel"><h2 class="display">Cannot connect</h2><p class="form-error">' + esc(XK.fatal()) + '</p></div>'; }

  function viewHome() {
    var points = [
      'Get every announcement, even if you have not joined our Discord!',
      'Get Coins by completing any act and event',
      'Exchange your Coins for useful things for yourself, e.g. a Role on Discord and any Properties of acts and events',
      'Suggest ideas and report bugs without joining Discord, in a more organized way!',
      'And more coming soon!!'
    ];
    var latest = S.posts.slice(0, 2);
    return '<section class="hero"><div class="hero-copy">' +
      '<p class="eyebrow">XKing Studio &middot; Community hub</p>' +
      '<h1 class="display hero-title">Welcome to Official Public <span class="gold">XKing</span>!</h1>' +
      '<h2 class="hero-sub">What you will get here?</h2>' +
      '<ul class="checks">' + points.map(function (t) { return '<li>' + TICK + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' +
      '<div class="cta-stack"><div class="cta-row"><a class="btn-rgb rgb-a" href="register.html">Sign up</a><a class="btn-rgb rgb-b" href="login.html">Sign in</a></div>' +
      '<a class="btn-tree" href="' + esc(XK.CONFIG.linktreeUrl) + '" target="_blank" rel="noopener noreferrer">' + TREE + 'Go to LinkTree</a></div>' +
      '</div><div class="hero-visual"><canvas id="skyline" aria-hidden="true"></canvas></div></section>' +
      '<section class="section-gap"><div class="section-head"><h2 class="display">Latest from XKing</h2><button type="button" class="link-btn" data-act="nav" data-view="announcements">See all announcements</button></div>' +
      '<div class="feed">' + (latest.length ? latest.map(renderPost).join('') : '<p class="empty">No announcements yet. Check back soon.</p>') + '</div></section>';
  }

  function viewFeed(type) {
    var list = S.posts.filter(function (p) { return p.type === type; }), isEv = type === 'event';
    return greet() + '<div class="section-head"><h2 class="display">' + (isEv ? 'Events' : 'Announcements') + '</h2><p class="muted">' +
      (isEv ? 'New events and where to join them.' : 'News from the XKing team, no Discord needed.') + '</p></div>' +
      '<div class="feed">' + (list.length ? list.map(renderPost).join('') : '<p class="empty">Nothing here yet. New ' + (isEv ? 'events' : 'announcements') + ' from the XKing team will appear here.</p>') + '</div>';
  }

  /* ----- games ----- */
  function remaining(q) { return Math.max(0, Math.ceil((q.startsAt - XK.now()) / 1000)); }
  function ord(n) { return ['1st', '2nd', '3rd'][n - 1] || n + 'th'; }
  function slotsHtml(q) {
    var R = XK.CONFIG.quizRewards;
    return '<ol class="slots" aria-label="Winner places">' + [1, 2, 3].map(function (i) {
      var w = (q.winners || []).filter(function (x) { return x.place === i; })[0];
      return '<li class="' + (w ? 'is-won' : '') + '"><span class="slot-place">' + ord(i) + '</span><span class="slot-name">' + (w ? esc(w.username) : 'Open') + '</span><span class="slot-coins tnum">+' + R[i - 1] + '</span></li>';
    }).join('') + '</ol>';
  }
  function triviaInner() {
    var q = S.quiz, ph = XK.quizPhase(q), u = user(), mine = q && q.mine, R = XK.CONFIG.quizRewards;
    var h = '<header><span class="chip">ACT Game</span><h2 class="display">Trivia Quiz</h2><p class="muted">A race! The first <strong>3</strong> correct answers win: <strong>' + R[0] + '</strong>, <strong>' + R[1] + '</strong> and <strong>' + R[2] + '</strong> Coins. A wrong answer? Just try again.</p></header>';
    if (ph === 'none') return h + '<div class="state"><p class="big">No quiz right now.</p><p class="muted">Turn on notifications and you get a 20-second heads-up before the next one.</p></div>' + notifySwitch(u);
    if (ph === 'scheduled') h += '<div class="state" role="status"><p class="big">Trivia Quiz will start in <b data-countdown>' + remaining(q) + '</b> Seconds!</p><p class="muted">Get ready. The question appears here the moment the countdown ends.</p></div>';
    else if (ph === 'starting') h += '<div class="state" role="status"><p class="big">Starting now...</p><p class="muted">Loading the question.</p></div>';
    else {
      h += '<div class="state"><p class="eyebrow">' + (ph === 'live' ? 'Live question' : 'Quiz finished') + '</p><p class="quiz-q">' + esc(q.question || '') + '</p></div>' + slotsHtml(q);
      if (ph === 'closed') {
        h += mine && mine.result === 'correct' ? resultLine(mine) : '<p class="muted">' + (q.winners.length >= 3 ? 'All 3 places were taken. This card clears itself in a few minutes.' : 'This quiz is closed. Watch for the next one.') + '</p>';
      } else if (!u) h += '<p class="lock-note">' + LOCK + 'Sign in to answer and win Coins.</p><div><a class="btn-primary btn-sm" href="login.html">Sign in</a></div>';
      else if (mine && (mine.result === 'correct' || mine.result === 'late' || mine.result === 'pending')) h += resultLine(mine);
      else {
        if (mine && mine.result === 'wrong') h += '<p><span class="pill pill-bad">Not quite</span> <span class="muted">"' + esc(mine.text) + '" was not it. Try again!</span></p>';
        h += '<form class="answer-form" data-form="answer"><div class="field"><label for="ans">Your answer</label><input id="ans" type="text" maxlength="120" required autocomplete="off" value="' + esc(st.answer) + '"></div><button type="submit" class="btn-primary" style="align-self:end">Submit answer</button></form><p class="hint">Be quick. Places are given in the order answers are checked.</p>';
      }
    }
    return h + notifySwitch(u);
  }
  function notifySwitch(u) {
    return u ? '<label class="switch"><input type="checkbox" data-act="notif"' + (u.notifyQuiz ? ' checked' : '') + '><span class="track"></span><span>Notify me when a quiz is coming</span></label>' : '';
  }
  function resultLine(a) {
    if (a.result === 'correct') return '<p><span class="pill pill-ok">You took ' + ord(a.place) + ' place, +' + a.reward + ' Coins</span> <span class="muted">Your answer: ' + esc(a.text) + '</span></p>';
    if (a.result === 'late') return '<p><span class="pill">Right, but too late</span> <span class="muted">All 3 places were already taken.</span></p>';
    return '<p><span class="pill">Waiting for an operator</span> <span class="muted">Your answer: ' + esc(a.text) + '</span></p>';
  }
  function viewGames() {
    return greet() + '<div class="section-head"><h2 class="display">ACT Games</h2><p class="muted">Play, earn Coins, climb the city.</p></div>' +
      '<div class="games-grid"><article class="game-card" id="triviaCard">' + triviaInner() + '</article>' +
      '<article class="game-card is-soon" role="group" aria-label="Tycoon City, coming soon"><div class="soon-blur" aria-hidden="true"><header><span class="chip">ACT Game</span><h2 class="display">Tycoon City</h2></header><p class="muted">Build, earn and expand your own district.</p></div><div class="soon-label" aria-hidden="true">Coming soon...</div></article></div>';
  }

  /* ----- exchange ----- */
  function priceText(it) { return nf(it.price) + ' ' + (it.currency === 'gold' ? 'Gold Coins' : 'Coins'); }
  function viewExchange() {
    var items = S.shop;
    return greet() + '<div class="section-head"><h2 class="display">Exchange</h2><p class="muted">Spend your Coins on useful things.</p></div>' +
      (items.length
        ? '<div class="shop-grid">' + items.map(function (it) {
          return '<article class="panel shop-card" data-item="' + esc(it.id) + '"><span class="chip">' + (it.kind === 'discord_role' ? 'Discord role' : 'Special') + '</span><h3>' + esc(it.name) + '</h3><p class="muted">' + esc(it.description) + '</p>' +
            '<p class="price tnum">' + esc(priceText(it)) + '</p><div><button type="button" class="btn-primary btn-sm" data-act="buy">' + (user() ? 'Exchange' : 'Sign in to exchange') + '</button></div></article>';
        }).join('') + '</div>'
        : '<div class="state"><p class="big">No products or anythings to be exchange...</p><p class="muted">Check back soon. New things will appear here.</p></div>');
  }

  /* ----- suggest / report ----- */
  var STATUS_TXT = { 'new': 'Sent', seen: 'Seen', done: 'Done', dismissed: 'Closed' };
  function viewFeedback() {
    var u = user(), f = st.reportForm;
    var form;
    if (!u) form = '<p class="lock-note">' + LOCK + 'Sign in to send a suggestion or a bug report, so we can follow up.</p><div><a class="btn-primary btn-sm" href="login.html">Sign in</a></div>';
    else form = '<form class="form-stack" data-form="report" novalidate>' +
      '<div class="seg" role="radiogroup" aria-label="Type"><label><input type="radio" name="rkind" value="suggestion"' + (f.kind === 'suggestion' ? ' checked' : '') + '><span>Suggestion</span></label><label><input type="radio" name="rkind" value="bug"' + (f.kind === 'bug' ? ' checked' : '') + '><span>Bug report</span></label></div>' +
      '<div class="field"><label for="rtitle">Title</label><input id="rtitle" type="text" maxlength="120" required value="' + esc(f.title) + '"></div>' +
      '<div class="field"><label for="rdetails">Details</label><textarea id="rdetails" rows="6" maxlength="4000" required placeholder="What happened, or what would you like to see?">' + esc(f.details) + '</textarea></div>' +
      '<div class="field"><label for="rlink">Link to a screenshot or video (optional)</label><input id="rlink" type="url" inputmode="url" placeholder="https://" value="' + esc(f.link) + '"><p class="hint">You cannot upload files here. Upload them somewhere else first (for example Imgur, an unlisted YouTube video, Streamable or a shared Google Drive file), then paste the link.</p></div>' +
      '<div><button type="submit" class="btn-primary">Send</button></div></form>';
    var mine = S.myReports.length ? '<div class="panel"><h3>Your recent messages</h3><div class="rows">' + S.myReports.map(function (r) {
      return '<div class="row"><div><strong>' + esc(r.title) + '</strong><span class="muted">' + (r.kind === 'bug' ? 'Bug report' : 'Suggestion') + ' &middot; ' + esc(XK.fmtDate(Date.parse(r.created_at))) + '</span></div><span class="pill ' + (r.status === 'done' ? 'pill-ok' : '') + '">' + STATUS_TXT[r.status] + '</span></div>';
    }).join('') + '</div></div>' : '';
    return greet() + '<div class="section-head"><h2 class="display">Suggest / Report bugs</h2><p class="muted">Tell the XKing team what to improve, or what is broken. No Discord needed.</p></div><div class="stack"><div class="panel">' + form + '</div>' + mine + '</div>';
  }

  /* ----- account settings ----- */
  function viewSettings() {
    var u = user();
    var tabs = [['photo', 'Profile & Photo'], ['link', 'Link More Account'], ['inventory', 'Inventory']];
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
      return '<h2 class="display">Change Photo Profile</h2><div class="photo-row">' + XK.avatar(u, 'lg') + '<div class="stack"><p class="muted">Upload an image, then move and resize it until it fits. You see a preview before anything is saved.</p><div class="photo-actions"><span class="btn-primary file-btn">Choose image<input type="file" id="photoFile" accept="image/*" aria-label="Choose profile image"></span>' + (u.avatar ? '<button type="button" class="btn-ghost" data-act="photo-remove">Remove photo</button>' : '') + '</div></div></div>' +
        '<div class="stack"><h3>Username</h3><p class="muted">Now: <strong>' + esc(u.username) + '</strong></p><div><button type="button" class="btn-ghost btn-sm" data-act="rename">Change username</button></div></div>';
    }
    return '<h2 class="display">Adjust your photo</h2><div class="crop-wrap"><div class="crop" id="cropBox" tabindex="0" role="img" aria-label="Photo editor. Drag to move the photo. Arrow keys also move it."><img id="cropImg" src="' + c.url + '" alt=""><div class="crop-ring"></div></div>' +
      '<div class="crop-side"><div class="field"><label for="cropZoom">Resize</label><input type="range" id="cropZoom" min="1" max="3" step="0.01" value="' + c.zoom + '"></div>' +
      '<div><p class="eyebrow" style="margin-bottom:8px">Preview</p><div class="prev"><img id="prevImg" src="' + c.url + '" alt=""></div></div>' +
      '<div class="photo-actions"><button type="button" class="btn-primary" data-act="photo-save"' + (st.busy ? ' disabled' : '') + '>Save photo</button><button type="button" class="btn-ghost" data-act="photo-cancel">Cancel</button></div></div></div>';
  }
  function identityName(i) {
    var d = i.identity_data || {};
    return (d.custom_claims && d.custom_claims.global_name) || d.full_name || d.name || d.user_name || d.email || 'linked';
  }
  function panelLink(u) {
    var ids = S.identities, dis = ids.filter(function (i) { return i.provider === 'discord'; })[0], em = ids.filter(function (i) { return i.provider === 'email'; })[0];
    var rows = '<div class="row"><div><strong>Discord</strong><span class="muted">' + (dis ? 'Linked as ' + esc(identityName(dis)) : 'Not linked') + '</span></div>' +
      (dis ? (ids.length > 1 ? '<button type="button" class="btn-ghost btn-sm" data-act="unlink">Unlink</button>' : '<span class="badge">Only sign-in method</span>')
           : '<button type="button" class="btn-primary btn-sm" data-act="link-discord">Link Discord</button>') + '</div>' +
      '<div class="row"><div><strong>Email and password</strong><span class="muted">' + (em ? esc(u.email || '') : 'Not set up') + '</span></div>' + (em ? '<span class="badge">Linked</span>' : '') + '</div>' +
      '<div class="row"><div><strong>Google</strong><span class="muted">Coming later</span></div><button type="button" class="btn-ghost btn-sm" disabled>Coming later</button></div>';
    return '<h2 class="display">Link More Account</h2><p class="muted">Link your accounts so signing in with any of them opens the same profile and the same Coins. Linking Discord also lets you buy Discord roles and tags.</p>' +
      (dis ? '' : '<div class="warn-red" role="alert"><strong>Warning</strong><p>' + esc(XK.WARN_TEXT) + '</p></div>') + '<div class="rows">' + rows + '</div>';
  }
  function panelInventory(u) {
    var led = S.ledger;
    var ord = S.orders.filter(function (o) { return o.status !== 'refunded'; });
    var stTxt = { pending: 'Waiting for your Discord role', fulfilled: 'Delivered' };
    return '<h2 class="display">Inventory</h2><div class="inv-grid"><div class="bal"><span>Coins</span><strong>' + nf(u.coins) + '</strong></div><div class="bal bal-gold"><span>Gold Coins</span><strong>' + nf(u.gold) + '</strong></div></div>' +
      (u.vip ? '<p><span class="badge badge-vip">VIP Citizen</span> <span class="muted">Permanent. Thank you for supporting XKing!</span></p>' : '') +
      '<div class="stack"><h3>Items</h3>' + (ord.length ? '<div class="rows">' + ord.map(function (o) { return '<div class="row"><div><strong>' + esc(o.shop_items ? o.shop_items.name : o.item_id) + '</strong><span class="muted">' + esc(stTxt[o.status] || o.status) + ' &middot; ' + esc(XK.fmtDate(Date.parse(o.created_at))) + '</span></div></div>'; }).join('') + '</div>' : '<p class="empty">Nothing here yet. Roles, tags and properties you exchange for Coins will show up here.</p>') + '</div>' +
      '<div class="stack"><h3>Recent activity</h3>' + (led.length ? '<ul class="ledger">' + led.map(function (l) {
        return '<li><span>' + esc(l.reason || 'Adjustment') + ' <span class="muted">&middot; ' + esc(XK.fmtDate(Date.parse(l.created_at))) + '</span></span><span class="' + (l.delta > 0 ? 'pos' : 'neg') + ' tnum">' + (l.delta > 0 ? '+' : '') + nf(l.delta) + ' ' + (l.currency === 'gold' ? 'Gold' : 'Coins') + '</span></li>';
      }).join('') + '</ul>' : '<p class="empty">No activity yet. Earn your first Coins in ACT Games.</p>') + '</div>';
  }

  /* ----- admin ----- */
  function viewAdmin() {
    var tabs = [['quiz', 'Post Quiz'], ['post', 'Post Announcement or Event'], ['accounts', 'Accounts'], ['reports', 'Reports'], ['log', 'Audit log']];
    if (isLeader()) tabs.push(['staff', 'Staff']);
    var body = st.adminTab === 'post' ? adminPost() : st.adminTab === 'accounts' ? adminAccounts() : st.adminTab === 'reports' ? adminReports() : st.adminTab === 'log' ? adminLog() : st.adminTab === 'staff' && isLeader() ? adminStaff() : adminQuiz();
    return greet() + '<div class="section-head"><h2 class="display">Admin tools</h2><p class="muted">' + (isLeader() ? 'You are the Leader.' : 'Your admin session was approved by the Leader.') + ' Every action is written to the audit log.</p></div>' +
      '<div class="subtabs" role="group" aria-label="Admin sections">' + tabs.map(function (t) {
        return '<button type="button" class="subtab" data-act="admin-tab" data-tab="' + t[0] + '" aria-current="' + (st.adminTab === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div><div class="stack">' + body + '</div>';
  }
  function adminQuiz() {
    var q = S.quiz, ph = XK.quizPhase(q), status;
    if (ph === 'none') status = '<p class="muted">No quiz has been posted yet.</p>';
    else if (ph === 'scheduled') status = '<div class="state" role="status"><p class="big">Going live in <b data-countdown>' + remaining(q) + '</b>s</p><p class="muted">Players with notifications on were told: Trivia Quiz will start in 20 Seconds!</p><div><button type="button" class="btn-ghost btn-sm" data-act="quiz-close">Cancel quiz</button></div></div>';
    else if (ph === 'live' || ph === 'starting') status = '<div class="state"><p class="big">Quiz is live</p><p class="quiz-q">' + esc(q.question || '...') + '</p>' + (q.key ? '<p class="muted">Your answer key: <strong>' + esc(q.key) + '</strong></p>' : '') + '<div><button type="button" class="btn-ghost btn-sm" data-act="quiz-close">Close quiz</button></div></div>';
    else status = '<div class="state"><p class="big">Last quiz is closed</p><p class="muted">' + esc(q.question || '') + '</p></div>';
    var answers = '';
    if (q) {
      var names = S.adm.names || {};
      answers = '<div class="panel"><h3>Answers (' + q.answers.length + ')</h3>' + (q.answers.length ? '<div class="rows">' + q.answers.map(function (a) {
        var act = a.result === 'pending'
          ? '<div class="photo-actions"><button type="button" class="btn-primary btn-sm" data-act="mark" data-id="' + a.id + '" data-result="correct">Correct</button><button type="button" class="btn-ghost btn-sm" data-act="mark" data-id="' + a.id + '" data-result="wrong">Wrong</button></div>'
          : a.result === 'wrong'
            ? '<div class="photo-actions"><span class="pill pill-bad">Wrong</span><button type="button" class="btn-ghost btn-sm" data-act="mark" data-id="' + a.id + '" data-result="correct">It is correct</button></div>'
            : '<span class="pill ' + (a.result === 'correct' ? 'pill-ok' : '') + '">' + (a.result === 'correct' ? ord(a.place) + ' place, +' + a.reward : 'Late') + '</span>';
        return '<div class="row"><div><strong>' + esc(names[a.userId] || 'Deleted user') + '</strong><span class="muted">' + esc(a.text) + ' &middot; ' + esc(XK.fmtTime(a.ts)) + '</span></div>' + act + '</div>';
      }).join('') + '</div>' : '<p class="empty">No answers yet.</p>') + '</div>';
    }
    return '<div class="panel"><h2 class="display">Post a Trivia Quiz</h2>' +
      '<form class="form-stack" data-form="quiz"><fieldset style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:16px" ' + (ph === 'scheduled' ? 'disabled' : '') + '>' +
      '<div class="field"><label for="aq">Question</label><textarea id="aq" required maxlength="400" placeholder="Which block drops the most Coins in XKing City?">' + esc(st.quizForm.q) + '</textarea></div>' +
      '<div class="field"><label for="akey">Answer key (recommended, only staff see this)</label><input id="akey" type="text" maxlength="120" value="' + esc(st.quizForm.key) + '"><p class="hint">With a key, answers are checked instantly and the first 3 correct players win 10, 7 and 5 Coins. Use | for more than one accepted answer, like Paris|City of Light. Without a key you mark answers by hand, and the order you mark decides the places. Posting a new quiz replaces the current one.</p></div>' +
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
  function badgeFor(a) { return a.staff_role === 'leader' ? 'Leader' : a.staff_role === 'admin' ? 'Admin' : a.is_vip ? 'VIP Citizen' : 'Player'; }
  function acctRows() {
    var all = S.adm.accounts, f = st.acctFilter.trim().toLowerCase(), lead = isLeader();
    var list = all.filter(function (u) { return !f || (u.username + ' ' + (u.email || '') + ' ' + (u.providers || []).join(' ')).toLowerCase().indexOf(f) >= 0; });
    if (!list.length) return '<p class="empty">' + (all.length ? 'No accounts match that search.' : 'No accounts yet.') + '</p>';
    return list.map(function (u) {
      var staff = !!u.staff_role, self = u.id === user().id;
      return '<div class="acct-row" data-uid="' + u.id + '">' + XK.avatar({ avatar: /^https:\/\//.test(u.avatar_url || '') ? u.avatar_url : null }, 'sm') + '<div class="acct-who"><strong>' + esc(u.username) + '</strong><span class="muted">' + esc(u.email || 'No email') + ' &middot; ' + esc((u.providers || []).join(', ') || 'no sign-in') + '</span></div>' +
        '<span class="badge ' + (u.is_vip ? 'badge-vip' : '') + '">' + badgeFor(u) + '</span>' +
        '<div class="acct-num"><span>Coins</span><strong>' + nf(u.coins) + '</strong></div><div class="acct-num"><span>Gold</span><strong>' + nf(u.gold) + '</strong></div>' +
        '<div class="acct-actions"><button type="button" class="btn-ghost btn-sm" data-act="acct-balance">Balance</button>' +
        '<button type="button" class="btn-ghost btn-sm" data-act="acct-vip">' + (u.is_vip ? 'Remove VIP' : 'Give VIP') + '</button>' +
        '<button type="button" class="btn-ghost btn-sm" data-act="acct-rename">Rename</button>' +
        (lead && !self && u.staff_role !== 'leader' ? '<button type="button" class="btn-ghost btn-sm" data-act="acct-staff">' + (u.staff_role === 'admin' ? 'Remove admin' : 'Make admin') + '</button>' : '') +
        (lead && !self ? '<button type="button" class="btn-ghost btn-sm" data-act="acct-transfer">Make Leader</button>' : '') +
        (!self && u.staff_role !== 'leader' && (lead || !staff) ? '<button type="button" class="btn-ghost btn-sm is-danger-text" data-act="acct-delete">Delete</button>' : '') + '</div></div>';
    }).join('');
  }
  function adminAccounts() {
    return '<div class="panel"><h2 class="display">Accounts</h2><p class="warn-box"><strong>Sensitive area.</strong> Use this to fix stuck progress, for example giving back Coins that never reached an inventory. Every change is written to the audit log.</p>' +
      '<div class="field"><label for="acctSearch">Search accounts</label><input id="acctSearch" type="search" placeholder="Username, email or sign-in method" value="' + esc(st.acctFilter) + '"></div>' +
      '<div class="rows" id="acctList">' + acctRows() + '</div></div>';
  }
  function adminLog() {
    var log = S.adm.audit;
    return '<div class="panel"><h2 class="display">Audit log</h2>' + (log.length ? '<ol class="audit">' + log.map(function (a) {
      return '<li><time>' + esc(XK.fmtStamp(a.ts)) + '</time><strong>' + esc(a.action) + '</strong><span>' + (a.actor ? 'by ' + esc(a.actor) + ' &middot; ' : '') + esc(a.target) + (a.detail ? ' &middot; ' + esc(a.detail) : '') + '</span></li>';
    }).join('') + '</ol>' : '<p class="empty">No admin actions recorded yet.</p>') + '</div>';
  }
  function adminReports() {
    var list = S.adm.reports;
    return '<div class="panel"><h2 class="display">Suggestions and bug reports</h2>' + (list.length ? '<div class="rows">' + list.map(function (r) {
      return '<div class="row report-row" data-id="' + r.id + '"><div><strong>' + esc(r.title) + '</strong><span class="muted">' + (r.kind === 'bug' ? 'Bug report' : 'Suggestion') + ' &middot; ' + esc(r.who) + ' &middot; ' + esc(XK.fmtStamp(r.ts)) + '</span>' +
        '<p class="pre">' + esc(r.details) + '</p>' + (r.link ? '<a href="' + esc(r.link) + '" target="_blank" rel="noopener noreferrer">' + esc(r.link) + '</a>' : '') + '</div>' +
        '<div class="photo-actions"><span class="pill ' + (r.status === 'done' ? 'pill-ok' : '') + '">' + STATUS_TXT[r.status] + '</span>' +
        ['seen', 'done', 'dismissed'].filter(function (s) { return s !== r.status; }).map(function (s) { return '<button type="button" class="btn-ghost btn-sm" data-act="report-status" data-status="' + s + '">' + ({ seen: 'Mark seen', done: 'Mark done', dismissed: 'Dismiss' })[s] + '</button>'; }).join('') + '</div></div>';
    }).join('') + '</div>' : '<p class="empty">No reports yet.</p>') + '</div>';
  }
  function adminStaff() {
    var ss = S.adm.sessions, t = XK.now();
    var pending = ss.filter(function (s) { return s.status === 'pending'; });
    var active = ss.filter(function (s) { return s.status === 'approved' && s.expiresAt > t; });
    var staff = S.adm.accounts.filter(function (a) { return a.staff_role; });
    var hours = [1, 6, 12, 24, 72, 168].map(function (h) { return '<option value="' + h + '"' + (h === 24 ? ' selected' : '') + '>' + (h < 24 ? h + ' hour' + (h > 1 ? 's' : '') : (h / 24) + ' day' + (h > 24 ? 's' : '')) + '</option>'; }).join('');
    return '<div class="panel"><h2 class="display">Admin requests</h2><p class="muted">Admins who typed the right password wait here for you.</p>' +
      (pending.length ? '<div class="rows">' + pending.map(function (s) {
        return '<div class="row" data-sid="' + s.id + '"><div><strong>' + esc(s.who) + '</strong><span class="muted">Asked ' + esc(XK.fmtStamp(s.requestedAt)) + '</span></div><div class="photo-actions"><label class="sr-only" for="h-' + s.id + '">Hours</label><select id="h-' + s.id + '" class="sel-sm">' + hours + '</select><button type="button" class="btn-primary btn-sm" data-act="sess-approve">Approve</button><button type="button" class="btn-ghost btn-sm" data-act="sess-deny">Deny</button></div></div>';
      }).join('') + '</div>' : '<p class="empty">No one is waiting.</p>') + '</div>' +
      '<div class="panel"><h3>Active admin sessions</h3>' + (active.length ? '<div class="rows">' + active.map(function (s) {
        return '<div class="row" data-sid="' + s.id + '"><div><strong>' + esc(s.who) + '</strong><span class="muted">Until ' + esc(XK.fmtStamp(s.expiresAt)) + '</span></div><button type="button" class="btn-ghost btn-sm is-danger-text" data-act="sess-revoke">Revoke</button></div>';
      }).join('') + '</div>' : '<p class="empty">No active admin sessions.</p>') + '</div>' +
      '<div class="panel"><h3>Staff</h3><div class="rows">' + staff.map(function (a) { return '<div class="row"><div><strong>' + esc(a.username) + '</strong><span class="muted">' + badgeFor(a) + '</span></div></div>'; }).join('') + '</div>' +
      '<p class="hint">Make or remove admins, or hand over leadership, from the Accounts tab.</p>' +
      '<div><button type="button" class="btn-ghost btn-sm" data-act="admin-password">Change admin password</button></div></div>';
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
    if (XK.fatal()) { viewEl.innerHTML = viewFatal(); return; }
    if (!S.ready) { viewEl.innerHTML = viewLoading(); return; }
    var v = st.view, html;
    if (v === 'home') html = viewHome();
    else if (v === 'games') html = viewGames();
    else if (v === 'events') html = viewFeed('event');
    else if (v === 'exchange') html = viewExchange();
    else if (v === 'feedback') html = viewFeedback();
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
    var c = st.crop, u = user(); if (!c || !u || st.busy) return;
    var m = cropMetrics(), k = 256 / CROP, cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    var ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(c.img, m.left * k, m.top * k, m.dw * k, m.dh * k);
    st.busy = true;
    cv.toBlob(function (blob) {
      if (!blob) { st.busy = false; XK.toast('Could not prepare the photo.', 'error'); return; }
      api.uploadAvatar(blob).then(function () { endCrop(); XK.toast('Profile photo saved.', 'ok'); }, fail).then(function () { st.busy = false; render(); });
    }, 'image/jpeg', 0.9);
  }

  /* ======================= actions ======================= */
  function postId(t) { return t.closest('.post').getAttribute('data-id'); }
  function acctOf(t) { var id = t.closest('.acct-row').getAttribute('data-uid'); return S.adm.accounts.filter(function (a) { return a.id === id; })[0]; }
  function guard(p, okMsg) { return p.then(function () { if (okMsg) XK.toast(okMsg, 'ok'); render(); }, fail); }
  var ACTIONS = {
    nav: function (t) { endCrop(); st.view = t.getAttribute('data-view'); render(); window.scrollTo(0, 0); },
    react: function (t) {
      if (!user()) { XK.toast('Sign in to react to posts.'); return; }
      var pid = postId(t), em = t.getAttribute('data-emoji');
      st.refocus = '[data-id="' + pid + '"] [data-emoji="' + em + '"]';
      api.react(pid, em).catch(fail);
    },
    'toggle-replies': function (t) { var pid = postId(t); st.replyOpen[pid] = !st.replyOpen[pid]; st.refocus = '[data-id="' + pid + '"] [data-act="toggle-replies"]'; render(); },
    'send-reply': function (t) {
      var u = user(), pid = postId(t); if (!u || !u.vip) return;
      api.reply(pid, (st.drafts[pid] || '').trim()).then(function () { st.drafts[pid] = ''; XK.toast('Reply posted anonymously.', 'ok'); render(); }, fail);
    },
    'del-post': function (t) {
      var pid = postId(t);
      XK.confirm('Delete this post?', 'It disappears for everyone. This cannot be undone.', 'Delete post', true).then(function (v) { if (v) guard(api.delPost(pid), 'Post deleted.'); });
    },
    'del-reply': function (t) { guard(api.delReply(t.closest('.reply').getAttribute('data-rid'))); },
    notif: function (t) {
      var u = user(); if (!u) return;
      var on = t.checked;
      api.setNotify(on).then(function () {
        if (on) { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} }
        XK.toast(on ? 'Quiz notifications on.' : 'Quiz notifications off.');
      }, function (e) { t.checked = !on; fail(e); });
    },
    buy: function (t) {
      var u = user(); if (!u) { location.assign('login.html'); return; }
      var id = t.closest('.shop-card').getAttribute('data-item'), it = S.shop.filter(function (x) { return x.id === id; })[0]; if (!it) return;
      XK.confirm('Exchange for ' + it.name + '?', 'This costs ' + priceText(it) + '.', 'Exchange').then(function (v) {
        if (v) guard(api.buy(id), it.kind === 'discord_role' ? 'Done! Your Discord role will be given to you soon.' : 'Done!');
      });
    },
    'settings-tab': function (t) { endCrop(); st.settingsTab = t.getAttribute('data-tab'); render(); },
    'photo-save': saveCrop,
    'photo-cancel': function () { endCrop(); render(); },
    'photo-remove': function () { guard(api.removeAvatar(), 'Photo removed.'); },
    rename: function () {
      XK.dialog({ title: 'Change username', fields: [{ name: 'name', label: 'New username', value: user().username, required: true }], confirmLabel: 'Save',
        onSubmit: function (v) { return api.rename(v.name.trim()); } }).then(function (v) { if (v) { XK.toast('Username updated.', 'ok'); render(); } });
    },
    'link-discord': function () { api.linkDiscord().catch(fail); },
    unlink: function () {
      var dis = S.identities.filter(function (i) { return i.provider === 'discord'; })[0]; if (!dis) return;
      XK.confirm('Unlink Discord?', 'You can link it again later.', 'Unlink', true).then(function (v) { if (v) guard(api.unlink(dis)); });
    },
    'sign-out': function () { endCrop(); api.signOut().then(function () { st.view = null; render(); XK.toast('Signed out.'); }, fail); },
    'admin-tab': function (t) { st.adminTab = t.getAttribute('data-tab'); render(); },
    'quiz-close': function () { if (S.quiz) guard(api.closeQuiz(S.quiz.id)); },
    mark: function (t) { guard(api.mark(t.getAttribute('data-id'), t.getAttribute('data-result') === 'correct')); },
    md: function (t) { mdTool(t.getAttribute('data-tool')); },
    'report-status': function (t) { guard(api.reportStatus(t.closest('.report-row').getAttribute('data-id'), t.getAttribute('data-status'))); },
    'sess-approve': function (t) {
      var row = t.closest('[data-sid]'), h = parseInt($('select', row).value, 10);
      guard(api.decide(row.getAttribute('data-sid'), true, h), 'Approved.');
    },
    'sess-deny': function (t) { guard(api.decide(t.closest('[data-sid]').getAttribute('data-sid'), false, 24), 'Denied.'); },
    'sess-revoke': function (t) { guard(api.revoke(t.closest('[data-sid]').getAttribute('data-sid')), 'Session revoked.'); },
    'admin-password': function () {
      XK.dialog({ title: 'Change admin password', message: 'Admins will need the new password the next time they ask for a session. Use at least 12 characters.',
        fields: [{ name: 'pw', label: 'New password', type: 'password', required: true, autocomplete: 'new-password' }, { name: 'pw2', label: 'Repeat it', type: 'password', required: true, autocomplete: 'new-password' }],
        confirmLabel: 'Change password',
        onSubmit: function (v) { return XK.attempt(function () { if (v.pw !== v.pw2) throw new Error('The two passwords do not match.'); return api.setAdminPassword(v.pw); }); } })
        .then(function (v) { if (v) XK.toast('Admin password changed.', 'ok'); });
    },
    'acct-balance': function (t) {
      var u = acctOf(t); if (!u) return;
      XK.dialog({
        title: 'Change balance of ' + u.username,
        message: 'Use a negative number to take back. Balances cannot go below 0.',
        fields: [
          { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '20' },
          { name: 'currency', label: 'Currency', type: 'select', value: 'coins', options: [{ value: 'coins', label: 'Coins' }, { value: 'gold', label: 'Gold Coins' }] },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true, hint: 'Example: Quiz reward did not reach the inventory. Saved in the audit log.' }
        ],
        confirmLabel: 'Apply',
        onSubmit: function (v) {
          return XK.attempt(function () {
            var n = parseInt(v.amount, 10); if (isNaN(n) || n === 0) throw new Error('Enter a whole number other than 0.');
            return api.adjust(u.id, v.currency, n, v.reason.trim());
          });
        }
      }).then(function (v) { if (v) { XK.toast('Balance updated.', 'ok'); render(); } });
    },
    'acct-vip': function (t) {
      var u = acctOf(t); if (!u) return;
      if (u.is_vip) {
        XK.dialog({ title: 'Remove VIP Citizen from ' + u.username, danger: true, confirmLabel: 'Remove VIP',
          fields: [{ name: 'note', label: 'Reason', type: 'textarea', required: true }],
          onSubmit: function (v) { return api.setVip(u.id, false, null, null, v.note.trim()); } }).then(function (v) { if (v) { XK.toast('VIP removed.'); render(); } });
        return;
      }
      XK.dialog({ title: 'Give VIP Citizen to ' + u.username, message: 'VIP Citizen is permanent and needs a donation of at least 3 USD.',
        fields: [
          { name: 'usd', label: 'Donation (USD)', type: 'number', step: '0.01', required: true, placeholder: '3.00' },
          { name: 'method', label: 'How it arrived', required: true, placeholder: 'Manual / direct transfer' },
          { name: 'note', label: 'Note (optional)', type: 'textarea' }
        ], confirmLabel: 'Give VIP',
        onSubmit: function (v) {
          return XK.attempt(function () {
            var usd = parseFloat(v.usd); if (isNaN(usd) || usd < 3) throw new Error('VIP Citizen needs a donation of at least 3 USD.');
            return api.setVip(u.id, true, usd, v.method.trim(), v.note.trim());
          });
        } }).then(function (v) { if (v) { XK.toast('VIP Citizen granted.', 'ok'); render(); } });
    },
    'acct-rename': function (t) {
      var u = acctOf(t); if (!u) return;
      XK.dialog({ title: 'Rename ' + u.username, fields: [{ name: 'name', label: 'New username', value: u.username, required: true }], confirmLabel: 'Rename',
        onSubmit: function (v) { return api.renameUser(u.id, v.name.trim()); } }).then(function (v) { if (v) { XK.toast('Renamed.', 'ok'); render(); } });
    },
    'acct-delete': function (t) {
      var u = acctOf(t); if (!u) return;
      XK.dialog({
        title: 'Delete account', danger: true, confirmLabel: 'Delete account',
        message: 'This permanently removes the account, its Coins and its inventory. Type the username to confirm.',
        fields: [{ name: 'confirm', label: 'Type "' + u.username + '"', required: true }],
        onSubmit: function (v) {
          return XK.attempt(function () {
            if (v.confirm.trim() !== u.username) throw new Error('The username does not match.');
            return api.deleteUser(u.id);
          });
        }
      }).then(function (v) { if (v) { XK.toast('Account deleted.'); render(); } });
    },
    'acct-transfer': function (t) {
      var u = acctOf(t); if (!u) return;
      XK.dialog({ title: 'Make ' + u.username + ' the Leader', danger: true, confirmLabel: 'Transfer leadership',
        message: 'You become a normal admin and lose Leader powers immediately. Type the username to confirm.',
        fields: [{ name: 'confirm', label: 'Type "' + u.username + '"', required: true }],
        onSubmit: function (v) { return XK.attempt(function () { if (v.confirm.trim() !== u.username) throw new Error('The username does not match.'); return api.transfer(u.id); }); } })
        .then(function (v) { if (v) { XK.toast('Leadership transferred.', 'ok'); render(); } });
    }
  };
  ACTIONS['acct-staff'] = function (t) {
    var u = acctOf(t); if (!u) return;
    var make = u.staff_role !== 'admin';
    XK.confirm((make ? 'Make ' : 'Remove admin from ') + u.username + (make ? ' an admin?' : '?'), make ? 'They still need the admin password and your approval each time.' : 'Their admin sessions end right away.', make ? 'Make admin' : 'Remove admin', !make)
      .then(function (v) { if (v) guard(api.setStaff(u.id, make ? 'admin' : null), make ? 'Admin added.' : 'Admin removed.'); });
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
    if (t.name === 'rkind') { st.reportForm.kind = t.value; }
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
    else if (id === 'rtitle') st.reportForm.title = t.value;
    else if (id === 'rdetails') st.reportForm.details = t.value;
    else if (id === 'rlink') st.reportForm.link = t.value;
    else if (id === 'acctSearch') { st.acctFilter = t.value; $('#acctList').innerHTML = acctRows(); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-form'); if (!f) return;
    e.preventDefault();
    var btn = e.target.querySelector('[type="submit"]');
    function run(p, ok, after) { if (btn) btn.disabled = true; p.then(function () { XK.toast(ok, 'ok'); after(); render(); }, function (er) { if (btn) btn.disabled = false; fail(er); }); }
    try {
      if (f === 'answer') {
        if (!user() || !S.quiz) return;
        if (btn) btn.disabled = true;
        api.answer(S.quiz.id, st.answer.trim()).then(function (r) {
          st.answer = '';
          XK.toast(r.result === 'correct' ? 'You took ' + ord(r.place) + ' place! +' + r.reward + ' Coins' : r.result === 'wrong' ? 'Not quite. Try again!' : 'Answer sent. An operator will check it.', r.result === 'wrong' ? 'error' : 'ok');
          render();
        }, function (er) { if (btn) btn.disabled = false; fail(er); });
      } else if (f === 'quiz') {
        run(api.postQuiz(st.quizForm.q.trim(), st.quizForm.key.trim()), 'Quiz queued. It goes live in 20 seconds.', function () { st.quizForm = { q: '', key: '' }; });
      } else if (f === 'post') {
        var p = st.postForm, title = p.title.trim(), body = p.body.trim(), link = p.link.trim();
        if (!title) throw new Error('Add a title.');
        if (!body) throw new Error('Write the message.');
        if (p.type === 'event' && link && !/^https?:\/\/\S+$/i.test(link)) throw new Error('The event link must start with http:// or https://');
        run(api.addPost({ type: p.type, title: title, body: body, link: p.type === 'event' ? link : '', when: p.type === 'event' ? p.when.trim() : '' }), 'Posted.', function () { st.postForm = { type: p.type, title: '', body: '', link: '', when: '' }; });
      } else if (f === 'report') {
        var r = st.reportForm, rl = r.link.trim();
        if (!r.title.trim()) throw new Error('Add a title.');
        if (!r.details.trim()) throw new Error('Add some details.');
        if (rl && !/^https?:\/\/\S+$/i.test(rl)) throw new Error('The link must start with http:// or https://');
        run(api.sendReport({ kind: r.kind, title: r.title.trim(), details: r.details.trim(), link: rl }), 'Sent. Thank you!', function () { st.reportForm = { kind: r.kind, title: '', details: '', link: '' }; });
      }
    } catch (er) { fail(er); }
  });

  /* ======================= live quiz ticker ======================= */
  function quizKey() {
    var q = S.quiz, u = user();
    if (!q) return 'none';
    return q.id + ':' + XK.quizPhase(q) + ':' + (q.mine ? q.mine.result + q.mine.id : '-') + ':' + q.answers.length + ':' + (q.winners ? q.winners.length : 0) + ':' + (q.question ? 1 : 0) + ':' + q.status;
  }
  function tick() {
    var q = S.quiz, ph = XK.quizPhase(q), u = user();
    if (ph === 'scheduled' && q.id !== st.notified) {
      st.notified = q.id;
      if (u && u.notifyQuiz) {
        XK.toast('Trivia Quiz will start in 20 Seconds!');
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification('XKing Trivia Quiz', { body: 'Trivia Quiz will start in 20 Seconds!' }); } catch (e) {}
      }
    }
    if (ph === 'starting' && Date.now() - XK.qFetchedAt() > 1500) XK.loadQuestion().catch(function () {});
    var rem = ph === 'scheduled' ? remaining(q) : 0;
    $$('[data-countdown]').forEach(function (el) { el.textContent = rem; });
    var k = quizKey();
    if (k !== st.phaseKey) { st.phaseKey = k; if (st.view === 'games' || st.view === 'admin') scheduleRender(); }
  }

  XK.on('data', function () { if (S.quiz && st.notified === '' && XK.quizPhase(S.quiz) !== 'scheduled') st.notified = S.quiz.id; scheduleRender(); });
  XK.on('admin', function () { render(); });

  XK.boot();
  render();
  XK.init().then(function () {
    st.phaseKey = quizKey();
    if (S.quiz && XK.quizPhase(S.quiz) === 'scheduled') st.notified = S.quiz.id;
    render();
  });
  setInterval(tick, 1000);
})();
