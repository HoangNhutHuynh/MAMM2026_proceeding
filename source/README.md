Programme sources. The website's `program.json` is generated from whatever is here.

| File | What it provides |
|---|---|
| `Proceedings MAMM_revise.docx` | everything: schedule tables, sessions and chairs, keynote/invited talks, paper titles, authors, affiliations, abstracts, keywords, committees, preface |
| `Technical.pdf` *(fallback)* | the schedule, read only if the Word file has no schedule tables |
| `extra-papers.json` *(optional)* | fills in papers that are in the PDF but not yet in the Word file — see `extra-papers.json.example` |

Push a change here and the **Rebuild programme data** GitHub Action regenerates
`program.json` and commits it; GitHub Pages then redeploys on its own.

When the Word file contains the day and session tables it is the single source of
truth and the PDF is ignored. Keep at most one `.pdf` and one `.docx` here.

To rebuild by hand:

```bash
pip install python-docx pdfplumber
python3 tools/build_program.py source/Technical.pdf "source/Proceedings MAMM_revise.docx"
```
