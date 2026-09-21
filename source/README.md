Put the current Word proceedings file (`*.docx`) here.

Pushing a new `.docx` to this folder triggers the **Rebuild programme data**
GitHub Action, which regenerates `program.json` and commits it, after which
GitHub Pages redeploys the site automatically.

Keep only one `.docx` here — the workflow builds from the first one it finds.
