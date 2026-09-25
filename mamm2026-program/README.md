# MAMM 2026 — Technical Programme (web version)

A mobile-first, searchable web version of the MAMM 2026 technical programme, generated from
`Proceedings MAMM_revise.docx`. Delegates scan a QR code and instantly look up **which paper is
presented when, in which room, in which session** — plus the full abstract of every paper.

**89 papers** · 56 oral in 9 sessions · 33 posters in 2 judged sessions · 3 rooms · 5–7 Nov 2026,
Sun Moon Lake Teachers' Hostel, Nantou, Taiwan.

---

## 1. Publish on GitHub Pages (≈2 minutes)

1. Create a repository, e.g. `mamm2026`.
2. Upload **everything in this folder** to the repository root (keep the folder structure):

   ```
   index.html
   qr.html
   program.json
   README.md
   .nojekyll
   assets/style.css
   assets/app.js
   assets/qrcode.js
   ```

3. In the repository: **Settings → Pages → Build and deployment**
   → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → **Save**.
4. After a minute the site is live at
   `https://<your-account>.github.io/mamm2026/`

> `.nojekyll` is required — without it GitHub may ignore files and folders in some setups.
> Do not rename `program.json`; `index.html` loads it at runtime.

### Custom domain (optional)
Add a file named `CNAME` containing e.g. `program.mamm2026.org`, then point a CNAME DNS record
at `<your-account>.github.io`.

---

## 2. The QR code for delegates

Open **`qr.html`** in a browser (it is deliberately *not* linked from the attendee site).

- Paste the published address (e.g. `https://your-account.github.io/mamm2026/`).
- Press **Print / Save as PDF** for a ready-to-print A4 poster, or **Download QR (SVG)** to drop
  the code into the programme booklet, name badges, the banner or room signage.
- Choose error-correction **Q** or **H** if the code will be printed small or may get scuffed.

Every page of the site also has a **QR** button in the header: it encodes *the page you are
currently on*. A session chair can therefore show the QR of their own session, and an author
can share a QR that opens their own paper.

---

## 3. What delegates can do

| Tab | What it does |
|---|---|
| **Schedule** | The three-day grid. Day selector, colour-coded by room. Tap any session to see its papers. |
| **Papers** | All 89 papers. Full-text search + filters: **type** (oral / poster), **day**, **room**, **session**; sort by ID, time or title. |
| **Rooms** | Everything that happens in Room 1 / 2 / 3, hour by hour. |
| **My programme** | Papers starred with ☆, stored in the delegate's own browser. Export to `.ics`, or print. |
| **Info** | Venue, Day 3 excursion, programme notes, preface, organisers, committees. |

Other details:

- **Search** covers paper IDs, titles, all author names, affiliations, keywords **and full
  abstract text**. Terms are AND-combined and accent-insensitive; matches are highlighted.
  Press `/` to jump to the search box.
- **Deep links** — every paper and session has its own address, e.g.
  `…/#/paper/ID_47` and `…/#/session/OS5`. Filtered views are linkable too:
  `…/#/papers?type=poster&day=2`.
- **Add to calendar** — `.ics` download for a single paper, a whole session, a whole day, or the
  delegate's starred list. Times are written in UTC from Taipei local time (UTC+8).
- **Dark mode**, **print stylesheet**, works offline after first load except for `program.json`.
- No tracking, no cookies, no backend. Starred papers live in `localStorage` only.

---

## 4. Editing the programme later

All content lives in **`program.json`** — no need to touch the HTML or JavaScript.

```jsonc
{
  "conference": { "name": "MAMM 2026", "venue": "...", "preface": ["..."] },
  "days":     [ { "day": 1, "date": "2026-11-05", "title": "...",
                  "slots": [ { "time": "09:20-10:50", "room": "Room 1", "text": "Oral Session (1) - ..." } ] } ],
  "sessions": [ { "id": "OS1", "kind": "oral", "num": 1, "name": "...", "chairs": null,
                  "day": 1, "date": "2026-11-05", "time": "09:20-10:50", "room": "Room 1",
                  "paperIds": ["ID_01", "..."] } ],
  "papers":   [ { "id": "ID_01", "title": "...", "authors": [ { "name": "...", "affiliations": ["..."] } ],
                  "abstract": "...", "keywords": ["..."], "type": "oral",
                  "sessionId": "OS1", "day": 1, "time": "09:20-10:50", "room": "Room 1" } ],
  "committees": [ ... ],
  "notes": [ ... ]
}
```

Common edits:

- **Announce a keynote speaker** → in `days[].slots[]`, replace
  `"Keynote Speech (1) - Speaker: To be announced (Room 1)"` with the real name.
  The schedule grid renders `text` directly.
- **Move a paper to another session** → change the paper's `sessionId`, `day`, `time`, `room`,
  `sessionName`, and move its ID in the session's `paperIds`.
- **Change a session time** → edit it in `sessions[]` *and* in the matching `days[].slots[]` entry,
  and in each of that session's papers (`time` is copied onto every paper for fast filtering).
- **Remove the provisional flag** → set `"provisional": false` on the paper (currently `ID_34`,
  `ID_49`, `ID_71`).

Validate the file after editing (`python3 -m json.tool program.json > /dev/null`), commit, and
GitHub Pages redeploys automatically. The site sends `cache: no-cache` for `program.json`, so
delegates see the update on their next page load.

---

## 5. Preview locally

`index.html` fetches `program.json`, so opening the file directly with `file://` will not work.
Serve the folder over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

---

## 6. Notes on how the data was produced

- Source: `Proceedings MAMM_revise.docx` (technical programme + abstracts).
- Speaker biography pages (keynote / invited speaker profiles) were **excluded** on request.
  Their time slots are kept in the schedule.
- Session paper lists were cross-checked against the document's own *ORAL Presentation List* and
  *POSTER Presentation List* summary tables — all 11 lists match exactly.
- The document contains IDs `ID_01`–`ID_90` with **no `ID_87`**; 89 papers in total.
- E-mail addresses and phone numbers that appeared in the author/affiliation fields of a few
  entries were removed before publication.
- Words broken by Word's justified hyphenation (e.g. `sys-tem`, `find-ings`) were rejoined in the
  abstracts; genuine compounds such as `non-invasive` and `pre-clinical` were preserved.

## Licence

Programme content © the MAMM 2026 organisers and the respective authors.
`assets/qrcode.js` is [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
by Kazuhiko Arase, MIT licence.
