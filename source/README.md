Programme sources. The website's `program.json` is generated from whatever is here.

| File | What it provides |
|---|---|
| `Technical.pdf` | the schedule: days, times, rooms, sessions, session chairs, keynote and invited speakers, and which paper is in which session |
| `Proceedings MAMM_revise.docx` | paper titles, authors, affiliations, abstracts, keywords, committees, preface |
| `extra-papers.json` *(optional)* | fills in papers that are in the PDF but not yet in the Word file — see `extra-papers.json.example` |

Push a change here and the **Rebuild programme data** GitHub Action regenerates
`program.json` and commits it; GitHub Pages then redeploys on its own.

Keep one `.pdf` and one `.docx`. With only the `.docx`, the schedule is read from
the Word tables instead. With only the `.pdf`, papers have no abstracts.

To rebuild by hand:

```bash
pip install python-docx pdfplumber
python3 tools/build_program.py source/Technical.pdf "source/Proceedings MAMM_revise.docx"
```
