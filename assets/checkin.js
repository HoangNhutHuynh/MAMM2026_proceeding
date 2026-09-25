/* MAMM 2026 — staff meal / banquet check-in.
   Talks to a Google Apps Script web app; keeps working when the Wi-Fi does not. */
(function () {
'use strict';

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
};
var norm = function (s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
};
var now = function () { return new Date(); };
var hhmm = function (d) {
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
};

var LS = {
  get: function (k, d) { try { var v = localStorage.getItem('mamm.checkin.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('mamm.checkin.' + k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem('mamm.checkin.' + k); } catch (e) {} }
};

var DEFAULT_MEALS = [
  { id: 'lunch_d1', label: 'Lunch — Day 1 (5 Nov)', short: 'Lunch D1', when: '5 Nov' },
  { id: 'lunch_d2', label: 'Lunch — Day 2 (6 Nov)', short: 'Lunch D2', when: '6 Nov' },
  { id: 'banquet', label: 'Banquet (5 Nov, 18:00)', short: 'Banquet', when: '5 Nov 18:00' }
];

var CFG = LS.get('cfg', { url: '', pin: '', station: '', staff: '' });
var MEALS = LS.get('meals', DEFAULT_MEALS);
var ROSTER = LS.get('roster', { delegates: [], ts: 0 });
var LOCAL = LS.get('local', {});      // mealId -> { delegateId: stamp } recorded on this device
var QUEUE = LS.get('queue', []);
var HIST = LS.get('hist', []);
var meal = LS.get('meal', MEALS[0].id);
var online = navigator.onLine;
var view = CFG.url ? 'scan' : 'setup';

/* ------------------------------------------------------------------ server */
function call(payload, timeoutMs) {
  var body = JSON.stringify(Object.assign({ pin: CFG.pin }, payload));
  var ctrl = ('AbortController' in window) ? new AbortController() : null;
  var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 12000);
  // text/plain keeps this a "simple request": Apps Script cannot answer a CORS preflight.
  return fetch(CFG.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: body,
    redirect: 'follow',
    signal: ctrl ? ctrl.signal : undefined
  }).then(function (r) {
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (j) {
    setOnline(true);
    if (j && j.ok === false && j.error === 'bad_pin') throw new Error('bad_pin');
    return j;
  }).catch(function (e) {
    clearTimeout(t);
    if (String(e.message) !== 'bad_pin') setOnline(false);
    throw e;
  });
}

function setOnline(v) {
  if (online === v) return;
  online = v;
  paintNet();
  if (v) flushQueue();
}
function paintNet() {
  var el = $('#net');
  var q = QUEUE.length;
  el.className = 'pill ' + (online ? 'on' : 'off');
  el.textContent = online ? (q ? q + ' queued' : 'online') : (q ? 'offline · ' + q : 'offline');
}

/* -------------------------------------------------------------- local state */
function takenLocal(mealId, id) {
  return (LOCAL[mealId] || {})[id] || '';
}
function markLocal(mealId, id, stamp) {
  LOCAL[mealId] = LOCAL[mealId] || {};
  if (stamp) LOCAL[mealId][id] = stamp; else delete LOCAL[mealId][id];
  LS.set('local', LOCAL);
}
function takenAny(mealId, d) {
  return takenLocal(mealId, d.id) || (d.taken && d.taken[mealId]) || '';
}
function findByKey(key) {
  var k = String(key || '').trim().toUpperCase();
  if (!k) return null;
  for (var i = 0; i < ROSTER.delegates.length; i++) {
    var d = ROSTER.delegates[i];
    if (String(d.token || '').toUpperCase() === k || String(d.id || '').toUpperCase() === k) return d;
  }
  return null;
}
function mealById(id) {
  for (var i = 0; i < MEALS.length; i++) if (MEALS[i].id === id) return MEALS[i];
  return MEALS[0];
}
function pushHist(entry) {
  HIST.unshift(entry);
  HIST = HIST.slice(0, 200);
  LS.set('hist', HIST);
}

/* ------------------------------------------------------------------- queue */
function enqueue(op) {
  QUEUE.push(op);
  LS.set('queue', QUEUE);
  paintNet();
}
function flushQueue() {
  if (!QUEUE.length || !CFG.url) return Promise.resolve();
  var op = QUEUE[0];
  return call(op, 15000).then(function () {
    QUEUE.shift();
    LS.set('queue', QUEUE);
    paintNet();
    if (QUEUE.length) return flushQueue();
  }).catch(function () { /* stay queued, try again later */ });
}

/* -------------------------------------------------------------------- sync */
function syncRoster(loud) {
  if (!CFG.url) return Promise.resolve();
  return call({ action: 'roster' }, 20000).then(function (j) {
    if (!j || !j.ok) throw new Error(j && j.error || 'roster failed');
    ROSTER = { delegates: j.delegates || [], ts: Date.now() };
    LS.set('roster', ROSTER);
    if (j.meals && j.meals.length) {
      MEALS = j.meals.map(function (m, i) {
        return Object.assign({}, DEFAULT_MEALS[i] || {}, m);
      });
      LS.set('meals', MEALS);
    }
    // the sheet is authoritative: forget local marks it already knows about
    ROSTER.delegates.forEach(function (d) {
      MEALS.forEach(function (m) {
        if (d.taken && d.taken[m.id] && takenLocal(m.id, d.id)) markLocal(m.id, d.id, '');
      });
    });
    paintMeals(); render();
    if (loud) msg('#cfg-msg', 'Loaded ' + ROSTER.delegates.length + ' delegates.');
  }).catch(function (e) {
    if (loud) msg('#cfg-msg', 'Could not reach the sheet: ' + e.message, true);
  });
}

/* ------------------------------------------------------------------ verdict */
var AUDIO = null;
function beep(kind) {
  try {
    AUDIO = AUDIO || new (window.AudioContext || window.webkitAudioContext)();
    var seq = kind === 'ok' ? [[880, 0, .09]] : kind === 'bad' ? [[220, 0, .16], [180, .18, .22]] : [[560, 0, .13]];
    seq.forEach(function (s) {
      var o = AUDIO.createOscillator(), g = AUDIO.createGain();
      o.frequency.value = s[0]; o.type = 'sine';
      g.gain.setValueAtTime(.001, AUDIO.currentTime + s[1]);
      g.gain.exponentialRampToValueAtTime(.25, AUDIO.currentTime + s[1] + .01);
      g.gain.exponentialRampToValueAtTime(.001, AUDIO.currentTime + s[1] + s[2]);
      o.connect(g); g.connect(AUDIO.destination);
      o.start(AUDIO.currentTime + s[1]); o.stop(AUDIO.currentTime + s[1] + s[2] + .02);
    });
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 40 : [60, 60, 60]); } catch (e) {}
}

var undoTimer = null, closeTimer = null;
function hideResult() {
  clearTimeout(closeTimer); clearInterval(undoTimer);
  $('#result').hidden = true;
  if (camOn) scanning = true;
}
function showResult(o) {
  clearTimeout(closeTimer); clearInterval(undoTimer);
  var r = $('#result');
  r.className = 'result ' + o.tone;
  r.hidden = false;
  $('#r-icon').textContent = o.icon;
  $('#r-verdict').textContent = o.verdict;
  $('#r-name').textContent = o.name;
  $('#r-sub').innerHTML = o.sub || '';
  $('#r-chips').innerHTML = (o.chips || []).map(function (c) {
    return '<span class="chip ' + (c.cls || '') + '">' + esc(c.text) + '</span>';
  }).join('');

  var acts = $('#r-actions');
  acts.innerHTML = '';
  (o.actions || []).forEach(function (a) {
    var b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.addEventListener('click', a.fn);
    acts.appendChild(b);
  });
  var close = document.createElement('button');
  close.className = 'btn primary';
  close.textContent = 'Next';
  close.addEventListener('click', hideResult);
  acts.appendChild(close);

  beep(o.tone === 'ok' ? 'ok' : o.tone === 'bad' ? 'bad' : 'warn');
  if (o.autoClose) closeTimer = setTimeout(hideResult, o.autoClose);
}

/* ------------------------------------------------------------- the decision */
function submit(key, opts) {
  opts = opts || {};
  var m = mealById(meal);
  var d = findByKey(key);

  if (!d && !opts.force) {
    showResult({
      tone: 'info', icon: '?', verdict: 'Badge not recognised',
      name: String(key).toUpperCase(),
      sub: 'This code is not in the list. Use <b>Search</b> to find the person by name, or add them as a walk-in.',
      actions: [{ label: 'Search by name', fn: function () { hideResult(); go('search'); } }]
    });
    pushHist({ t: Date.now(), name: String(key), meal: m.id, v: 'unknown' });
    return;
  }

  var prev = takenAny(meal, d);
  if (prev && !opts.override) {
    showResult({
      tone: 'bad', icon: '✕', verdict: 'Already collected',
      name: d.name,
      sub: 'This ' + esc(m.short || m.label) + ' was already handed out at <b>' + esc(prev) + '</b>.',
      chips: chipsFor(d),
      actions: [{
        label: 'Give anyway', cls: 'danger', fn: function () {
          hideResult(); doIssue(d, { override: true, reason: 'duplicate allowed by staff' });
        }
      }]
    });
    pushHist({ t: Date.now(), name: d.name, meal: m.id, v: 'duplicate' });
    return;
  }

  if (!d.ent[meal] && !opts.override) {
    showResult({
      tone: 'warn', icon: '!', verdict: 'Not included',
      name: d.name,
      sub: esc(d.affiliation || '') + '<br>This delegate is <b>not registered</b> for ' + esc(m.short || m.label) + '.',
      chips: chipsFor(d),
      actions: [{
        label: 'Allow — paid now', fn: function () { hideResult(); doIssue(d, { override: true, reason: 'paid at the door' }); }
      }, {
        label: 'Allow — organiser', fn: function () { hideResult(); doIssue(d, { override: true, reason: 'approved by organiser' }); }
      }]
    });
    pushHist({ t: Date.now(), name: d.name, meal: m.id, v: 'not_entitled' });
    return;
  }

  doIssue(d, opts);
}

function chipsFor(d) {
  var c = [];
  if (d.diet) c.push({ text: '⚠ ' + d.diet, cls: 'diet' });
  MEALS.forEach(function (m) {
    if (d.ent && d.ent[m.id]) c.push({ text: (m.short || m.label) + (takenAny(m.id, d) ? ' ✓' : '') });
  });
  return c;
}

function doIssue(d, opts) {
  var m = mealById(meal);
  var stamp = hhmm(now()) + ' · ' + (CFG.station || 'station');
  markLocal(meal, d.id, stamp);
  pushHist({ t: Date.now(), name: d.name, meal: meal, v: opts.override ? 'override' : 'issued' });

  var op = {
    action: 'checkin', key: d.token || d.id, meal: meal,
    station: CFG.station, staff: CFG.staff,
    override: !!opts.override, reason: opts.reason || '', clientTs: new Date().toISOString()
  };

  var sub = esc(d.affiliation || '');
  if (opts.override) sub += '<br><b>Override:</b> ' + esc(opts.reason || '');

  showResult({
    tone: 'ok', icon: '✓',
    verdict: (opts.override ? 'Given — override' : 'Give ' + (m.short || m.label)),
    name: d.name, sub: sub, chips: chipsFor(d),
    autoClose: 4000,
    actions: [{
      label: 'Undo', fn: function () {
        markLocal(meal, d.id, '');
        enqueue({ action: 'undo', key: d.token || d.id, meal: meal, station: CFG.station, staff: CFG.staff });
        flushQueue();
        pushHist({ t: Date.now(), name: d.name, meal: meal, v: 'undo' });
        hideResult(); render();
      }
    }]
  });

  call(op, 12000).then(function (j) {
    if (j && j.status === 'duplicate') {
      // the sheet knew better: another station got there first
      markLocal(meal, d.id, '');
      render();
      showResult({
        tone: 'bad', icon: '✕', verdict: 'Already collected elsewhere',
        name: d.name,
        sub: 'Another station recorded this at <b>' + esc(j.previous || '') + '</b>. Take the meal back if it has not been handed over.',
        chips: chipsFor(d)
      });
    }
  }).catch(function () {
    enqueue(op);
  });
  render();
}

/* ----------------------------------------------------------------- camera */
var stream = null, camOn = false, scanning = false, lastCode = '', lastAt = 0;
function startCam() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('#scan-hint').innerHTML = 'This browser cannot open the camera. Type the badge code below, or use <b>Search</b>.';
    return;
  }
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  }).then(function (s) {
    stream = s;
    var v = $('#cam');
    v.srcObject = s;
    v.play();
    camOn = true; scanning = true;
    $('#cam-start').hidden = true; $('#cam-stop').hidden = false;
    $('#scan-hint').hidden = true;
    requestAnimationFrame(tick);
  }).catch(function (e) {
    $('#scan-hint').hidden = false;
    $('#scan-hint').innerHTML = 'Camera blocked (' + esc(e.name || 'error') +
      ').<br>Allow camera access for this site, or type the badge code below.';
  });
}
function stopCam() {
  camOn = false; scanning = false;
  if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
  stream = null;
  $('#cam-start').hidden = false; $('#cam-stop').hidden = true;
  $('#scan-hint').hidden = false;
  $('#scan-hint').innerHTML = 'Press <b>Start camera</b> and point at the QR code on the badge';
}
function tick() {
  if (!camOn) return;
  var v = $('#cam'), c = $('#frame');
  if (scanning && v.readyState === v.HAVE_ENOUGH_DATA && window.jsQR) {
    var w = 480, h = Math.round(w * v.videoHeight / (v.videoWidth || 1)) || 360;
    c.width = w; c.height = h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, w, h);
    var img = ctx.getImageData(0, 0, w, h);
    var code = null;
    try { code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' }); } catch (e) {}
    if (code && code.data) {
      var txt = String(code.data).trim();
      var t = Date.now();
      if (txt !== lastCode || t - lastAt > 3000) {
        lastCode = txt; lastAt = t;
        scanning = false;
        submit(txt.replace(/^.*[#\/]/, ''));
      }
    }
  }
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ render */
function paintMeals() {
  $('#meals').innerHTML = MEALS.map(function (m) {
    return '<button class="meal" role="tab" data-meal="' + esc(m.id) + '" aria-selected="' + (m.id === meal) + '">' +
      esc(m.short || m.label) + '<small>' + esc(m.when || '') + '</small></button>';
  }).join('');
}

function renderSearch() {
  var q = norm($('#q').value);
  var list = ROSTER.delegates;
  if (q) {
    var ts = q.split(/\s+/).filter(Boolean);
    list = list.filter(function (d) {
      var hay = norm(d.name + ' ' + (d.affiliation || '') + ' ' + (d.id || '') + ' ' + (d.token || ''));
      return ts.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }
  $('#search-count').textContent = list.length + ' of ' + ROSTER.delegates.length + ' delegates';
  $('#people').innerHTML = list.slice(0, 80).map(function (d) {
    var taken = takenAny(meal, d);
    var cls = taken ? 's-done' : (d.ent[meal] ? 's-todo' : 's-no');
    var txt = taken ? '✓ ' + taken : (d.ent[meal] ? 'not yet' : 'not included');
    return '<li><button data-key="' + esc(d.token || d.id) + '">' +
      '<span class="p-main"><span class="p-name">' + esc(d.name) + '</span>' +
      '<span class="p-aff">' + esc(d.affiliation || '') + '</span></span>' +
      '<span class="p-state ' + cls + '">' + esc(txt) + '</span></button></li>';
  }).join('');
}

function renderBoard() {
  var b = $('#board');
  b.innerHTML = MEALS.map(function (m) {
    var entitled = 0, issued = 0;
    ROSTER.delegates.forEach(function (d) {
      if (d.ent && d.ent[m.id]) entitled++;
      if (takenAny(m.id, d)) issued++;
    });
    var pct = entitled ? Math.round(issued * 100 / entitled) : 0;
    return '<div class="stat"><div class="stat-top"><span class="stat-label">' + esc(m.label) + '</span>' +
      '<span class="stat-num">' + issued + '<small> / ' + entitled + '</small></span></div>' +
      '<div class="meter"><i style="width:' + Math.min(pct, 100) + '%"></i></div>' +
      '<div class="stat-sub">' + (entitled - issued) + ' still to collect · ' + pct + '% served</div></div>';
  }).join('');

  $('#feed').innerHTML = HIST.slice(0, 40).map(function (h) {
    var cls = h.v === 'issued' ? 'ok' : h.v === 'override' ? 'warn' : h.v === 'undo' ? 'warn' : 'bad';
    var lbl = { issued: 'OK', override: 'OVR', duplicate: 'DUP', not_entitled: 'N/A', unknown: '??', undo: 'UNDO' }[h.v] || h.v;
    return '<li><time>' + hhmm(new Date(h.t)) + '</time><span class="v ' + cls + '">' + lbl + '</span>' +
      '<span class="n">' + esc(h.name) + '</span><span class="muted">' +
      esc((mealById(h.meal).short) || '') + '</span></li>';
  }).join('') || '<li class="muted">Nothing yet on this device.</li>';
}

function render() {
  $$('.view').forEach(function (v) { v.hidden = true; });
  $('#view-' + view).hidden = false;
  $$('#tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === view); });
  $('#station-pill').textContent = CFG.station || 'no station';
  paintNet();
  if (view === 'search') renderSearch();
  if (view === 'board') renderBoard();
  if (view === 'setup') {
    $('#cfg-url').value = CFG.url; $('#cfg-pin').value = CFG.pin;
    $('#cfg-station').value = CFG.station; $('#cfg-staff').value = CFG.staff;
    $('#cache-info').textContent =
      ROSTER.delegates.length + ' delegates cached' +
      (ROSTER.ts ? ' (' + new Date(ROSTER.ts).toLocaleString() + ')' : '') +
      ' · ' + QUEUE.length + ' check-in(s) waiting to be sent';
  }
  if (view !== 'scan' && camOn) stopCam();
}
function go(v) { view = v; render(); }
function msg(sel, text, bad) {
  var el = $(sel);
  el.textContent = text;
  el.style.color = bad ? '#ff9a92' : '';
}

/* -------------------------------------------------------------------- CSV */
function exportCSV() {
  var head = ['id', 'name', 'affiliation', 'diet'];
  MEALS.forEach(function (m) { head.push(m.id + '_entitled', m.id + '_collected'); });
  var rows = [head];
  ROSTER.delegates.forEach(function (d) {
    var r = [d.id, d.name, d.affiliation || '', d.diet || ''];
    MEALS.forEach(function (m) {
      r.push(d.ent && d.ent[m.id] ? 'Y' : 'N');
      r.push(takenAny(m.id, d));
    });
    rows.push(r);
  });
  var csv = '﻿' + rows.map(function (r) {
    return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'mamm2026-meals-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ------------------------------------------------------------------- wiring */
var TABS = [
  { k: 'scan', label: 'Scan', icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4"/>' },
  { k: 'search', label: 'Search', icon: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>' },
  { k: 'board', label: 'Board', icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
  { k: 'setup', label: 'Setup', icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>' }
];
$('#tabs').innerHTML = TABS.map(function (t) {
  return '<button data-tab="' + t.k + '" aria-selected="false">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    t.icon + '</svg>' + t.label + '</button>';
}).join('');
$('#tabs').addEventListener('click', function (e) {
  var b = e.target.closest('[data-tab]');
  if (b) go(b.dataset.tab);
});

$('#meals').addEventListener('click', function (e) {
  var b = e.target.closest('[data-meal]');
  if (!b) return;
  meal = b.dataset.meal; LS.set('meal', meal);
  paintMeals(); render();
});

$('#cam-start').addEventListener('click', startCam);
$('#cam-stop').addEventListener('click', stopCam);
$('#manual-go').addEventListener('click', function () {
  var v = $('#manual-code').value.trim();
  if (v) { submit(v); $('#manual-code').value = ''; }
});
$('#manual-code').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') $('#manual-go').click();
});

$('#q').addEventListener('input', renderSearch);
$('#people').addEventListener('click', function (e) {
  var b = e.target.closest('[data-key]');
  if (b) submit(b.dataset.key);
});

$('#refresh').addEventListener('click', function () { syncRoster(false).then(render); });
$('#export').addEventListener('click', exportCSV);
$('#flush').addEventListener('click', function () { flushQueue().then(render); });
$('#wipe').addEventListener('click', function () {
  if (!confirm('Clear the cached list, the local marks and anything still queued on this device?')) return;
  ['roster', 'local', 'queue', 'hist'].forEach(LS.del);
  ROSTER = { delegates: [], ts: 0 }; LOCAL = {}; QUEUE = []; HIST = [];
  render();
});

$('#cfg-save').addEventListener('click', function () {
  CFG = {
    url: $('#cfg-url').value.trim(), pin: $('#cfg-pin').value.trim(),
    station: $('#cfg-station').value.trim(), staff: $('#cfg-staff').value.trim()
  };
  LS.set('cfg', CFG);
  msg('#cfg-msg', 'Saved. Loading the delegate list…');
  syncRoster(true).then(function () { if (ROSTER.delegates.length) go('scan'); });
});
$('#cfg-test').addEventListener('click', function () {
  CFG.url = $('#cfg-url').value.trim(); CFG.pin = $('#cfg-pin').value.trim();
  call({ action: 'stats' }, 15000).then(function (j) {
    if (j.ok) {
      msg('#cfg-msg', 'Connected. ' + j.meals.map(function (m) {
        return m.label + ': ' + m.issued + '/' + m.entitled;
      }).join('  ·  '));
    } else {
      msg('#cfg-msg', j.error === 'bad_pin' ? 'Wrong PIN.' : ('Server said: ' + j.error), true);
    }
  }).catch(function (e) {
    msg('#cfg-msg', e.message === 'bad_pin' ? 'Wrong PIN.' :
      'Could not reach the web app. Check the URL, and that the deployment is set to "Anyone".', true);
  });
});

/* walk-in */
var wMeals = [];
$('#add-walkin').addEventListener('click', function () {
  wMeals = [meal];
  $('#w-name').value = ''; $('#w-aff').value = ''; $('#w-diet').value = '';
  $('#w-meals').innerHTML = MEALS.map(function (m) {
    return '<button class="chip" data-wm="' + esc(m.id) + '" aria-pressed="' + (m.id === meal) + '">' +
      esc(m.short || m.label) + '</button>';
  }).join('');
  $('#walkin').hidden = false;
});
$('#w-meals').addEventListener('click', function (e) {
  var b = e.target.closest('[data-wm]');
  if (!b) return;
  var on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', on);
  wMeals = on ? wMeals.concat([b.dataset.wm]) : wMeals.filter(function (x) { return x !== b.dataset.wm; });
});
$('#w-cancel').addEventListener('click', function () { $('#walkin').hidden = true; });
$('#w-save').addEventListener('click', function () {
  var name = $('#w-name').value.trim();
  if (!name) { $('#w-name').focus(); return; }
  var payload = {
    action: 'walkin', name: name, affiliation: $('#w-aff').value.trim(),
    diet: $('#w-diet').value.trim(), meals: wMeals, station: CFG.station, staff: CFG.staff
  };
  $('#walkin').hidden = true;
  call(payload, 15000).then(function (j) {
    if (j && j.ok && j.delegate) {
      ROSTER.delegates.push(Object.assign({ taken: {} }, j.delegate));
      LS.set('roster', ROSTER);
      submit(j.delegate.token || j.delegate.id, { force: true });
    }
  }).catch(function () {
    alert('Offline — a walk-in has to be added while the sheet is reachable.');
  });
});

$('#result').addEventListener('click', function (e) { if (e.target === $('#result')) hideResult(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideResult(); });
window.addEventListener('online', function () { setOnline(true); });
window.addEventListener('offline', function () { setOnline(false); });

paintMeals();
render();
if (CFG.url) { syncRoster(false); flushQueue(); }
setInterval(function () { if (CFG.url && view !== 'scan') syncRoster(false); }, 90000);
setInterval(function () { if (QUEUE.length) flushQueue(); }, 20000);

})();
