# Ruoshi's arXiv Daily Reader

Static GitHub Pages reader for `cond-mat.str-el` and `cond-mat.supr-con`.

The page reads `data/papers.js`. The archive is refreshed by
`.github/workflows/update-arxiv.yml` every day at 09:00 Europe/London, with a
manual `workflow_dispatch` button for immediate updates.

To refresh locally:

```bash
node scripts/update_arxiv.mjs
```

To backfill a visible date from the current arXiv recent pages:

```bash
node scripts/update_arxiv.mjs --date 2026-05-08
```
