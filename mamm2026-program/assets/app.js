/* MAMM 2026 — technical programme browser
   Plain ES2018, no build step. Data lives in program.json. */
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

/* ------------------------------------------------------------------ state */
var DATA = null;
var IDX = {};            // paper id -> paper
var SESS = {};           // session id -> session
var SEARCH = [];         // [{p, hay}]
var saved = STORE.get('saved', []);
var route = { view: 'schedule', params: {} };

var DAY_NAMES = { 1: 'Thursday', 2: 'Friday', 3: 'Saturday' };
var ROOM_CLASS = function (r) {
  if (/Room 1\b/.test(r) && !/Rooms/.test(r)) return 'room1';
  if (/Room 2\b/.test(r)) return 'room2';
  if (/Room 3\b/.test(r)) return 'room3';
  return '';
};
var isBreak = function (t) {
  return /(Tea Break|Lunch|Banquet|Registration|Group Photo|Opening Ceremony|Closing Remarks|shuttle bus|Cruise|available \(TBD\))/i.test(t);
};

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
    var v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    params[k] = v;
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
function icsEscape(s) { return String(s || '').replace(/[\;,]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); }
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
    var hay = norm([
      p.id, p.id.replace('ID_', ''), p.id.replace('_', ' '), p.title,
      p.authors.map(function (a) { return a.name; }).join(' '),
      p.affiliations.join(' '), p.keywords.join(' '), p.abstract,
      p.sessionName, p.type, p.room, p.time, 'day ' + p.day
    ].join(' · '));
    return { p: p, hay: hay };
  });
}
function runSearch(q) {
  var terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return DATA.papers.slice();
  return SEARCH.filter(function (e) {
    return terms.every(function (t) { return e.hay.indexOf(t) >= 0; });
  }).map(function (e) { return e.p; });
}
function highlight(text, q) {
  var terms = norm(q).split(/\s+/).filter(function (t) { return t.length > 1; });
  if (!terms.length) return esc(text);
  var src = String(text), low = norm(src), hits = [];
  terms.forEach(function (t) {
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

/* ------------------------------------------------------------- components */
function authorsShort(p) {
  var n = p.authors.map(function (a) { return a.name; });
  if (!n.length) return '';
  if (n.length <= 3) return n.join(', ');
  return n[0] + ', ' + n[1] + ' and ' + (n.length - 2) + ' more';
}
function paperRow(p, q) {
  var isSaved = saved.indexOf(p.id) >= 0;
  return '<li class="pitem">' +
    '<div style="display:flex;align-items:flex-start">' +
      '<button class="prow" data-paper="' + p.id + '">' +
        '<span class="pid ' + p.type + '">' + esc(p.id.replace('ID_', '')) + '</span>' +
        '<span>' +
          '<span class="ptitle">' + highlight(p.title, q) + (p.provisional ? ' <span class="tag prov">provisional</span>' : '') + '</span>' +
          '<span class="pauth">' + highlight(authorsShort(p), q) + '</span>' +
          '<span class="pmeta">' +
            '<span class="tag ' + p.type + '">' + (p.type === 'oral' ? 'Oral' : 'Poster') + '</span>' +
            '<span>Day ' + p.day + ' · ' + esc(p.time) + '</span>' +
            '<span>' + esc(p.room) + '</span>' +
            '<span>' + esc(p.sessionName) + '</span>' +
          '</span>' +
        '</span>' +
      '</button>' +
      '<button class="star" data-star="' + p.id + '" aria-pressed="' + isSaved + '" title="Save to My programme">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="' + (isSaved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/></svg>' +
      '</button>' +
    '</div></li>';
}
function paperList(papers, q) {
  if (!papers.length) {
    return '<div class="empty"><b>No papers match</b>Try a different keyword, or clear the filters.</div>';
  }
  return '<div class="card"><ul class="plist">' +
    papers.map(function (p) { return paperRow(p, q); }).join('') + '</ul></div>';
}

/* ------------------------------------------------------------ view: schedule */
function slotSessionId(text) {
  var m = text.match(/Oral Session \((\d)\)/);
  if (m) return 'OS' + m[1];
  m = text.match(/Poster Session \((\d)\)/);
  if (m) return 'PS' + m[1];
  return null;
}
function cleanSlotTitle(text) {
  return text
    .replace(/\s*\((Outside )?Rooms? [^)]*\)\s*/g, ' ')
    .replace(/\s*-\s*Rooms? \d\s*$/, '')
    .replace(/\s*\/\s*\(chaired by[^)]*\)/, '')
    .trim();
}
function slotChairs(text) {
  var m = text.match(/\(chaired by ([^)]*)\)/);
  return m ? m[1] : '';
}
function viewSchedule() {
  var day = +(route.params.day || STORE.get('day', 1)) || 1;
  STORE.set('day', day);
  var d = DATA.days.filter(function (x) { return x.day === day; })[0] || DATA.days[0];

  var strip = '<div class="day-strip">' + DATA.days.map(function (x) {
    var n = DATA.papers.filter(function (p) { return p.day === x.day; }).length;
    return '<button class="day-btn" aria-pressed="' + (x.day === day) + '" data-day="' + x.day + '">' +
      '<span class="d1">Day ' + x.day + '</span>' +
      '<span class="d2">' + (x.day === 3 ? '7 Nov' : (x.day === 2 ? '6 Nov' : '5 Nov')) + ' · ' + DAY_NAMES[x.day] + '</span>' +
      '<span class="d3">' + (n ? n + ' papers' : 'Excursion day') + '</span></button>';
  }).join('') + '</div>';

  // group slots by time label, preserving order
  var order = [], groups = {};
  d.slots.forEach(function (s) {
    if (!groups[s.time]) { groups[s.time] = []; order.push(s.time); }
    groups[s.time].push(s);
  });

  var rows = order.map(function (t) {
    var items = groups[t];
    var cells = items.map(function (s) {
      var sid = slotSessionId(s.text);
      var title = cleanSlotTitle(s.text);
      var cls = 'ev ' + ROOM_CLASS(s.room) + (isBreak(s.text) ? ' break' : '');
      var chairs = slotChairs(s.text);
      var inner =
        '<span class="ev-room">' + esc(s.room === 'All' ? 'All delegates' : s.room) + '</span>' +
        '<span class="ev-title">' + esc(title) + '</span>' +
        (chairs ? '<span class="ev-sub">Chairs: ' + esc(chairs) + '</span>' : '');
      if (sid && SESS[sid]) {
        inner += '<span class="ev-count">' + SESS[sid].paperIds.length + ' papers →</span>';
        return '<button class="' + cls + '" data-session="' + sid + '">' + inner + '</button>';
      }
      return '<div class="' + cls + '">' + inner + '</div>';
    }).join('');
    return '<div class="slot' + (items.length > 1 ? ' multi' : '') + '">' +
      '<div class="slot-time">' + esc(t.replace(' / ', '\n/ ')) + '</div>' +
      '<div class="slot-items">' + cells + '</div></div>';
  }).join('');

  return '<div class="page-head"><h1>' + esc(d.title.replace(/^MAMM 2026 - /, '')) + '</h1>' +
    '<p>Tap a session to see its papers. All times are local (UTC+8).</p></div>' +
    strip +
    '<div class="card">' + rows + '</div>' +
    '<div class="detail-actions" style="border:0"><button class="btn" id="ics-day">Add Day ' + day + ' to calendar (.ics)</button>' +
    '<button class="btn" onclick="window.print()">Print this day</button></div>';
}

/* -------------------------------------------------------------- view: papers */
function viewPapers() {
  var q = $('#q').value;
  var f = route.params;
  var list = runSearch(q);
  if (f.type) list = list.filter(function (p) { return p.type === f.type; });
  if (f.day) list = list.filter(function (p) { return String(p.day) === String(f.day); });
  if (f.room) list = list.filter(function (p) { return p.room === f.room; });
  if (f.session) list = list.filter(function (p) { return p.sessionId === f.session; });

  var sort = f.sort || 'id';
  if (sort === 'title') list.sort(function (a, b) { return a.title.localeCompare(b.title); });
  else if (sort === 'time') list.sort(function (a, b) { return (a.day - b.day) || a.time.localeCompare(b.time) || a.num - b.num; });
  else list.sort(function (a, b) { return a.num - b.num; });

  var rooms = {};
  DATA.papers.forEach(function (p) { rooms[p.room] = 1; });

  var filters = '<div class="filters">' +
    '<label>Type<select id="f-type">' + opt([['', 'All'], ['oral', 'Oral only'], ['poster', 'Poster only']], f.type) + '</select></label>' +
    '<label>Day<select id="f-day">' + opt([['', 'All days'], ['1', 'Day 1 — 5 Nov'], ['2', 'Day 2 — 6 Nov']], f.day) + '</select></label>' +
    '<label>Room<select id="f-room">' + opt([['', 'All rooms']].concat(Object.keys(rooms).sort().map(function (r) { return [r, r]; })), f.room) + '</select></label>' +
    '<label>Session<select id="f-session">' + opt([['', 'All sessions']].concat(DATA.sessions.map(function (s) {
      return [s.id, (s.kind === 'oral' ? 'Oral ' + s.num : 'Poster ' + s.num) + ' — ' + s.name];
    })), f.session) + '</select></label>' +
    '<label>Sort<select id="f-sort">' + opt([['id', 'Paper ID'], ['time', 'Time'], ['title', 'Title A–Z']], sort) + '</select></label>' +
    '<span class="spacer"></span>' +
    '<button class="link-btn" id="f-reset">Reset filters</button>' +
    '</div>';

  return '<div class="page-head"><h1>All papers</h1>' +
    '<p>89 accepted papers · 56 oral in 9 sessions · 33 posters in 2 sessions. Search covers titles, authors, affiliations, keywords and full abstracts.</p></div>' +
    filters +
    '<p class="result-count"><b>' + list.length + '</b> of ' + DATA.papers.length + ' papers' + (q ? ' matching “' + esc(q) + '”' : '') + '</p>' +
    paperList(list, q);
}
function opt(pairs, cur) {
  return pairs.map(function (p) {
    return '<option value="' + esc(p[0]) + '"' + (String(p[0]) === String(cur || '') ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
  }).join('');
}

/* --------------------------------------------------------------- view: rooms */
function viewRooms() {
  var rooms = ['Room 1', 'Room 2', 'Room 3'];
  var html = '<div class="page-head"><h1>By room</h1><p>What happens in each room, hour by hour.</p></div>';
  html += '<div class="two-col">';
  rooms.forEach(function (r) {
    html += '<div class="card"><div class="card-head"><b>' + r + '</b></div>';
    DATA.days.forEach(function (d) {
      var slots = d.slots.filter(function (s) { return s.room === r || s.room === 'All rooms' || (s.room === 'All' && r === 'Room 1'); });
      if (!slots.length) return;
      html += '<div class="slot" style="grid-template-columns:1fr"><div class="slot-time">Day ' + d.day + ' — ' + (d.day === 1 ? '5' : d.day === 2 ? '6' : '7') + ' Nov</div><div class="slot-items">';
      slots.forEach(function (s) {
        var sid = slotSessionId(s.text);
        var t = cleanSlotTitle(s.text);
        var cls = 'ev ' + ROOM_CLASS(r) + (isBreak(s.text) ? ' break' : '');
        var inner = '<span class="ev-room">' + esc(s.time) + '</span><span class="ev-title">' + esc(t) + '</span>';
        html += sid && SESS[sid]
          ? '<button class="' + cls + '" data-session="' + sid + '">' + inner + '<span class="ev-count">' + SESS[sid].paperIds.length + ' papers →</span></button>'
          : '<div class="' + cls + '">' + inner + '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';
  });
  html += '</div>';
  return html;
}

/* -------------------------------------------------------------- view: saved */
function viewSaved() {
  var list = saved.map(function (id) { return IDX[id]; }).filter(Boolean)
    .sort(function (a, b) { return (a.day - b.day) || a.time.localeCompare(b.time) || a.num - b.num; });
  var head = '<div class="page-head"><h1>My programme</h1>' +
    '<p>Papers you starred. Saved in this browser only — no account needed.</p></div>';
  if (!list.length) {
    return head + '<div class="empty"><b>Nothing saved yet</b>Tap the ☆ next to any paper to build your own schedule.</div>';
  }
  return head +
    '<div class="detail-actions" style="border:0;margin-top:0"><button class="btn primary" id="ics-saved">Add all ' + list.length + ' to calendar (.ics)</button>' +
    '<button class="btn" onclick="window.print()">Print</button>' +
    '<button class="btn" id="clear-saved">Clear all</button></div>' +
    paperList(list, '');
}

/* --------------------------------------------------------------- view: info */
function viewInfo() {
  var c = DATA.conference;
  var html = '<div class="page-head"><h1>Conference information</h1></div>';
  html += '<div class="prose"><h2>At a glance</h2><ul>' +
    '<li><b>Conference:</b> ' + esc(c.fullName) + ' (' + esc(c.name) + ')</li>' +
    '<li><b>Dates:</b> ' + esc(c.dates) + '</li>' +
    '<li><b>Venue:</b> ' + esc(c.venue) + '</li>' +
    '<li><b>Host:</b> ' + esc(c.host) + '</li>' +
    '<li><b>Programme:</b> 89 papers — 56 oral presentations (~15 min each) in 9 sessions, 33 posters in 2 judged sessions</li>' +
    '<li><b>Rooms:</b> Room 1, Room 2, Room 3</li>' +
    '</ul></div>';

  html += '<div class="prose"><h2>Day 3 — 7 November</h2><p>Sun Moon Lake Cruise, 08:30–10:30. Self-funded activity; advance reservation required through the MAMM 2026 organizer. From 10:30, shuttle bus back to Taichung.</p></div>';

  html += '<div class="prose"><h2>Notes on the programme</h2>' +
    DATA.notes.map(function (n) { return '<div class="note">' + esc(n) + '</div>'; }).join('') +
    '<div class="note">Keynote and invited speakers are listed as time slots; speaker names will be announced by the organisers.</div>' +
    '</div>';

  html += '<div class="prose"><h2>Preface</h2>' + c.preface.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>';

  html += '<div class="prose"><h2>Organised by</h2><ul>';
  for (var i = 0; i < c.organizers.length; i += 2) {
    html += '<li><b>' + esc(c.organizers[i]) + ':</b> ' + esc((c.organizers[i + 1] || '').replace(/ \/ /g, ' · ')) + '</li>';
  }
  html += '</ul></div>';

  html += '<div class="prose"><h2>Committees</h2><div class="two-col">' +
    DATA.committees.map(function (cm) {
      return '<div><div class="section-title" style="margin-top:0">' + esc(cm.name) + '</div><ul>' +
        cm.members.map(function (m) { return '<li><b>' + esc(m.name) + '</b>' + (m.affiliation ? '<br><span style="font-size:12.5px">' + esc(m.affiliation) + '</span>' : '') + '</li>'; }).join('') +
        '</ul></div>';
    }).join('') + '</div></div>';

  return html;
}

/* -------------------------------------------------------------- view: paper */
function viewPaper(id) {
  var p = IDX[id];
  if (!p) return '<div class="empty"><b>Paper not found</b>' + esc(id) + ' is not in the programme.</div>';
  var isSaved = saved.indexOf(p.id) >= 0;
  var s = SESS[p.sessionId];

  var authors = p.authors.length
    ? '<ul class="authors">' + p.authors.map(function (a) {
        return '<li><span class="an">' + esc(a.name) + '</span>' +
          (a.affiliations && a.affiliations.length ? '<span class="aa">' + esc(a.affiliations.join(' · ')) + '</span>' : '') + '</li>';
      }).join('') + '</ul>'
    : '<p style="color:var(--muted)">Author details not listed.</p>';

  return '<a class="backlink" href="#/papers">← Back to all papers</a>' +
    '<div class="detail">' +
      '<div class="idline"><span class="tag ' + p.type + '">' + (p.type === 'oral' ? 'Oral' : 'Poster') + '</span>' +
        '<span class="pid ' + p.type + '" style="padding:2px 9px">' + esc(p.id) + '</span>' +
        (p.provisional ? '<span class="tag prov">provisional selection</span>' : '') + '</div>' +
      '<h1>' + esc(p.title) + '</h1>' +
      '<dl class="factgrid">' +
        '<div class="fact"><dt>Day</dt><dd>Day ' + p.day + ' — ' + (p.day === 1 ? '5' : '6') + ' Nov (' + DAY_NAMES[p.day] + ')</dd></div>' +
        '<div class="fact"><dt>Time</dt><dd>' + esc(p.time) + '</dd></div>' +
        '<div class="fact"><dt>Room</dt><dd>' + esc(p.room) + '</dd></div>' +
        '<div class="fact"><dt>Session</dt><dd><a href="' + buildHash('session', {}, p.sessionId) + '">' +
          esc((p.type === 'oral' ? 'Oral Session ' : 'Poster Session ') + p.sessionNum) + '</a></dd></div>' +
      '</dl>' +
      '<div class="section-title">Session</div><p style="margin:0">' + esc(p.sessionName) +
        (p.chairs ? '<br><span style="color:var(--muted);font-size:13px">Chairs: ' + esc(p.chairs) + '</span>' : '') + '</p>' +
      '<div class="section-title">Authors</div>' + authors +
      '<div class="section-title">Abstract</div><p class="abstract">' + esc(p.abstract) + '</p>' +
      (p.keywords.length ? '<div class="section-title">Keywords</div><div class="kw">' +
        p.keywords.map(function (k) { return '<button data-kw="' + esc(k) + '">' + esc(k) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="detail-actions">' +
        '<button class="btn ' + (isSaved ? 'primary' : '') + '" data-star="' + p.id + '" aria-pressed="' + isSaved + '">' +
          (isSaved ? '★ Saved' : '☆ Save to my programme') + '</button>' +
        '<button class="btn" data-ics-paper="' + p.id + '">Add to calendar</button>' +
        '<button class="btn" id="share-qr">Show QR for this paper</button>' +
      '</div>' +
    '</div>';
}

/* ------------------------------------------------------------ view: session */
function viewSession(id) {
  var s = SESS[id];
  if (!s) return '<div class="empty"><b>Session not found</b></div>';
  var list = s.paperIds.map(function (x) { return IDX[x]; }).filter(Boolean);
  return '<a class="backlink" href="' + buildHash('schedule', { day: s.day }) + '">← Back to the schedule</a>' +
    '<div class="page-head">' +
      '<h1>' + esc((s.kind === 'oral' ? 'Oral Session ' : 'Poster Session ') + s.num + ' — ' + s.name) + '</h1>' +
      '<p>Day ' + s.day + ' · ' + esc(s.dateLabel || '') + ' · ' + esc(s.time) + ' · ' + esc(s.room) +
      (s.chairs ? ' · Chairs: ' + esc(s.chairs) : '') + '</p>' +
    '</div>' +
    '<div class="detail-actions" style="border:0;margin-top:0"><button class="btn" data-ics-session="' + s.id + '">Add session to calendar</button>' +
    '<button class="btn" id="share-qr">Show QR for this session</button></div>' +
    paperList(list, '');
}

/* ------------------------------------------------------------------ render */
var TABS = [
  { k: 'schedule', label: 'Schedule' },
  { k: 'papers', label: 'Papers', count: function () { return DATA.papers.length; } },
  { k: 'rooms', label: 'Rooms' },
  { k: 'saved', label: 'My programme', count: function () { return saved.length; } },
  { k: 'info', label: 'Info' }
];
function renderTabs() {
  var active = route.view;
  if (active === 'paper') active = 'papers';
  if (active === 'session') active = 'schedule';
  $('#tabs').innerHTML = TABS.map(function (t) {
    var c = t.count ? t.count() : null;
    return '<button class="tab" role="tab" aria-selected="' + (t.k === active) + '" data-tab="' + t.k + '">' +
      esc(t.label) + (c ? '<span class="badge">' + c + '</span>' : '') + '</button>';
  }).join('');
}
function render() {
  var v = route.view, html;
  if (v === 'papers') html = viewPapers();
  else if (v === 'rooms') html = viewRooms();
  else if (v === 'saved') html = viewSaved();
  else if (v === 'info') html = viewInfo();
  else if (v === 'paper') html = viewPaper(route.id);
  else if (v === 'session') html = viewSession(route.id);
  else html = viewSchedule();
  $('#view').innerHTML = html;
  renderTabs();
  document.querySelector('.searchbar').style.display = (v === 'paper' || v === 'info' || v === 'rooms') ? 'none' : '';
}

/* --------------------------------------------------------------- QR modal */
function showQR(url, label) {
  var qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  $('#qr-target').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  $('#modal-title').textContent = label || 'Scan to open';
  $('#modal-url').textContent = url;
  $('#modal').classList.add('open');
  $('#modal').dataset.url = url;
}
function closeQR() { $('#modal').classList.remove('open'); }

/* ------------------------------------------------------------------ events */
function toggleStar(id) {
  var i = saved.indexOf(id);
  if (i >= 0) saved.splice(i, 1); else saved.push(id);
  STORE.set('saved', saved);
  render();
}
function wire() {
  // tabs
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (b) go(b.dataset.tab, b.dataset.tab === 'papers' ? {} : {});
  });

  // global clicks inside the view
  $('#view').addEventListener('click', function (e) {
    var el;
    if ((el = e.target.closest('[data-paper]'))) { go('paper', {}, el.dataset.paper); window.scrollTo(0, 0); return; }
    if ((el = e.target.closest('[data-session]'))) { go('session', {}, el.dataset.session); window.scrollTo(0, 0); return; }
    if ((el = e.target.closest('[data-star]'))) { e.stopPropagation(); toggleStar(el.dataset.star); return; }
    if ((el = e.target.closest('[data-day]'))) { go('schedule', { day: el.dataset.day }); return; }
    if ((el = e.target.closest('[data-kw]'))) { $('#q').value = el.dataset.kw; go('papers', {}); return; }
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
        title: (s.kind === 'oral' ? 'Oral Session ' : 'Poster Session ') + s.num + ' — ' + s.name,
        desc: s.paperIds.map(function (x) { return x + ': ' + (IDX[x] ? IDX[x].title : ''); }).join('\n') }],
        s.id + '.ics');
      return;
    }
    if (e.target.closest('#ics-day')) {
      var day = +(route.params.day || 1);
      var evs = DATA.sessions.filter(function (s) { return s.day === day; }).map(function (s) {
        return { uid: s.id, date: s.date, time: s.time, room: s.room,
          title: (s.kind === 'oral' ? 'Oral Session ' : 'Poster Session ') + s.num + ' — ' + s.name,
          desc: s.paperIds.join(', ') };
      });
      downloadICS(evs, 'mamm2026-day' + day + '.ics');
      return;
    }
    if (e.target.closest('#ics-saved')) {
      downloadICS(saved.map(function (id) { return IDX[id]; }).filter(Boolean).map(function (p) {
        return { uid: p.id, date: p.date, time: p.time, room: p.room, title: p.id + ' — ' + p.title, desc: p.sessionName };
      }), 'mamm2026-my-programme.ics');
      return;
    }
    if (e.target.closest('#clear-saved')) { saved = []; STORE.set('saved', saved); render(); return; }
    if (e.target.closest('#share-qr')) { showQR(location.href, 'Scan to open this page'); return; }
    if (e.target.closest('#f-reset')) { $('#q').value = ''; go('papers', {}); return; }
  });

  // filter selects
  $('#view').addEventListener('change', function (e) {
    var id = e.target.id;
    if (!/^f-/.test(id)) return;
    var p = Object.assign({}, route.params);
    p[id.slice(2)] = e.target.value;
    go('papers', p);
  });

  // search
  var t = null;
  $('#q').addEventListener('input', function () {
    $('#q-clear').hidden = !$('#q').value;
    clearTimeout(t);
    t = setTimeout(function () {
      if (route.view !== 'papers') go('papers', {}); else render();
    }, 160);
  });
  $('#q-clear').addEventListener('click', function () {
    $('#q').value = ''; $('#q-clear').hidden = true; render(); $('#q').focus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== $('#q')) { e.preventDefault(); $('#q').focus(); }
    if (e.key === 'Escape') { closeQR(); }
  });

  // QR + theme
  $('#btn-qr').addEventListener('click', function () { showQR(location.href, 'Scan to open this page'); });
  $('#qr-close').addEventListener('click', closeQR);
  $('#modal').addEventListener('click', function (e) { if (e.target === $('#modal')) closeQR(); });
  $('#qr-copy').addEventListener('click', function () {
    var u = $('#modal').dataset.url;
    if (navigator.clipboard) navigator.clipboard.writeText(u);
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
    el.textContent = days === 1 ? 'starts tomorrow' : 'starts in ' + days + ' days';
  } else if (now <= end) {
    el.textContent = 'happening now';
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
  var th = STORE.get('theme', null);
  if (th) document.documentElement.dataset.theme = th;
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
  route = parseHash();
  $('#foot-note').textContent = data.papers.length + ' papers · ' + data.sessions.length + ' sessions · programme as of the proceedings file';
  countdown();
  wire();
  render();
}

fetch('program.json', { cache: 'no-cache' })
  .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(boot)
  .catch(function (err) {
    $('#view').innerHTML = '<div class="empty"><b>Could not load program.json</b>' +
      'If you opened this file directly from disk, browsers block the data file. ' +
      'Serve the folder over HTTP (for example <code>python3 -m http.server</code>) or publish it with GitHub Pages.<br><br>' +
      '<small>' + esc(err.message) + '</small></div>';
  });

})();
