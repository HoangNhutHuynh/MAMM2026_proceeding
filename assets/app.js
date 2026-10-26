/* MAMM 2026 — technical programme browser
   Plain ES2018, no build step. All programme content lives in program.json,
   which tools/build_program.py generates from the Word proceedings file. */
(function () {
'use strict';

/* ------------------------------------------------------------------ utils */
var $ = function (s, r) { return (r || document).querySelector(s); };
var esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
};
var norm = function (s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
};
var STORE = {
  get: function (k, d) { try { var v = localStorage.getItem('mamm2026.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('mamm2026.' + k, JSON.stringify(v)); } catch (e) {} }
};

/* inline SVG icons (no emoji as icons) */
var ICON = {
  star: function (filled) {
    return '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="' + (filled ? 'currentColor' : 'none') +
      '" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/></svg>';
  },
  cal: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  clock: '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pin: '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  user: '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  qr: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h3M20 18v3"/></svg>',
  print: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/></svg>',
  left: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'
};

/* ------------------------------------------------------------------ state */
var DATA = null;
var IDX = {};            // paper id -> paper
var SESS = {};           // session id -> session
var SEARCH = [];         // [{p, hay, ...}]
var saved = STORE.get('saved', []);
var route = { view: 'schedule', params: {} };
var lastFocus = null;

var DAY_NAMES = { 1: 'Thursday', 2: 'Friday', 3: 'Saturday' };
var DAY_SHORT = { 1: '5 Nov', 2: '6 Nov', 3: '7 Nov' };

function roomClass(r) {
  if (/^Room 1$/.test(r)) return 'r1';
  if (/^Room 2$/.test(r)) return 'r2';
  if (/^Room 3$/.test(r)) return 'r3';
  return '';
}
var isBreak = function (t) {
  return /(Tea Break|Lunch|Banquet|Registration|Group Photo|Opening Ceremony|Closing Remarks|shuttle bus|Cruise)/i.test(t);
};
var isTalk = function (t) { return /(Keynote|Invited) Speech/i.test(t); };

/* ------------------------------------------------------------- hash router */
function parseHash() {
  var h = location.hash.replace(/^#\/?/, '');
  var qs = '';
  var qi = h.indexOf('?');
  if (qi >= 0) { qs = h.slice(qi + 1); h = h.slice(0, qi); }
  var parts = h.split('/').filter(Boolean);
  var params = {};
  qs.split('&').forEach(function (kv) {
    if (!kv) return;
    var i = kv.indexOf('=');
    var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
    params[k] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
  });
  return { view: parts[0] || 'schedule', id: parts[1] || '', params: params };
}
function buildHash(view, params, id) {
  var qs = Object.keys(params || {})
    .filter(function (k) { return params[k] !== '' && params[k] != null; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  return '#/' + view + (id ? '/' + id : '') + (qs ? '?' + qs : '');
}
function go(view, params, id) { location.hash = buildHash(view, params, id); }

/* -------------------------------------------------------------- .ics export */
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function icsStamp(dateStr, hhmm) {
  // dateStr 'YYYY-MM-DD', hhmm 'HH:MM' in Asia/Taipei (UTC+8) -> UTC basic format
  var p = dateStr.split('-'), t = hhmm.split(':');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], +t[0] - 8, +t[1], 0));
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
         pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
}
function firstRange(timeStr) {
  var m = String(timeStr || '').match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  return m ? [m[1], m[2]] : null;
}
function icsFold(line) {
  var out = [], s = line;
  while (s.length > 72) { out.push(s.slice(0, 72)); s = ' ' + s.slice(72); }
  out.push(s); return out.join('\r\n');
}
function icsEscape(s) { return String(s || '').replace(/[\\;,]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); }
function downloadICS(events, filename) {
  var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MAMM 2026//Technical Programme//EN', 'CALSCALE:GREGORIAN'];
  events.forEach(function (e) {
    var r = firstRange(e.time);
    if (!r || !e.date) return;
    L.push('BEGIN:VEVENT');
    L.push('UID:' + e.uid + '@mamm2026');
    L.push('DTSTAMP:' + icsStamp('2026-01-01', '00:00'));
    L.push('DTSTART:' + icsStamp(e.date, r[0]));
    L.push('DTEND:' + icsStamp(e.date, r[1]));
    L.push(icsFold('SUMMARY:' + icsEscape(e.title)));
    L.push(icsFold('LOCATION:' + icsEscape((e.room ? e.room + ', ' : '') + "Sun Moon Lake Teachers' Hostel, Nantou, Taiwan")));
    if (e.desc) L.push(icsFold('DESCRIPTION:' + icsEscape(e.desc)));
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  var blob = new Blob([L.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ------------------------------------------------------------------ search */
function buildIndex() {
  SEARCH = DATA.papers.map(function (p) {
    var authn = p.authors.map(function (a) { return norm(a.name); });
    var e = {
      p: p,
      idn: norm(p.id),
      pad: ('0' + p.num).slice(-2),
      num: String(p.num),
      titlen: norm(p.title),
      authn: authn,
      kwn: norm(p.keywords.join(' · ')),
      affn: norm(p.affiliations.join(' · ')),
      sessn: norm([p.sessionName, p.sessionId, p.type, p.chairs || ''].join(' · ')),
      metan: norm([p.room, p.time, 'day ' + p.day].join(' · ')),
      absn: norm(p.abstract)
    };
    e.hay = [e.idn, 'id ' + e.pad, e.pad, e.num, e.titlen, authn.join(' · '),
             e.affn, e.kwn, e.absn, e.sessn, e.metan].join(' · ');
    return e;
  });
}
function terms(q) { return norm(q).split(/\s+/).filter(Boolean); }

// Field weights: an exact paper ID beats everything, then title, author,
// keyword, session, affiliation and finally a mention in the abstract.
function scoreTerm(e, t) {
  var sc = 0, i;
  if (t === e.idn || t === 'id' + e.pad || t === e.pad || t === e.num) sc += 1000;
  else if (e.idn.indexOf(t) >= 0) sc += 120;
  if (e.titlen.indexOf(t) >= 0) {
    sc += 60;
    if (e.titlen.indexOf(t) === 0 || e.titlen.indexOf(' ' + t) >= 0) sc += 25;
  }
  for (i = 0; i < e.authn.length; i++) {
    if (e.authn[i].indexOf(t) >= 0) { sc += 55; if (i === 0) sc += 10; break; }
  }
  if (e.kwn.indexOf(t) >= 0) sc += 35;
  if (e.sessn.indexOf(t) >= 0) sc += 20;
  if (e.metan.indexOf(t) >= 0) sc += 15;
  if (e.affn.indexOf(t) >= 0) sc += 10;
  if (e.absn.indexOf(t) >= 0) sc += 5;
  return sc;
}
function runSearch(q) {
  var ts = terms(q);
  if (!ts.length) return DATA.papers.slice();
  var hits = [];
  SEARCH.forEach(function (e) {
    var total = 0, ok = true;
    for (var i = 0; i < ts.length; i++) {
      if (e.hay.indexOf(ts[i]) < 0) { ok = false; break; }
      total += scoreTerm(e, ts[i]);
    }
    if (ok) hits.push({ p: e.p, score: total });
  });
  hits.sort(function (a, b) { return (b.score - a.score) || (a.p.num - b.p.num); });
  return hits.map(function (h) { return h.p; });
}
function highlight(text, q) {
  var ts = norm(q).split(/\s+/).filter(function (t) { return t.length > 1; });
  if (!ts.length) return esc(text);
  var src = String(text), low = norm(src), hits = [];
  ts.forEach(function (t) {
    var i = 0;
    while ((i = low.indexOf(t, i)) >= 0) { hits.push([i, i + t.length]); i += t.length; }
  });
  if (!hits.length) return esc(src);
  hits.sort(function (a, b) { return a[0] - b[0]; });
  var merged = [hits[0]];
  hits.slice(1).forEach(function (h) {
    var last = merged[merged.length - 1];
    if (h[0] <= last[1]) last[1] = Math.max(last[1], h[1]); else merged.push(h);
  });
  var out = '', pos = 0;
  merged.forEach(function (h) {
    out += esc(src.slice(pos, h[0])) + '<mark>' + esc(src.slice(h[0], h[1])) + '</mark>';
    pos = h[1];
  });
  return out + esc(src.slice(pos));
}

/* ------------------------------------------------------------------ counts */
function counts() {
  var oral = DATA.papers.filter(function (p) { return p.type === 'oral'; }).length;
  var sp = DATA.speakers || [];
  return {
    papers: DATA.papers.length,
    oral: oral,
    poster: DATA.papers.length - oral,
    os: DATA.sessions.filter(function (s) { return s.kind === 'oral'; }).length,
    ps: DATA.sessions.filter(function (s) { return s.kind === 'poster'; }).length,
    keynote: sp.filter(function (s) { return s.kind === 'keynote'; }).length,
    invited: sp.filter(function (s) { return s.kind === 'invited'; }).length,
    authors: (buildAuthors(), AUTHORS.length)
  };
}
function dayText(day) {
  return 'Day ' + day + ' — ' + (DAY_SHORT[day] || '') + (DAY_NAMES[day] ? ' (' + DAY_NAMES[day] + ')' : '');
}
function sessionLabel(s) {
  return (s.kind === 'oral' ? 'Oral Session ' : 'Poster Session ') + s.num;
}

/* ------------------------------------------------------------- components */
function authorsShort(p, q) {
  var n = p.authors.map(function (a) { return a.name; });
  if (!n.length) return '';
  var ts = q ? terms(q) : [];
  if (ts.length) {
    var matched = n.filter(function (x) {
      var nx = norm(x);
      return ts.some(function (t) { return nx.indexOf(t) >= 0; });
    });
    if (matched.length) {
      var list = n.slice(0, 2);
      matched.forEach(function (x) { if (list.indexOf(x) < 0) list.push(x); });
      var rest = n.length - list.length;
      return list.join(', ') + (rest > 0 ? ' + ' + rest + ' more' : '');
    }
  }
  if (n.length <= 4) return n.join(', ');
  return n.slice(0, 3).join(', ') + ' + ' + (n.length - 3) + ' more';
}
function paperRow(p, q) {
  var isSaved = saved.indexOf(p.id) >= 0;
  return '<li class="pitem">' +
    '<button class="prow" type="button" data-paper="' + p.id + '">' +
      '<span class="pid ' + p.type + '">' + esc(p.id) + '</span>' +
      '<span class="pbody">' +
        '<span class="ptitle">' + highlight(p.title, q) +
          (p.provisional ? ' <span class="tag prov">provisional</span>' : '') +
          (p.pending ? ' <span class="tag prov">to be announced</span>' : '') + '</span>' +
        '<span class="pauth">' + highlight(authorsShort(p, q), q) + '</span>' +
        '<span class="pmeta">' +
          '<span class="tag ' + p.type + '">' + (p.type === 'oral' ? 'Oral' : 'Poster') + '</span>' +
          '<span class="mono">Day ' + p.day + ' · ' + esc(p.time) + '</span>' +
          '<span>' + esc(p.room) + '</span>' +
          '<span>' + (p.type === 'oral' ? 'Oral ' + p.sessionNum + ' — ' + esc(p.sessionName) : 'Poster Session ' + p.sessionNum) + '</span>' +
        '</span>' +
      '</span>' +
    '</button>' +
    '<button class="star" type="button" data-star="' + p.id + '" aria-pressed="' + isSaved + '" aria-label="' +
      (isSaved ? 'Remove ' + p.id + ' from My programme' : 'Save ' + p.id + ' to My programme') + '">' + ICON.star(isSaved) + '</button>' +
    '</li>';
}
function paperList(papers, q) {
  if (!papers.length) {
    return '<div class="empty"><b>No papers match</b>Try a shorter word, an author’s surname or a paper ID such as “47”.' +
      '<div class="actions"><button class="btn" type="button" id="f-reset">Clear search and filters</button></div></div>';
  }
  return '<div class="card"><ul class="plist">' +
    papers.map(function (p) { return paperRow(p, q); }).join('') + '</ul></div>';
}

/* ------------------------------------------------------------ view: schedule */
function slotSessionId(text) {
  var m = text.match(/Oral Session \((\d+)\)/);
  if (m) return 'OS' + m[1];
  m = text.match(/Poster Session \((\d+)\)/);
  if (m) return 'PS' + m[1];
  return null;
}
function cleanSlotTitle(text) {
  return text
    .replace(/\s*\((Outside )?Rooms? [^)]*\)\s*/g, ' ')
    .replace(/^(Oral|Poster) Session \((\d+)\)\s*-\s*/, '')
    .replace(/Speaker:\s*/, '')
    .trim();
}
function speakerFor(day, slot) {
  if (!isTalk(slot.text)) return null;
  var sp = (DATA.speakers || []).filter(function (s) {
    return s.day === day && s.time === slot.time && s.room === slot.room;
  });
  return sp[0] || null;
}
function slotCell(day, s, extraCls, showTime) {
  var sid = slotSessionId(s.text);
  var sess = sid ? SESS[sid] : null;
  var talk = isTalk(s.text);
  var cls = 'ev ' + (isBreak(s.text) ? 'brk' : (/Keynote/.test(s.text) ? 'key' : roomClass(s.room))) + (extraCls ? ' ' + extraCls : '');
  var roomTxt = s.room === 'All' ? 'All delegates' : s.room;
  var top = '<span class="ev-top">' +
    (sess ? '<span class="ev-code">' + esc(sess.id) + '</span>' : '') +
    (/Keynote/.test(s.text) ? '<span class="ev-code">Keynote</span>' : '') +
    (showTime ? '<span class="ev-room">' + esc(s.time) + '</span>' : (isBreak(s.text) ? '' : '<span class="ev-room">' + esc(roomTxt) + '</span>')) + '</span>';
  var title = sess ? (sess.kind === 'oral' ? esc(sess.name) : esc(sessionLabel(sess) + ' — ' + (sess.subtitle || ''))) : esc(cleanSlotTitle(s.text));
  var inner = top + '<span class="ev-title">' + title + '</span>';
  var sp = talk ? speakerFor(day, s) : null;
  if (sp && sp.topic) inner += '<span class="ev-talk">“' + esc(sp.topic) + '”</span>';
  if (sess && sess.chairs) inner += '<span class="ev-sub">Chairs: ' + esc(sess.chairs) + '</span>';
  if (sess) {
    inner += '<span class="ev-count">' + sess.paperIds.length + ' ' + (sess.kind === 'oral' ? 'papers' : 'posters') + ' ' + ICON.right + '</span>';
    return '<button type="button" class="' + cls + '" data-session="' + sid + '">' + inner + '</button>';
  }
  if (sp) return '<button type="button" class="' + cls + '" data-speaker="' + esc(sp.name) + '">' + inner + '</button>';
  return '<div class="' + cls + '">' + inner + '</div>';
}
function overview() {
  var c = counts();
  return '<div class="overview" role="list">' +
    '<div class="ov" role="listitem"><b>' + c.papers + '</b><span>accepted papers</span></div>' +
    '<div class="ov" role="listitem"><b>' + c.os + '</b><span>oral sessions · ' + c.oral + ' talks</span></div>' +
    '<div class="ov" role="listitem"><b>' + c.ps + '</b><span>poster sessions · ' + c.poster + ' posters</span></div>' +
    '<div class="ov" role="listitem"><b>' + (c.keynote + c.invited) + '</b><span>keynote &amp; invited talks</span></div>' +
    '<div class="ov" role="listitem"><b>' + c.authors + '</b><span>authors</span></div>' +
    '</div>';
}
function viewSchedule() {
  var day = +(route.params.day || STORE.get('day', 1)) || 1;
  STORE.set('day', day);
  var d = DATA.days.filter(function (x) { return x.day === day; })[0] || DATA.days[0];
  day = d.day;

  var strip = '<div class="day-strip" role="group" aria-label="Choose a day">' + DATA.days.map(function (x) {
    var n = DATA.papers.filter(function (p) { return p.day === x.day; }).length;
    return '<button type="button" class="day-btn" aria-pressed="' + (x.day === day) + '" data-day="' + x.day + '">' +
      '<span class="d1">Day ' + x.day + '<span class="long"> · ' + DAY_NAMES[x.day] + '</span></span>' +
      '<span class="d2"><span class="long">' + DAY_SHORT[x.day] + 'ember 2026</span><span class="short">' + DAY_SHORT[x.day] + '</span></span>' +
      '<span class="d3">' + (n ? n + ' papers' : 'Excursion') + '</span></button>';
  }).join('') + '</div>';

  var order = [], groups = {};
  d.slots.forEach(function (s) {
    if (!groups[s.time]) { groups[s.time] = []; order.push(s.time); }
    groups[s.time].push(s);
  });

  var hasTracks = false;
  var rows = order.map(function (t) {
    var items = groups[t];
    var rooms = items.map(function (s) { return roomClass(s.room); });
    var distinct = rooms.filter(function (r, i) { return r && rooms.indexOf(r) === i; }).length === items.length;
    var track = items.length > 1 && distinct;
    var cells;
    if (track) {
      hasTracks = true;
      var byCol = {};
      items.forEach(function (s) { byCol[roomClass(s.room).slice(1)] = s; });
      cells = [1, 2, 3].map(function (c) {
        return byCol[c] ? slotCell(day, byCol[c], 'c' + c) : '<div class="empty-cell c' + c + '" aria-hidden="true"></div>';
      }).join('');
    } else {
      cells = items.map(function (s) { return slotCell(day, s); }).join('');
    }
    return '<div class="slot">' +
      '<div class="slot-time">' + esc(t.replace(/-$/, ' –').replace(/-/, ' – ').replace(' / ', '\n')) + '</div>' +
      '<div class="slot-items' + (track ? ' tracks' : '') + '">' + cells + '</div></div>';
  }).join('');

  var head = hasTracks
    ? '<div class="tt-head" aria-hidden="true"><span>Time (UTC+8)</span><span class="h1">Room 1</span><span class="h2">Room 2</span><span class="h3">Room 3</span></div>'
    : '';

  return '<div class="page-head"><p class="kicker">Programme at a glance</p><h1>Conference schedule</h1>' +
    '<p>Three parallel rooms over two technical days, followed by an excursion. Select a session to see its papers; all times are local (UTC+8).</p></div>' +
    overview() + strip +
    '<div class="legend" aria-hidden="true"><span><i class="lg-r1"></i>Room 1</span><span><i class="lg-r2"></i>Room 2</span>' +
    '<span><i class="lg-r3"></i>Room 3</span><span><i class="lg-key"></i>Keynote</span></div>' +
    '<div class="card">' + head + rows + '</div>' +
    '<div class="actions"><button class="btn" type="button" id="ics-day">' + ICON.cal + 'Add Day ' + day + ' sessions to calendar</button>' +
    '<button class="btn" type="button" data-print>' + ICON.print + 'Print this day</button></div>';
}

/* -------------------------------------------------------------- view: papers */
function viewPapers() {
  var q = $('#q').value;
  var f = route.params;
  var list = runSearch(q);
  if (f.author) {
    var an = norm(f.author);
    list = list.filter(function (p) {
      return p.authors.some(function (a) { return norm(a.name) === an; });
    });
  }
  if (f.type) list = list.filter(function (p) { return p.type === f.type; });
  if (f.day) list = list.filter(function (p) { return String(p.day) === String(f.day); });
  if (f.room) list = list.filter(function (p) { return p.room === f.room; });
  if (f.session) list = list.filter(function (p) { return p.sessionId === f.session; });

  var sort = f.sort || (q ? 'relevance' : 'id');
  if (sort === 'title') list.sort(function (a, b) { return a.title.localeCompare(b.title); });
  else if (sort === 'time') list.sort(function (a, b) { return (a.day - b.day) || a.time.localeCompare(b.time) || a.num - b.num; });
  else if (sort === 'id') list.sort(function (a, b) { return a.num - b.num; });

  var rooms = {};
  DATA.papers.forEach(function (p) { rooms[p.room] = 1; });

  var sortOpts = [['relevance', 'Best match'], ['id', 'Paper ID'], ['time', 'Time'], ['title', 'Title A–Z']];
  if (!q) sortOpts = sortOpts.slice(1);

  var filters = '<div class="filters">' +
    '<label>Type<select id="f-type">' + opt([['', 'Oral & poster'], ['oral', 'Oral only'], ['poster', 'Poster only']], f.type) + '</select></label>' +
    '<label>Day<select id="f-day">' + opt([['', 'All days']].concat(
      DATA.days.filter(function (d) {
        return DATA.papers.some(function (p) { return p.day === d.day; });
      }).map(function (d) { return [String(d.day), 'Day ' + d.day + ' — ' + DAY_SHORT[d.day]]; })), f.day) + '</select></label>' +
    '<label>Room<select id="f-room">' + opt([['', 'All rooms']].concat(Object.keys(rooms).sort().map(function (r) { return [r, r]; })), f.room) + '</select></label>' +
    '<label>Session<select id="f-session">' + opt([['', 'All sessions']].concat(DATA.sessions.map(function (s) {
      return [s.id, s.id + ' — ' + (s.kind === 'oral' ? s.name : 'Poster Session ' + s.num)];
    })), f.session) + '</select></label>' +
    '<label>Sort by<select id="f-sort">' + opt(sortOpts, sort) + '</select></label>' +
    '<button class="link-btn reset" type="button" id="f-reset">Reset</button>' +
    '</div>';

  var authorChip = f.author
    ? '<div class="chips"><button class="chip" type="button" id="clear-author" aria-label="Remove author filter ' + esc(f.author) + '">Author: ' +
      esc(f.author) + ' <span aria-hidden="true">×</span></button></div>'
    : '';
  var what = f.author ? ' by ' + esc(f.author) : (q ? ' matching “' + esc(q) + '”' : '');
  var c = counts();

  return '<div class="page-head"><p class="kicker">Book of abstracts</p><h1>Accepted papers</h1>' +
    '<p>' + c.papers + ' papers — ' + c.oral + ' oral presentations in ' + c.os + ' sessions and ' + c.poster + ' posters in ' + c.ps +
    ' judged sessions. Search covers IDs, titles, authors, affiliations, keywords and full abstracts.</p></div>' +
    authorChip + filters +
    '<p class="result-count" aria-live="polite"><b>' + list.length + '</b> of ' + DATA.papers.length + ' papers' + what + '</p>' +
    paperList(list, q);
}
function opt(pairs, cur) {
  return pairs.map(function (p) {
    return '<option value="' + esc(p[0]) + '"' + (String(p[0]) === String(cur || '') ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
  }).join('');
}

/* ------------------------------------------------------------- view: authors */
var AUTHORS = null;
function buildAuthors() {
  if (AUTHORS) return;
  var map = {};
  DATA.papers.forEach(function (p) {
    p.authors.forEach(function (a) {
      var key = norm(a.name);
      if (!map[key]) map[key] = { name: a.name, affs: [], papers: [] };
      if (map[key].papers.indexOf(p) < 0) map[key].papers.push(p);
      (a.affiliations || []).forEach(function (x) {
        if (map[key].affs.indexOf(x) < 0) map[key].affs.push(x);
      });
    });
  });
  AUTHORS = Object.keys(map).map(function (k) { return map[k]; });
  AUTHORS.sort(function (a, b) { return a.name.localeCompare(b.name); });
}
function letterOf(name) {
  var L = norm(name).charAt(0).toUpperCase();
  return /[A-Z]/.test(L) ? L : '#';
}
function viewAuthors() {
  buildAuthors();
  var q = $('#q').value;
  var ts = terms(q);
  var list = AUTHORS;
  if (ts.length) {
    list = AUTHORS.filter(function (a) {
      var hay = norm(a.name + ' ' + a.affs.join(' ') + ' ' +
        a.papers.map(function (p) { return p.id + ' ' + p.title; }).join(' '));
      return ts.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }

  var letters = [];
  list.forEach(function (a) { var L = letterOf(a.name); if (letters.indexOf(L) < 0) letters.push(L); });

  var head = '<div class="page-head"><p class="kicker">Author index</p><h1>Authors</h1>' +
    '<p>Every presenting and co-authoring name in the programme, with affiliations. Select a name to list that person’s papers.</p></div>' +
    (list.length > 30 ? '<nav class="letters" aria-label="Jump to letter">' + letters.map(function (L) {
      return '<a href="#" data-jump="L-' + L + '">' + L + '</a>';
    }).join('') + '</nav>' : '') +
    '<p class="result-count" aria-live="polite"><b>' + list.length + '</b> of ' + AUTHORS.length + ' authors' +
    (q ? ' matching “' + esc(q) + '”' : '') + '</p>';

  if (!list.length) {
    return head + '<div class="empty"><b>No author matches</b>Check the spelling, or try a surname on its own.</div>';
  }

  var letter = '', html = '<div class="card"><ul class="plist">';
  list.forEach(function (a) {
    var L = letterOf(a.name);
    if (L !== letter) {
      letter = L;
      html += '<li class="pitem alpha" id="L-' + L + '"><div class="alpha-head">' + esc(letter) + '</div></li>';
    }
    html += '<li class="pitem"><button class="prow" type="button" data-author="' + esc(a.name) + '">' +
      '<span class="pid">' + a.papers.length + '</span>' +
      '<span class="pbody"><span class="ptitle">' + highlight(a.name, q) + '</span>' +
      (a.affs.length ? '<span class="pauth">' + esc(a.affs.slice(0, 2).join(' · ')) +
        (a.affs.length > 2 ? ' · +' + (a.affs.length - 2) : '') + '</span>' : '') +
      '<span class="pmeta">' + a.papers.map(function (p) {
        return '<span class="tag ' + p.type + '">' + esc(p.id) + '</span>';
      }).join('') + '</span></span></button></li>';
  });
  return head + html + '</ul></div>';
}

/* ------------------------------------------------------------ view: speakers */
function viewSpeakers() {
  var sp = DATA.speakers || [];
  var head = '<div class="page-head"><p class="kicker">Plenary programme</p><h1>Keynote &amp; invited speakers</h1>' +
    '<p>Keynote lectures take place in Room 1; invited talks open the parallel sessions in each room.</p></div>';
  if (!sp.length) return head + '<div class="empty"><b>Speakers to be announced</b></div>';
  function card(s) {
    var when = s.day
      ? '<div class="spk-when"><span class="mono">' + ICON.cal + ' Day ' + s.day + ' · ' + DAY_SHORT[s.day] + '</span>' +
        '<span class="mono">' + ICON.clock + ' ' + esc(s.time) + '</span><span>' + ICON.pin + ' ' + esc(s.room) + '</span></div>'
      : '';
    return '<article class="spk ' + s.kind + '" id="spk-' + esc(norm(s.name).replace(/[^a-z]+/g, '-')) + '">' +
      '<span class="tag ' + (s.kind === 'keynote' ? 'key' : 'oral') + '" style="align-self:flex-start;margin-bottom:8px">' +
        (s.kind === 'keynote' ? 'Keynote' : 'Invited') + (s.slot ? ' ' + s.slot : '') + '</span>' +
      '<h3 class="spk-name">' + esc(s.name) + '</h3>' +
      '<p class="spk-aff">' + esc(s.affiliation) + '</p>' +
      (s.topic ? '<p class="spk-topic">' + esc(s.topic) + '</p>' : '') + when +
      (s.abstract ? '<details><summary>' + ICON.right + 'Abstract</summary><p>' + esc(s.abstract) + '</p></details>' : '') +
      '</article>';
  }
  var key = sp.filter(function (s) { return s.kind === 'keynote'; });
  var inv = sp.filter(function (s) { return s.kind === 'invited'; });
  var bySlot = function (a, b) { return ((a.day || 9) - (b.day || 9)) || String(a.time).localeCompare(String(b.time)) || String(a.room).localeCompare(String(b.room)); };
  key.sort(bySlot); inv.sort(bySlot);
  return head +
    '<h2 class="spk-group">Keynote lectures <small>' + key.length + '</small></h2><div class="spk-grid">' + key.map(card).join('') + '</div>' +
    '<h2 class="spk-group">Invited talks <small>' + inv.length + '</small></h2><div class="spk-grid">' + inv.map(card).join('') + '</div>';
}

/* --------------------------------------------------------------- view: rooms */
function viewRooms() {
  var rooms = ['Room 1', 'Room 2', 'Room 3'];
  var html = '<div class="page-head"><p class="kicker">Room schedule</p><h1>By room</h1><p>Everything that happens in each room, in order — useful for session chairs and room volunteers.</p></div>';
  html += '<div class="two-col">';
  rooms.forEach(function (r) {
    html += '<section class="card room-col" aria-label="' + r + '"><div class="card-head"><h2>' + r + '</h2></div>';
    DATA.days.forEach(function (d) {
      var slots = d.slots.filter(function (s) {
        return (s.room === r || (r === 'Room 1' && (s.room === 'All' || s.room === 'All rooms'))) && !/Cruise|shuttle/i.test(s.text);
      });
      if (!slots.length) return;
      html += '<div class="slot"><div class="slot-time">' + esc(dayText(d.day)) + '</div><div class="slot-items">';
      slots.forEach(function (s) { html += slotCell(d.day, s, '', true); });
      html += '</div></div>';
    });
    html += '</section>';
  });
  return html + '</div>';
}

/* -------------------------------------------------------------- view: saved */
function viewSaved() {
  var list = saved.map(function (id) { return IDX[id]; }).filter(Boolean)
    .sort(function (a, b) { return (a.day - b.day) || a.time.localeCompare(b.time) || a.num - b.num; });
  var head = '<div class="page-head"><p class="kicker">Personal agenda</p><h1>My programme</h1>' +
    '<p>Papers you have starred, in chronological order. Stored only in this browser — no account, no tracking.</p></div>';
  if (!list.length) {
    return head + '<div class="empty"><b>Nothing saved yet</b>Use the star next to any paper to build your own agenda.' +
      '<div class="actions"><a class="btn primary" href="#/papers">Browse papers</a></div></div>';
  }
  return head +
    '<div class="actions"><button class="btn primary" type="button" id="ics-saved">' + ICON.cal + 'Add all ' + list.length + ' to calendar</button>' +
    '<button class="btn" type="button" data-print>' + ICON.print + 'Print</button>' +
    '<button class="btn" type="button" id="clear-saved">Clear all</button></div>' +
    paperList(list, '');
}

/* --------------------------------------------------------------- view: info */
function viewInfo() {
  var c = DATA.conference, n = counts();
  var html = '<div class="page-head"><p class="kicker">About</p><h1>Conference information</h1></div>';
  html += '<section class="prose"><h2>At a glance</h2><dl class="kv">' +
    '<dt>Conference</dt><dd>' + esc(c.fullName) + ' (' + esc(c.name) + ')</dd>' +
    '<dt>Dates</dt><dd>5–7 November 2026</dd>' +
    '<dt>Venue</dt><dd>' + esc(c.venue) + '</dd>' +
    '<dt>Host</dt><dd>' + esc(c.host) + '</dd>' +
    '<dt>Programme</dt><dd>' + n.papers + ' papers — ' + n.oral + ' oral presentations in ' + n.os + ' sessions, ' + n.poster +
      ' posters in ' + n.ps + ' judged sessions, ' + n.keynote + ' keynote lectures and ' + n.invited + ' invited talks</dd>' +
    '<dt>Rooms</dt><dd>Room 1, Room 2, Room 3 (keynotes in Room 1)</dd>' +
    '<dt>Day 3</dt><dd>Sun Moon Lake cruise, 08:30–10:30; shuttle bus back to Taichung from 10:30</dd>' +
    '</dl></section>';

  if (c.preface && c.preface.length) {
    html += '<section class="prose"><h2>Preface</h2>' + c.preface.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</section>';
  }

  if (c.organizers && c.organizers.length) {
    html += '<section class="prose"><h2>Organisation</h2><dl class="kv">';
    for (var i = 0; i < c.organizers.length; i += 2) {
      html += '<dt>' + esc(c.organizers[i]) + '</dt><dd><ul class="org-list">' +
        (c.organizers[i + 1] || '').split(' / ').map(function (x) { return '<li>' + esc(x.replace(/\.$/, '')) + '</li>'; }).join('') + '</ul></dd>';
    }
    html += '</dl></section>';
  }

  if (DATA.committees && DATA.committees.length) {
    html += '<section class="prose"><h2>Committees</h2><div class="committee-grid">' +
      DATA.committees.map(function (cm) {
        return '<div class="committee"><h3>' + esc(cm.name.toLowerCase().replace(/(^|\s)\S/g, function (x) { return x.toUpperCase(); })) + '</h3><ul>' +
          cm.members.map(function (m) { return '<li>' + esc(m.name) + (m.affiliation ? '<span>' + esc(m.affiliation) + '</span>' : '') + '</li>'; }).join('') +
          '</ul></div>';
      }).join('') + '</div></section>';
  }

  if (DATA.notes && DATA.notes.length) {
    html += '<section class="prose"><h2>Notes on the programme</h2>' +
      DATA.notes.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</section>';
  }
  return html;
}

/* -------------------------------------------------------------- view: paper */
function bylineHTML(p) {
  var affs = [];
  p.authors.forEach(function (a) {
    (a.affiliations || []).forEach(function (x) { if (affs.indexOf(x) < 0) affs.push(x); });
  });
  var numbered = affs.length > 1;
  var names = p.authors.map(function (a) {
    var sups = numbered ? (a.affiliations || []).map(function (x) { return affs.indexOf(x) + 1; }) : [];
    return '<span class="au"><button type="button" class="au" data-author="' + esc(a.name) + '">' + esc(a.name) + '</button>' +
      (sups.length ? '<sup>' + sups.join(',') + '</sup>' : '') + '</span>';
  });
  var byline = names.length ? '<p class="byline">' + names.join(', ') + '</p>' : '<p class="byline" style="color:var(--muted)">Author details not listed.</p>';
  if (!affs.length) affs = p.affiliations || [];
  var list = affs.length
    ? '<ul class="affs">' + affs.map(function (x, i) {
        return '<li>' + (numbered ? '<sup>' + (i + 1) + '</sup>' : '') + '<span>' + esc(x) + '</span></li>';
      }).join('') + '</ul>'
    : '';
  return byline + list;
}
function viewPaper(id) {
  var p = IDX[id];
  if (!p) return '<a class="backlink" href="#/papers">' + ICON.left + 'All papers</a><div class="empty"><b>Paper not found</b>' + esc(id) + ' is not in the programme.</div>';
  var isSaved = saved.indexOf(p.id) >= 0;
  var s = SESS[p.sessionId];
  var sib = s ? s.paperIds : [];
  var k = sib.indexOf(p.id);
  var prev = k > 0 ? IDX[sib[k - 1]] : null, next = k >= 0 && k < sib.length - 1 ? IDX[sib[k + 1]] : null;

  var pendingNote = p.pending
    ? '<div class="note">This paper is in the programme, but its title, authors and abstract have not been released yet.</div>'
    : '';

  var main = '<article class="article-main">' +
      '<div class="idline"><span class="pid ' + p.type + '">' + esc(p.id) + '</span>' +
        '<span class="tag ' + p.type + '">' + (p.type === 'oral' ? 'Oral presentation' : 'Poster') + '</span>' +
        (p.provisional ? '<span class="tag prov">provisional selection</span>' : '') + '</div>' +
      '<h1>' + esc(p.title) + '</h1>' + pendingNote +
      '<p class="meta-line m-only"><span class="mono">' + ICON.cal + 'Day ' + p.day + ' · ' + esc(p.time) + '</span><span>' + ICON.pin + esc(p.room) + '</span>' +
        '<span>' + esc(s ? sessionLabel(s) : p.sessionId) + '</span></p>' +
      bylineHTML(p) +
      (p.abstract ? '<h2 class="section-title">Abstract</h2><p class="abstract" lang="en">' + esc(p.abstract) + '</p>' : '') +
      (p.keywords.length ? '<h2 class="section-title">Keywords</h2><div class="kw">' +
        p.keywords.map(function (kw) { return '<button type="button" data-kw="' + esc(kw) + '">' + esc(kw) + '</button>'; }).join('') + '</div>' : '') +
      (s ? '<nav class="pager" aria-label="Other papers in this session">' +
        (prev ? '<a class="btn" href="' + buildHash('paper', {}, prev.id) + '">' + ICON.left + '<span>' + esc(prev.id.replace('ID_', 'ID ')) + ' · ' + esc(prev.title) + '</span></a>' : '<span></span>') +
        (next ? '<a class="btn next" href="' + buildHash('paper', {}, next.id) + '"><span>' + esc(next.id.replace('ID_', 'ID ')) + ' · ' + esc(next.title) + '</span>' + ICON.right + '</a>' : '<span></span>') +
        '</nav>' : '') +
    '</article>';

  var aside = '<aside class="aside" aria-label="Presentation details">' +
      '<dl class="facts">' +
        '<div><dt>Day</dt><dd>' + esc(dayText(p.day)) + '</dd></div>' +
        '<div><dt>Time</dt><dd><span class="mono">' + esc(p.time) + '</span> <span style="color:var(--muted);font-size:12.5px">UTC+8</span></dd></div>' +
        '<div><dt>Room</dt><dd>' + esc(p.room) + '</dd></div>' +
        '<div><dt>Session</dt><dd><a href="' + buildHash('session', {}, p.sessionId) + '">' + esc(s ? sessionLabel(s) : p.sessionId) + '</a><br>' +
          '<span style="font-weight:400;color:var(--ink-2)">' + esc(p.type === 'oral' ? p.sessionName : (s && s.subtitle) || p.sessionName) + '</span></dd></div>' +
        (p.chairs ? '<div><dt>Chairs</dt><dd style="font-weight:400">' + esc(p.chairs) + '</dd></div>' : '') +
      '</dl>' +
      '<button class="btn ' + (isSaved ? 'primary' : '') + '" type="button" data-star="' + p.id + '" aria-pressed="' + isSaved + '">' +
        ICON.star(isSaved) + (isSaved ? 'Saved to My programme' : 'Save to My programme') + '</button>' +
      '<button class="btn" type="button" data-ics-paper="' + p.id + '">' + ICON.cal + 'Add to calendar</button>' +
      '<button class="btn" type="button" id="share-qr">' + ICON.qr + 'QR code for this paper</button>' +
    '</aside>';

  return '<a class="backlink" href="#/papers">' + ICON.left + 'All papers</a>' +
    '<div class="article">' + main + aside + '</div>';
}

/* ------------------------------------------------------------ view: session */
function viewSession(id) {
  var s = SESS[id];
  if (!s) return '<a class="backlink" href="#/schedule">' + ICON.left + 'Schedule</a><div class="empty"><b>Session not found</b></div>';
  var list = s.paperIds.map(function (x) { return IDX[x]; }).filter(Boolean);
  return '<a class="backlink" href="' + buildHash('schedule', { day: s.day }) + '">' + ICON.left + 'Schedule — Day ' + s.day + '</a>' +
    '<header class="sess-head ' + roomClass(s.room) + '">' +
      '<span class="tag ' + s.kind + '">' + esc(sessionLabel(s)) + '</span>' +
      '<h1>' + esc(s.kind === 'oral' ? s.name : sessionLabel(s) + ' — ' + (s.subtitle || '')) + '</h1>' +
      '<p class="meta-line"><span>' + ICON.cal + esc(dayText(s.day)) + '</span>' +
        '<span class="mono">' + ICON.clock + esc(s.time) + '</span>' +
        '<span>' + ICON.pin + esc(s.room) + '</span>' +
        (s.chairs ? '<span>' + ICON.user + 'Chairs: ' + esc(s.chairs) + '</span>' : '') + '</p>' +
    '</header>' +
    '<div class="actions"><button class="btn" type="button" data-ics-session="' + s.id + '">' + ICON.cal + 'Add session to calendar</button>' +
    '<button class="btn" type="button" id="share-qr">' + ICON.qr + 'QR code for this session</button></div>' +
    '<p class="result-count"><b>' + list.length + '</b> ' + (s.kind === 'oral' ? 'papers, in presentation order' : 'posters') + '</p>' +
    paperList(list, '');
}

/* ------------------------------------------------------------------ render */
var TABS = [
  { k: 'schedule', label: 'Schedule' },
  { k: 'papers', label: 'Papers', count: function () { return DATA.papers.length; } },
  { k: 'speakers', label: 'Speakers' },
  { k: 'authors', label: 'Authors' },
  { k: 'rooms', label: 'Rooms' },
  { k: 'saved', label: 'My programme', count: function () { return saved.length; } },
  { k: 'info', label: 'About' }
];
function renderTabs() {
  var active = route.view;
  if (active === 'paper') active = 'papers';
  if (active === 'session') active = 'schedule';
  $('#tabs').innerHTML = TABS.map(function (t) {
    var c = t.count ? t.count() : null;
    var on = t.k === active;
    return '<button class="tab" type="button" role="tab" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-tab="' + t.k + '">' +
      esc(t.label) + (c ? '<span class="badge">' + c + '</span>' : '') + '</button>';
  }).join('');
  var cur = $('#tabs .tab[aria-selected="true"]');
  if (cur && cur.scrollIntoView && window.innerWidth < 820) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
var TITLES = { schedule: 'Schedule', papers: 'Papers', speakers: 'Speakers', authors: 'Authors', rooms: 'Rooms', saved: 'My programme', info: 'About' };
function render() {
  var v = route.view, html;
  if (v === 'papers') html = viewPapers();
  else if (v === 'authors') html = viewAuthors();
  else if (v === 'speakers') html = viewSpeakers();
  else if (v === 'rooms') html = viewRooms();
  else if (v === 'saved') html = viewSaved();
  else if (v === 'info') html = viewInfo();
  else if (v === 'paper') html = viewPaper(route.id);
  else if (v === 'session') html = viewSession(route.id);
  else { v = 'schedule'; html = viewSchedule(); }
  $('#view').innerHTML = html;
  renderTabs();
  $('#searchbar').hidden = !(v === 'schedule' || v === 'papers' || v === 'authors' || v === 'saved');
  $('#q').placeholder = (v === 'authors')
    ? 'Search authors by name, affiliation or paper…'
    : 'Search papers, authors, keywords, sessions…';
  var t = v === 'paper' && IDX[route.id] ? route.id.replace('ID_', 'ID ') + ' — ' + IDX[route.id].title
        : v === 'session' && SESS[route.id] ? sessionLabel(SESS[route.id]) + ' — ' + SESS[route.id].name
        : TITLES[v];
  document.title = t + ' · MAMM 2026';
}

/* --------------------------------------------------------------- QR modal */
function showQR(url, label) {
  var qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  $('#qr-target').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  var svg = $('#qr-target svg');
  if (svg) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code for ' + url); }
  $('#modal-title').textContent = label || 'Scan to open';
  $('#modal-url').textContent = url;
  lastFocus = document.activeElement;
  $('#modal').hidden = false;
  $('#modal').dataset.url = url;
  $('#qr-close').focus();
}
function closeQR() {
  if ($('#modal').hidden) return;
  $('#modal').hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

/* ------------------------------------------------------------------ events */
function toggleStar(id) {
  var i = saved.indexOf(id);
  if (i >= 0) saved.splice(i, 1); else saved.push(id);
  STORE.set('saved', saved);
  var y = window.scrollY;
  render();
  window.scrollTo(0, y);
}
function navTo(view, params, id) {
  go(view, params, id);
  window.scrollTo(0, 0);
}
function wire() {
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (b) navTo(b.dataset.tab, {});
  });
  $('#tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var tabs = Array.prototype.slice.call(document.querySelectorAll('#tabs .tab'));
    var i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus();
    e.preventDefault();
  });

  $('#view').addEventListener('click', function (e) {
    var el;
    if ((el = e.target.closest('[data-star]'))) { e.stopPropagation(); toggleStar(el.dataset.star); return; }
    if ((el = e.target.closest('[data-author]'))) {
      $('#q').value = ''; $('#q-clear').hidden = true;
      navTo('papers', { author: el.dataset.author }); return;
    }
    if ((el = e.target.closest('[data-paper]'))) { navTo('paper', {}, el.dataset.paper); return; }
    if ((el = e.target.closest('[data-session]'))) { navTo('session', {}, el.dataset.session); return; }
    if ((el = e.target.closest('[data-speaker]'))) {
      var anchor = 'spk-' + norm(el.dataset.speaker).replace(/[^a-z]+/g, '-');
      go('speakers', {});
      setTimeout(function () { var t = document.getElementById(anchor); if (t) { t.scrollIntoView({ block: 'center' }); var d = t.querySelector('details'); if (d) d.open = true; } }, 30);
      return;
    }
    if ((el = e.target.closest('[data-day]'))) { go('schedule', { day: el.dataset.day }); return; }
    if ((el = e.target.closest('[data-kw]'))) { $('#q').value = el.dataset.kw; $('#q-clear').hidden = false; navTo('papers', {}); return; }
    if ((el = e.target.closest('[data-jump]'))) {
      e.preventDefault();
      var tgt = document.getElementById(el.dataset.jump);
      if (tgt) tgt.scrollIntoView({ block: 'start' });
      return;
    }
    if (e.target.closest('[data-print]')) { window.print(); return; }
    if (e.target.closest('#clear-author')) { go('papers', {}); return; }
    if ((el = e.target.closest('[data-ics-paper]'))) {
      var p = IDX[el.dataset.icsPaper];
      downloadICS([{ uid: p.id, date: p.date, time: p.time, room: p.room,
        title: p.id + ' — ' + p.title, desc: p.sessionName + '\n' + p.authors.map(function (a) { return a.name; }).join(', ') }],
        p.id + '.ics');
      return;
    }
    if ((el = e.target.closest('[data-ics-session]'))) {
      var s = SESS[el.dataset.icsSession];
      downloadICS([{ uid: s.id, date: s.date, time: s.time, room: s.room,
        title: sessionLabel(s) + ' — ' + s.name,
        desc: s.paperIds.map(function (x) { return x + ': ' + (IDX[x] ? IDX[x].title : ''); }).join('\n') }],
        s.id + '.ics');
      return;
    }
    if (e.target.closest('#ics-day')) {
      var day = +(route.params.day || STORE.get('day', 1));
      var evs = DATA.sessions.filter(function (x) { return x.day === day; }).map(function (x) {
        return { uid: x.id, date: x.date, time: x.time, room: x.room,
          title: sessionLabel(x) + ' — ' + x.name, desc: x.paperIds.join(', ') };
      });
      downloadICS(evs, 'mamm2026-day' + day + '.ics');
      return;
    }
    if (e.target.closest('#ics-saved')) {
      downloadICS(saved.map(function (id) { return IDX[id]; }).filter(Boolean).map(function (x) {
        return { uid: x.id, date: x.date, time: x.time, room: x.room, title: x.id + ' — ' + x.title, desc: x.sessionName };
      }), 'mamm2026-my-programme.ics');
      return;
    }
    if (e.target.closest('#clear-saved')) { saved = []; STORE.set('saved', saved); render(); return; }
    if (e.target.closest('#share-qr')) { showQR(location.href, 'Scan to open this page'); return; }
    if (e.target.closest('#f-reset')) { $('#q').value = ''; $('#q-clear').hidden = true; go('papers', {}); render(); return; }
  });

  $('#view').addEventListener('change', function (e) {
    var id = e.target.id;
    if (!/^f-/.test(id)) return;
    var p = Object.assign({}, route.params);
    p[id.slice(2)] = e.target.value;
    go('papers', p);
  });

  var t = null;
  $('#q').addEventListener('input', function () {
    $('#q-clear').hidden = !$('#q').value;
    clearTimeout(t);
    t = setTimeout(function () {
      if (route.view === 'papers' || route.view === 'authors') render();
      else go('papers', {});
    }, 160);
  });
  $('#q-clear').addEventListener('click', function () {
    $('#q').value = ''; $('#q-clear').hidden = true; render(); $('#q').focus();
  });
  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(tag) && !$('#searchbar').hidden) { e.preventDefault(); $('#q').focus(); }
    if (e.key === 'Escape') closeQR();
    if (e.key === 'Tab' && !$('#modal').hidden) {        // keep focus inside the dialog
      var f = Array.prototype.slice.call($('#modal').querySelectorAll('button'));
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { f[f.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && i === f.length - 1) { f[0].focus(); e.preventDefault(); }
    }
  });

  $('#btn-qr').addEventListener('click', function () { showQR(location.href, 'Scan to open this page'); });
  $('#qr-close').addEventListener('click', closeQR);
  $('#modal').addEventListener('click', function (e) { if (e.target === $('#modal')) closeQR(); });
  $('#qr-copy').addEventListener('click', function () {
    var u = $('#modal').dataset.url;
    if (navigator.clipboard) navigator.clipboard.writeText(u).catch(function () {});
    $('#qr-copy').textContent = 'Copied';
    setTimeout(function () { $('#qr-copy').textContent = 'Copy link'; }, 1500);
  });
  $('#btn-theme').addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    STORE.set('theme', next);
  });

  window.addEventListener('hashchange', function () {
    route = parseHash();
    render();
  });
}

/* ------------------------------------------------------------- countdown */
function countdown() {
  var now = new Date();
  var start = new Date('2026-11-05T08:30:00+08:00');
  var end = new Date('2026-11-07T12:00:00+08:00');
  var el = $('#countdown');
  if (now < start) {
    var days = Math.ceil((start - now) / 86400000);
    el.textContent = days === 1 ? 'Opens tomorrow' : 'Opens in ' + days + ' days';
  } else if (now <= end) {
    el.textContent = 'In progress';
  } else {
    el.textContent = '';
  }
}

/* ------------------------------------------------------------------- boot */
function boot(data) {
  DATA = data;
  data.papers.forEach(function (p) { IDX[p.id] = p; });
  data.sessions.forEach(function (s) { SESS[s.id] = s; });
  buildIndex();
  saved = saved.filter(function (id) { return IDX[id]; });
  route = parseHash();
  $('#foot-note').textContent = data.papers.length + ' papers · ' + data.sessions.length + ' sessions · data from the conference proceedings';
  countdown();
  wire();
  render();
}

fetch('program.json', { cache: 'no-cache' })
  .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(boot)
  .catch(function (err) {
    $('#view').innerHTML = '<div class="empty" style="margin-top:24px"><b>Could not load the programme data</b>' +
      'If you opened this file directly from disk, the browser blocks <code>program.json</code>. ' +
      'Serve the folder over HTTP (for example <code>python -m http.server</code>) or open the published GitHub Pages site.' +
      '<br><br><small>' + esc(err.message) + '</small></div>';
  });

})();
