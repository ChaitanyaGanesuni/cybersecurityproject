# Content sources & provenance

Every text field in the dataset carries a `sourceId` that resolves to one of the entries
below. This file is the human-readable record of *where each thing came from* and *under what
license we may use it*. **No content is authored or invented by us or by an AI at ingest time.**

## Upstream dataset

- **`gita/gita`** — https://github.com/gita/gita
  - License: **Unlicense** (public-domain dedication). A verbatim copy of the raw source files
    we consume lives in `raw/` for reproducible, offline builds.
  - We consume: `verse.json` (Sanskrit + transliteration + word meanings), `translation.json`
    (English translations, keyed by author id), `chapters.json` (chapter metadata),
    `authors.json` (author id → name).

## Source registry (as emitted into the dataset)

| sourceId | title | author | year | license | provides | notes |
|---|---|---|---|---|---|---|
| `sanskrit-classical` | Bhagavad Gita (Sanskrit) | (ancient) | — | public-domain | sanskrit | The verse text is an ancient work, unambiguously public domain. |
| `gita-gita-editorial` | gita/gita editorial content | gita/gita contributors | — | Unlicense | transliteration, explanation | Romanization, word meanings, and chapter summaries from the Unlicense-dedicated dataset. |
| `purohit-swami-1935` | The Geeta: The Gospel of the Lord Shri Krishna | Shri Purohit Swami | 1935 | public-domain | translation | Author d. **1941**. Public domain in life+60 (India, source country: PD since ~2002) and life+70 jurisdictions (PD since 2012). Chosen as the shippable English translation for this reason. |

### Why Purohit Swami for the English translation

The upstream dataset offers five English translators (Sivananda, Adidevananda, Gambirananda,
Sankaranarayan, Purohit Swami). **Purohit Swami (1882–1941) is the earliest**, which makes his
translation the safest public-domain choice. The others are 20th-century authors whose works may
still be under copyright in life+70 jurisdictions, so we do **not** ship them. The schema supports
adding more translations later (per-row `sourceId`), so a properly-licensed modern translation can
be dropped in without any code change.

## Not yet included (honest gaps — no fabrication)

- **Telugu translation.** The upstream dataset has only English + Hindi. Telugu will be added from
  a separately-verified public-domain (or licensed) Telugu source in a later pass. Until then the
  app simply has no Telugu translation to show, rather than an invented one.
- **AI explanations / practical application / simple & deeper meaning.** These are AI-derived
  fields. They are left empty at ingest and generated at runtime by the AI service (Phase 6),
  always tagged `contentType: "ai"` and visually marked as such.
- **Classical commentaries** (Shankaracharya, Ramanuja, …) are public domain and can be ingested
  later; deferred to keep Phase 2 focused.

## Verse counting note

This dataset contains **701** verse rows. The commonly cited total is 700; the difference is the
well-known counting convention around Chapter 13 (34 vs 35 verses). We ingest the source's numbering
verbatim and do not renumber or drop verses.
