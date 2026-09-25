# MAMM 2026 — Technical Programme (web version)

A mobile-first, searchable web version of the MAMM 2026 technical programme, generated from
`Proceedings MAMM_revise.docx`. Delegates scan a QR code and instantly look up **which paper is
presented when, in which room, in which session** — plus the full abstract of every paper.

**91 papers** · 62 oral in 10 sessions · 29 posters in 2 judged sessions · 3 rooms · 5–7 Nov 2026,
Sun Moon Lake Teachers' Hostel, Nantou, Taiwan.

---

## 1. Publish on GitHub Pages (≈2 minutes)

1. Create a repository, e.g. `mamm2026`.
2. Upload **everything in this folder** to the repository root (keep the folder structure):

   ```
   index.html
   qr.html
   checkin.html
   badges.html
   program.json
   robots.txt
   README.md
   .nojekyll
   assets/style.css
   assets/app.js
   assets/qrcode.js
   tools/build_program.py
   tools/pdf_program.py
   tools/apps-script/Code.gs
   .github/workflows/build-program.yml
   source/          <- the programme PDF and the Word proceedings file
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
| **Papers** | All papers. Full-text search + filters: **type** (oral / poster), **day**, **room**, **session**; sort by ID, time or title. |
| **Authors** | Every author A–Z with their papers. Tap a name to filter the programme down to that person. |
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

## 4. Updating the programme

Everything the site shows lives in `program.json`, generated from the files in `source/`:

| Source file | What it provides |
|---|---|
| `Technical.pdf` | the schedule — days, times, rooms, sessions, session chairs, keynote and invited speakers, and which paper is in which session |
| `Proceedings MAMM_revise.docx` | titles, authors, affiliations, abstracts, keywords, committees, preface |
| `extra-papers.json` *(optional)* | papers that are in the PDF but not yet in the Word file |

Never hand-edit `index.html` or `assets/app.js` to change programme content.

### Option A — automatic (recommended)

1. Replace the file(s) in **`source/`** with the new version(s).
2. Commit and push.
3. The **Rebuild programme data** workflow runs `tools/build_program.py`, commits the new
   `program.json`, and GitHub Pages redeploys.

Check the run under the repository's **Actions** tab; its log prints the report below.
You can also re-run it by hand from Actions → Rebuild programme data → *Run workflow*.

### Option B — on your own machine

```bash
pip install python-docx pdfplumber
python3 tools/build_program.py source/Technical.pdf "source/Proceedings MAMM_revise.docx"
git add program.json && git commit -m "Update programme" && git push
```

The two files can be given in either order; they are told apart by extension. Either one
alone also works: with only the `.docx` the schedule is read from the Word tables instead,
with only the `.pdf` the papers have no abstracts.

| Flag | Effect |
|---|---|
| `--check-only` | validate and print the report, write nothing |
| `-o PATH` | write the JSON somewhere else |
| `--extras PATH` | use a specific extra-papers file |
| `--keep-hyphens` | skip the de-hyphenation step |

### What the script prints

```
Schedule from : PDF
Abstracts from: Proceedings MAMM_revise.docx
Papers        : 91  (62 oral, 29 poster)
Sessions      : 10 oral, 2 poster
Unused IDs    : ID_87
AWAITING TITLE/ABSTRACT: ID_91, ID_92
No warnings.
```

Read the last two lines first. The script warns about a paper listed in two sessions, a
session with no papers or no readable time/room, an abstract in the Word file that is not
in the schedule, and missing keywords or authors. **Treat warnings as work to do in the
source documents**, not in the JSON — that keeps the documents and the website in agreement.

`AWAITING TITLE/ABSTRACT` lists papers the schedule contains but the Word file does not.
They still appear in the programme, marked *to be announced*.

### Filling in a paper before the Word file catches up

Copy `source/extra-papers.json.example` to `source/extra-papers.json` and put the real
title, authors, abstract and keywords there:

```json
{"papers": {"ID_91": {
  "title": "...",
  "authors": [{"name": "...", "affiliations": ["..."]}],
  "abstract": "...",
  "keywords": ["...", "..."]
}}}
```

Entries here override the Word file, so delete one once the Word file carries it.

### What the script expects in the sources

**In the PDF** — the programme table is reconstructed from its own ruling lines, so rows
that continue onto the next page are stitched back together and page order does not matter.
What must stay recognisable:

| Element | Pattern |
|---|---|
| Day header | a full-width row reading `MAMM 2026 - DAY 1 - 5 NOVEMBER 2026 (THURSDAY)` |
| Time | the first column, `09:20-10:50` (a `~` instead of `-` is fine) |
| Session | `Oral Session (1) - <name> (Room 1)` followed by `ID_01, ID_25, …` in the same cell |
| Chairs | `Session Chair: Dr. A & Dr. B` above the session name in that cell |
| Poster session | `Poster Session (1) - Day 1 - competition judging (Room 1) 10:50-11:10` in the right-hand column; repeat the block for a second time window |
| Rooms | columns 2, 3 and 4 are Room 1, Room 2, Room 3; the table must keep its A4-landscape width |

`python3 tools/pdf_program.py source/Technical.pdf` prints the reconstructed grid — the
quickest way to see why a parse went wrong.

**In the Word file** — abstracts are read from: Heading 1 `ID_07: <title>`, Heading 2 with
the author line, `Affiliation`-styled lines `1 <institution>`, then `Abstract`, the body,
and `Keywords: a, b, c`. Committees come from the ALL-CAPS headings and `_ Name, Affiliation`
lines before `ORGANIZED BY`.

Two things are hard-coded near the top of `tools/build_program.py` because the documents do
not state them: the conference title, venue and dates (`CONFERENCE`), and the poster-session
fallbacks used in Word-only mode (`POSTER_TIME`, `POSTER_ROOM`). `KEEP_HYPHENATED` lists
compounds that must not be merged when the script rejoins words broken by Word's justified
hyphenation (`sys-tem` → `system`); if the report shows a word that should have kept its
hyphen, add it there and re-run.

### Small edits without rebuilding

`program.json` is plain JSON and can be edited directly for a one-off change — but the next
rebuild overwrites it, so anything worth keeping belongs in the source documents (or in
`extra-papers.json`). Validate with `python3 -m json.tool program.json > /dev/null` before
committing. The site requests `program.json` with `cache: no-cache`, so delegates get the
update on their next page load — the QR code and every link stay the same.

## 5. Meal & banquet check-in (organisers only)

Two extra pages ship with the site. Neither is linked from the programme and both are excluded in
`robots.txt`, so delegates will not stumble into them.

| Page | For |
|---|---|
| `checkin.html` | volunteers at the dining-room door: scan a badge, see green / red / amber, hand over the meal |
| `badges.html` | printing name badges with each delegate's QR code, eight per A4 page |

They talk to a **Google Sheet** through a small Apps Script web app, so several phones and tablets
share one live state and the organisers watch it fill up in the spreadsheet. Setup takes about
twenty minutes and is written out in **`tools/apps-script/README.md`**; the script itself is
`tools/apps-script/Code.gs`, and `source/delegates-template.csv` shows the columns the delegate
list needs.

**Do not put the delegate list in this repository.** It stays in the Google Sheet. Names, e-mail
addresses and institutions of everyone attending do not belong in a public repo.

What the volunteer sees, at a glance:

- **green** — hand it over. Name, institution and any dietary note in large type.
- **red** — already collected, with the time and the station that served it.
- **amber** — not registered for this meal; two override buttons (*paid at the door*,
  *approved by organiser*) that write the reason into the log.
- **grey** — code not recognised; jumps to search-by-name.

Every screen has **Undo** for a few seconds, the **Board** tab shows served / entitled per meal for
the kitchen, and the whole thing keeps working offline and syncs when the Wi-Fi comes back.

## 6. Preview locally

`index.html` fetches `program.json`, so opening the file directly with `file://` will not work.
Serve the folder over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

---

## 7. Notes on how the data was produced

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
