/**
 * MAMM 2026 — meal & banquet check-in backend.
 *
 * Paste this into the Apps Script editor of the Google Sheet that holds the
 * delegate list, then Deploy → New deployment → Web app
 *   Execute as       : Me
 *   Who has access   : Anyone
 * and copy the /exec URL into the check-in app's Settings screen.
 *
 * The deployment URL is public, so every request must carry the staff PIN
 * from the Config sheet. Treat that PIN as the door key: give it only to the
 * volunteers on duty, and change it in the Config sheet if it leaks.
 *
 * Sheets used (created for you by "MAMM 2026 → Set up sheets"):
 *   Delegates  id | name | affiliation | email | lunch_d1 | lunch_d2 | banquet | diet | note | token
 *   Status     id | name | lunch_d1 | lunch_d2 | banquet          (who has collected what)
 *   Log        timestamp | id | name | meal | action | station | staff | note   (append-only audit trail)
 *   Config     key | value                                         (pin, event)
 */

var VERSION = '1.0';

var MEALS = [
  { id: 'lunch_d1', label: 'Lunch — Day 1 (5 Nov)' },
  { id: 'lunch_d2', label: 'Lunch — Day 2 (6 Nov)' },
  { id: 'banquet',  label: 'Banquet (5 Nov, 18:00)' }
];

var SH_DELEGATES = 'Delegates';
var SH_STATUS    = 'Status';
var SH_LOG       = 'Log';
var SH_CONFIG    = 'Config';

var DELEGATE_HEADERS = ['id', 'name', 'affiliation', 'email',
                        'lunch_d1', 'lunch_d2', 'banquet', 'diet', 'note', 'token'];

/* ------------------------------------------------------------------ setup */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MAMM 2026')
    .addItem('Set up sheets', 'setupSheets')
    .addItem('Generate missing badge tokens', 'generateTokens')
    .addItem('Rebuild Status sheet from Log', 'rebuildStatus')
    .addToUi();
}

function setupSheets() {
  var ss = SpreadsheetApp.getActive();

  var d = ss.getSheetByName(SH_DELEGATES) || ss.insertSheet(SH_DELEGATES);
  if (d.getLastRow() === 0) {
    d.appendRow(DELEGATE_HEADERS);
    d.appendRow(['D001', 'Example Delegate', 'National Chung Hsing University',
                 'example@nchu.edu.tw', 'Y', 'Y', 'Y', '', '', '']);
  }
  d.setFrozenRows(1);

  var st = ss.getSheetByName(SH_STATUS) || ss.insertSheet(SH_STATUS);
  if (st.getLastRow() === 0) {
    st.appendRow(['id', 'name'].concat(MEALS.map(function (m) { return m.id; })));
  }
  st.setFrozenRows(1);

  var lg = ss.getSheetByName(SH_LOG) || ss.insertSheet(SH_LOG);
  if (lg.getLastRow() === 0) {
    lg.appendRow(['timestamp', 'id', 'name', 'meal', 'action', 'station', 'staff', 'note']);
  }
  lg.setFrozenRows(1);

  var cf = ss.getSheetByName(SH_CONFIG) || ss.insertSheet(SH_CONFIG);
  if (cf.getLastRow() === 0) {
    cf.appendRow(['key', 'value']);
    cf.appendRow(['pin', String(Math.floor(100000 + Math.random() * 900000))]);
    cf.appendRow(['event', 'MAMM 2026']);
  }
  cf.setFrozenRows(1);

  syncStatusRows_();
  SpreadsheetApp.getUi().alert(
    'Sheets are ready.\n\nStaff PIN: ' + getConfig_('pin') +
    '\n\nFill in the Delegates sheet, then run "Generate missing badge tokens".');
}

/** Short badge token, ambiguous characters left out on purpose. */
function newToken_() {
  var A = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  var s = '';
  for (var i = 0; i < 4; i++) s += A.charAt(Math.floor(Math.random() * A.length));
  return 'M26-' + s;
}

function generateTokens() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH_DELEGATES);
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var col = DELEGATE_HEADERS.indexOf('token') + 1;
  var vals = sh.getRange(2, col, n, 1).getValues();
  var used = {};
  vals.forEach(function (r) { if (r[0]) used[String(r[0]).trim()] = true; });
  var made = 0;
  for (var i = 0; i < n; i++) {
    if (vals[i][0]) continue;
    var t;
    do { t = newToken_(); } while (used[t]);
    used[t] = true;
    vals[i][0] = t;
    made++;
  }
  sh.getRange(2, col, n, 1).setValues(vals);
  syncStatusRows_();
  SpreadsheetApp.getUi().alert(made + ' new token(s) generated.');
}

/* ------------------------------------------------------------- data access */

function getConfig_(key) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH_CONFIG);
  if (!sh || sh.getLastRow() < 2) return '';
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === key) return String(v[i][1]).trim();
  }
  return '';
}

function truthy_(v) {
  var s = String(v).trim().toLowerCase();
  return s === 'y' || s === 'yes' || s === '1' || s === 'true' || s === 'x' || s === 'co' || s === 'có';
}

function readDelegates_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH_DELEGATES);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, DELEGATE_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!String(r[0]).trim() && !String(r[1]).trim()) continue;
    var ent = {};
    MEALS.forEach(function (m, k) { ent[m.id] = truthy_(r[4 + k]); });
    out.push({
      row: i + 2,
      id: String(r[0]).trim(),
      name: String(r[1]).trim(),
      affiliation: String(r[2]).trim(),
      diet: String(r[7]).trim(),
      note: String(r[8]).trim(),
      token: String(r[9]).trim(),
      ent: ent
    });
  }
  return out;
}

/** Keep one Status row per delegate, in the same order as Delegates. */
function syncStatusRows_() {
  var ss = SpreadsheetApp.getActive();
  var st = ss.getSheetByName(SH_STATUS);
  var dele = readDelegates_();
  var have = {};
  if (st.getLastRow() > 1) {
    var cur = st.getRange(2, 1, st.getLastRow() - 1, 1).getValues();
    cur.forEach(function (r, i) { have[String(r[0]).trim()] = i + 2; });
  }
  var add = [];
  dele.forEach(function (d) {
    if (!have[d.id]) add.push([d.id, d.name, '', '', '']);
  });
  if (add.length) st.getRange(st.getLastRow() + 1, 1, add.length, 5).setValues(add);
  return statusMap_();
}

function statusMap_() {
  var st = SpreadsheetApp.getActive().getSheetByName(SH_STATUS);
  var map = {};
  if (!st || st.getLastRow() < 2) return map;
  var v = st.getRange(2, 1, st.getLastRow() - 1, 5).getValues();
  for (var i = 0; i < v.length; i++) {
    var id = String(v[i][0]).trim();
    if (!id) continue;
    map[id] = { row: i + 2, lunch_d1: String(v[i][2]), lunch_d2: String(v[i][3]), banquet: String(v[i][4]) };
  }
  return map;
}

function mealCol_(mealId) {
  var i = MEALS.map(function (m) { return m.id; }).indexOf(mealId);
  return i < 0 ? 0 : 3 + i;          // Status: id(1) name(2) then the meals
}

function log_(id, name, meal, action, station, staff, note) {
  SpreadsheetApp.getActive().getSheetByName(SH_LOG)
    .appendRow([new Date(), id, name, meal, action, station || '', staff || '', note || '']);
}

/* ---------------------------------------------------------------- handlers */

function ping_() {
  return { ok: true, version: VERSION, event: getConfig_('event') || 'MAMM 2026', meals: MEALS };
}

function roster_() {
  var dele = readDelegates_();
  syncStatusRows_();
  var st = statusMap_();
  return {
    ok: true,
    meals: MEALS,
    serverTs: new Date().toISOString(),
    delegates: dele.map(function (d) {
      var s = st[d.id] || {};
      return {
        id: d.id, name: d.name, affiliation: d.affiliation, diet: d.diet, note: d.note,
        token: d.token, ent: d.ent,
        taken: { lunch_d1: s.lunch_d1 || '', lunch_d2: s.lunch_d2 || '', banquet: s.banquet || '' }
      };
    })
  };
}

function stats_() {
  var dele = readDelegates_();
  var st = statusMap_();
  return {
    ok: true,
    serverTs: new Date().toISOString(),
    meals: MEALS.map(function (m) {
      var entitled = 0, issued = 0;
      dele.forEach(function (d) {
        if (d.ent[m.id]) entitled++;
        var s = st[d.id];
        if (s && s[m.id]) issued++;
      });
      return { id: m.id, label: m.label, entitled: entitled, issued: issued };
    })
  };
}

function findDelegate_(key) {
  var k = String(key || '').trim().toUpperCase();
  if (!k) return null;
  var dele = readDelegates_();
  for (var i = 0; i < dele.length; i++) {
    if (dele[i].token.toUpperCase() === k || dele[i].id.toUpperCase() === k) return dele[i];
  }
  return null;
}

function checkin_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = findDelegate_(p.key);
    if (!d) return { ok: true, status: 'unknown', key: p.key };

    var meal = String(p.meal || '');
    if (mealCol_(meal) === 0) return { ok: false, error: 'unknown meal: ' + meal };

    syncStatusRows_();
    var st = statusMap_()[d.id];
    var prev = st ? String(st[meal] || '') : '';

    var payload = {
      ok: true, delegate: {
        id: d.id, name: d.name, affiliation: d.affiliation,
        diet: d.diet, note: d.note, ent: d.ent
      }
    };

    if (prev) {
      payload.status = 'duplicate';
      payload.previous = prev;
      log_(d.id, d.name, meal, 'refused-duplicate', p.station, p.staff, prev);
      return payload;
    }
    if (!d.ent[meal] && !p.override) {
      payload.status = 'not_entitled';
      log_(d.id, d.name, meal, 'refused-not-entitled', p.station, p.staff, '');
      return payload;
    }

    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm') +
                ' · ' + (p.station || 'station');
    var sh = SpreadsheetApp.getActive().getSheetByName(SH_STATUS);
    sh.getRange(statusMap_()[d.id].row, mealCol_(meal)).setValue(stamp);
    log_(d.id, d.name, meal, p.override ? 'issued-override' : 'issued',
         p.station, p.staff, p.override ? ('override: ' + (p.reason || '')) : '');

    payload.status = p.override ? 'issued_override' : 'issued';
    payload.stamp = stamp;
    return payload;
  } finally {
    lock.releaseLock();
  }
}

function undo_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = findDelegate_(p.key);
    if (!d) return { ok: true, status: 'unknown' };
    var meal = String(p.meal || '');
    if (mealCol_(meal) === 0) return { ok: false, error: 'unknown meal' };
    var st = statusMap_()[d.id];
    if (st) {
      SpreadsheetApp.getActive().getSheetByName(SH_STATUS)
        .getRange(st.row, mealCol_(meal)).setValue('');
    }
    log_(d.id, d.name, meal, 'undo', p.station, p.staff, '');
    return { ok: true, status: 'undone', delegate: { id: d.id, name: d.name } };
  } finally {
    lock.releaseLock();
  }
}

function walkin_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(SH_DELEGATES);
    var id = 'W' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HHmmss');
    var token = newToken_();
    var meals = p.meals || [];
    sh.appendRow([id, String(p.name || '').trim(), String(p.affiliation || '').trim(), '',
                  meals.indexOf('lunch_d1') >= 0 ? 'Y' : 'N',
                  meals.indexOf('lunch_d2') >= 0 ? 'Y' : 'N',
                  meals.indexOf('banquet') >= 0 ? 'Y' : 'N',
                  String(p.diet || ''), 'walk-in added at ' + (p.station || ''), token]);
    syncStatusRows_();
    log_(id, p.name, '', 'walk-in', p.station, p.staff, '');
    return { ok: true, delegate: { id: id, name: p.name, token: token } };
  } finally {
    lock.releaseLock();
  }
}

/* --------------------------------------------------------------- dispatch */

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handle_(p) {
  var action = String(p.action || 'ping');
  if (action === 'ping') return ping_();

  if (String(p.pin || '') !== String(getConfig_('pin'))) {
    return { ok: false, error: 'bad_pin' };
  }
  switch (action) {
    case 'roster':  return roster_();
    case 'stats':   return stats_();
    case 'checkin': return checkin_(p);
    case 'undo':    return undo_(p);
    case 'walkin':  return walkin_(p);
    default:        return { ok: false, error: 'unknown action: ' + action };
  }
}

function doGet(e) {
  try {
    return respond_(handle_(e.parameter || {}));
  } catch (err) {
    return respond_({ ok: false, error: String(err) });
  }
}

/**
 * The check-in app posts text/plain so the browser sends no CORS preflight,
 * which Apps Script web apps cannot answer.
 */
function doPost(e) {
  try {
    var p = {};
    if (e.postData && e.postData.contents) {
      p = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      p = e.parameter;
    }
    return respond_(handle_(p));
  } catch (err) {
    return respond_({ ok: false, error: String(err) });
  }
}

/** Rebuild Status from the Log, e.g. after editing the Delegates sheet by hand. */
function rebuildStatus() {
  var ss = SpreadsheetApp.getActive();
  var st = ss.getSheetByName(SH_STATUS);
  if (st.getLastRow() > 1) st.getRange(2, 3, st.getLastRow() - 1, 3).clearContent();
  syncStatusRows_();
  var map = statusMap_();
  var lg = ss.getSheetByName(SH_LOG);
  if (lg.getLastRow() < 2) return;
  var rows = lg.getRange(2, 1, lg.getLastRow() - 1, 8).getValues();
  rows.forEach(function (r) {
    var id = String(r[1]).trim(), meal = String(r[3]).trim(), action = String(r[4]).trim();
    if (!map[id] || mealCol_(meal) === 0) return;
    if (action.indexOf('issued') === 0) {
      var stamp = Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), 'HH:mm') +
                  ' · ' + String(r[5] || 'station');
      st.getRange(map[id].row, mealCol_(meal)).setValue(stamp);
    } else if (action === 'undo') {
      st.getRange(map[id].row, mealCol_(meal)).setValue('');
    }
  });
  SpreadsheetApp.getUi().alert('Status rebuilt from the Log.');
}
