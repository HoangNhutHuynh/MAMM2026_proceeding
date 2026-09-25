# -*- coding: utf-8 -*-
"""
Read the MAMM technical-program PDF (the one-page-per-half-day landscape table)
and return its schedule, sessions and paper-to-session assignment.

The table is reconstructed from the PDF's own ruling lines, so a row that
continues onto the next page is stitched back together. Nothing depends on
page numbers or on text order.

Used by build_program.py; not meant to be run on its own, but

    python3 tools/pdf_program.py Technical.pdf

prints the reconstructed grid, which is the quickest way to see why a parse
went wrong.
"""
import re
import sys

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

# Column edges of the programme table, in PDF points. The table is the same
# width on every page; snapping to these makes the columns stable.
XB = [72.0, 157.0, 288.0, 416.0, 526.0, 603.0, 721.0]
COL_ROOM = {(1, 2): 'Room 1', (2, 3): 'Room 2', (3, 4): 'Room 3'}

RE_DAY = re.compile(r'MAMM\s*\d{4}\s*-\s*DAY\s*(\d)\s*-\s*(.+)', re.I)
RE_TIME = re.compile(r'^\s*(\d{1,2}:\d{2})\s*[-~–]\s*(\d{1,2}:\d{2})?\s*$')
RE_SESSION = re.compile(r'(Oral|Poster)\s+Session\s*\((\d+)\)\s*[-–]?\s*', re.I)
RE_CHAIR = re.compile(r'Session\s+Chairs?\s*:\s*(.*?)\s*(?=(?:Oral|Poster)\s+Session|$)', re.I | re.S)
RE_ID = re.compile(r'ID_(\d+)')
RE_ROOM = re.compile(r'\(\s*Rooms?\s*([0-9][0-9,\s&]*)\)', re.I)
RE_INNER_TIME = re.compile(r'(\d{1,2}:\d{2})\s*[-~–]\s*(\d{1,2}:\d{2})')
RE_ONLY_IDS = re.compile(r'^[\s,]*(?:ID_\d+[\s,]*)+$')


def norm_time(t):
    """'11:55~12:25' and en-dashes -> '11:55-12:25'."""
    t = re.sub(r'\s*[~\u2013\u2014-]\s*', '-', (t or '').strip())
    return re.sub(r'-+$', '-', t)

DAY_DATE = {1: '2026-11-05', 2: '2026-11-06', 3: '2026-11-07'}


def _snap(x, tol=6.0):
    best = min(XB, key=lambda b: abs(b - x))
    return best if abs(best - x) <= tol else None


def read_grid(path):
    """[(page, y, [(col_from, col_to, text), ...]), ...] in document order."""
    if pdfplumber is None:
        sys.exit('pdfplumber is required to read a PDF programme:  pip install pdfplumber')
    rows = []
    with pdfplumber.open(path) as pdf:
        for pi, pg in enumerate(pdf.pages):
            hs = sorted(set(round(e['top'], 1) for e in pg.edges if e['orientation'] == 'h'))
            ys = []
            for y in hs:
                if not ys or y - ys[-1] > 2:
                    ys.append(y)
            if len(ys) < 2:
                continue
            vs = [e for e in pg.edges if e['orientation'] == 'v']
            words = pg.extract_words(use_text_flow=False, keep_blank_chars=False)
            for y0, y1 in zip(ys, ys[1:]):
                if y1 - y0 < 4:
                    continue
                xs = set()
                for e in vs:
                    if e['top'] <= y0 + 3 and e['bottom'] >= y1 - 3:
                        s = _snap(e['x0'])
                        if s is not None:
                            xs.add(s)
                xs = sorted(xs)
                if len(xs) < 2:
                    xs = [XB[0], XB[-1]]
                if xs[0] > XB[0]:
                    xs.insert(0, XB[0])
                if xs[-1] < XB[-1]:
                    xs.append(XB[-1])
                cells = []
                for a, b in zip(xs, xs[1:]):
                    ws = [w for w in words
                          if y0 <= (w['top'] + w['bottom']) / 2.0 < y1
                          and a - 2 <= (w['x0'] + w['x1']) / 2.0 < b + 2]
                    ws.sort(key=lambda w: (round(w['top'] / 4.0), w['x0']))
                    cells.append((XB.index(a), XB.index(b),
                                  re.sub(r'\s+', ' ', ' '.join(w['text'] for w in ws)).strip()))
                if any(c[2] for c in cells):
                    rows.append((pi, y0, cells))
    return rows


def logical_rows(grid):
    """Stitch continuation bands (no time cell) onto the row above, by column."""
    out = []
    for _, _, cells in grid:
        time = ''
        for a, b, t in cells:
            if a == 0 and b == 1:
                time = t
        header = any(a == 0 and b == len(XB) - 1 and t for a, b, t in cells)
        if header or RE_TIME.match(time or ''):
            out.append({'time': time.strip(), 'cells': dict(((a, b), t) for a, b, t in cells if t)})
        elif out:
            for a, b, t in cells:
                if not t:
                    continue
                key = (a, b)
                prev = out[-1]['cells']
                prev[key] = (prev.get(key, '') + ' ' + t).strip()
        else:
            out.append({'time': '', 'cells': dict(((a, b), t) for a, b, t in cells if t)})
    return out


def _room_from(text, fallback):
    m = RE_ROOM.search(text)
    if m:
        nums = re.findall(r'\d', m.group(1))
        if len(nums) == 1:
            return 'Room ' + nums[0]
        if len(nums) > 1:
            return 'Rooms ' + ', '.join(nums[:-1]) + ' & ' + nums[-1]
    if re.search(r'Outside\s+Room\s*1', text, re.I):
        return 'Outside Room 1'
    return fallback


def _tidy(text):
    """Normalise one schedule cell into one or more display lines."""
    t = re.sub(r'\s+', ' ', text).strip(' -\u2013')
    # "Invited Speech (3) Dr. X" -> "Invited Speech (3) - Dr. X"
    t = re.sub(r'(Invited Speech(?: \(\d+\))?)\s+(?=(?:Dr\.|Prof\.))', '\\1 \u2013 ', t)
    t = re.sub(r'\s*\u2013\s*\(', ' (', t)
    # an invited speech and an ISET session sharing one cell become two lines
    m = re.match(r'^(Invited Speech.*?)\s+(Session for ISET.*)$', t)
    if m:
        return [m.group(1).strip(' -\u2013'), m.group(2).strip(' -\u2013')]
    return [t] if t else []


def _clean_name(raw):
    raw = RE_ID.sub('', raw)
    raw = RE_ROOM.sub('', raw)
    raw = re.sub(r'\bID\b', '', raw)
    raw = re.sub(r'[\s,]+$', '', raw)
    raw = re.sub(r'\s+', ' ', raw).strip(' -–,')
    return raw


def parse(path, warn=lambda m: None):
    grid = read_grid(path)
    if not grid:
        sys.exit('Could not read any table from the PDF. Is it the technical-program table?')
    rows = logical_rows(grid)

    days, sessions = [], {}
    cur_day = None
    pending_invited = {}      # column -> index of row whose "Invited Speech -" needs a name

    for ri, row in enumerate(rows):
        cells = row['cells']

        head = cells.get((0, len(XB) - 1), '')
        m = RE_DAY.search(head)
        if m:
            n = int(m.group(1))
            cur_day = {'day': n, 'date': DAY_DATE.get(n),
                       'title': re.sub(r'\s+', ' ', head).strip(), 'slots': []}
            days.append(cur_day)
            continue
        if cur_day is None:
            continue

        time = norm_time(row['time'])

        for (a, b), text in sorted(cells.items()):
            if a == 0 or (a, b) == (4, 5):
                continue

            sidebar = (a, b) == (5, 6)
            default_room = COL_ROOM.get((a, b), 'All')
            if (a, b) == (1, 4):
                default_room = _room_from(text, cells.get((4, 5), 'All'))
                if default_room in ('Location', ''):
                    default_room = 'All'

            ms = RE_SESSION.search(text)
            if ms:
                kind = 'oral' if ms.group(1).lower() == 'oral' else 'poster'
                num = int(ms.group(2))
                sid = ('OS' if kind == 'oral' else 'PS') + str(num)
                chair = RE_CHAIR.search(text)
                name = _clean_name(RE_INNER_TIME.sub('', text[ms.end():]))
                sub = name
                if kind == 'poster':
                    name = 'Poster Session %d' % num
                room = _room_from(text, default_room)
                own = RE_INNER_TIME.search(text[ms.end():])
                slot_time = norm_time('%s-%s' % own.groups()) if (sidebar and own) else time
                ids = ['ID_%02d' % int(x) for x in RE_ID.findall(text)]

                s = sessions.get(sid)
                if s is None:
                    s = sessions[sid] = {
                        'id': sid, 'kind': kind, 'num': num, 'name': name, 'subtitle': sub,
                        'chairs': chair.group(1).strip() if chair else None,
                        'day': cur_day['day'], 'date': cur_day['date'],
                        'times': [], 'room': room, 'paperIds': []}
                else:
                    if len(name) > len(s['name']):
                        s['name'] = name
                    if len(sub) > len(s.get('subtitle') or ''):
                        s['subtitle'] = sub
                    if chair and not s['chairs']:
                        s['chairs'] = chair.group(1).strip()
                if slot_time and slot_time not in s['times']:
                    s['times'].append(slot_time)
                for i in ids:
                    if i not in s['paperIds']:
                        s['paperIds'].append(i)

                label = ('Oral Session (%d) - %s (%s)' % (num, s['name'], room)
                         if kind == 'oral'
                         else 'Poster Session (%d) - %s (%s)' % (num, s['subtitle'], room))
                if not any(sl.get('sessionId') == sid for sl in cur_day['slots']):
                    cur_day['slots'].append({'time': slot_time or time, 'room': room,
                                             'text': label, 'sessionId': sid})
                continue

            if RE_ONLY_IDS.match(text):
                warn('PDF: a stray ID list "%s" had no session to attach to' % text[:40])
                continue

            # "Invited Speech -" whose speaker name sits in the row below
            if re.match(r'^Invited Speech\s*[–-]?\s*$', text):
                pending_invited[(a, b)] = len(cur_day['slots'])
                cur_day['slots'].append({'time': time, 'room': default_room, 'text': text})
                continue
            key = (a, b)
            if key in pending_invited:
                idx = pending_invited.pop(key)
                mname = re.match(r'^((?:Dr\.|Prof\.)?[^()]*?)\s*(?=Session|Oral|Poster|\()', text)
                nm = (mname.group(1).strip() if mname else '').strip()
                if nm:
                    cur_day['slots'][idx]['text'] = (cur_day['slots'][idx]['text'] + ' ' + nm).strip()
                    text = text[len(nm):].strip(' -–')
                if not text:
                    continue

            for piece in _tidy(text):
                cur_day['slots'].append({'time': time,
                                         'room': _room_from(piece, default_room),
                                         'text': piece})

    for s in sessions.values():
        s['time'] = ' / '.join(s.pop('times')) or ''
        if s['kind'] == 'poster':
            s['subtitle'] = re.sub(r'\s+', ' ', (s.get('subtitle') or '')).strip(' -\u2013')
        s['dateLabel'] = {1: '5 Nov', 2: '6 Nov', 3: '7 Nov'}.get(s['day'])
    out = sorted(sessions.values(), key=lambda s: (s['kind'] != 'oral', s['num']))

    # every slot that points at a session gets that session's final time
    for d in days:
        for sl in d['slots']:
            sid = sl.pop('sessionId', None)
            if sid and sessions[sid]['kind'] == 'poster':
                sl['time'] = sessions[sid]['time']
                sl['text'] = 'Poster Session (%d) - %s (%s)' % (
                    sessions[sid]['num'], sessions[sid]['subtitle'], sessions[sid]['room'])

    return {'days': days, 'sessions': out}


if __name__ == '__main__':
    for pi, y, cells in read_grid(sys.argv[1]):
        print('page %d  y=%.1f' % (pi, y))
        for a, b, t in cells:
            if t:
                print('    col %d-%d : %s' % (a, b, t))
