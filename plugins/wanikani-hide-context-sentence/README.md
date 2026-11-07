# WaniKani Hide Context Sentence

Hides the English context sentences on WaniKani lessons, reviews, vocabulary, and extra study pages until you hover over them.

Original script by Robin Findley. Adapted from [Greasy Fork](https://greasyfork.org/scripts/14844-wanikani-hide-context-sentence).

## Install

[Install](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-hide-context-sentence/wanikani-hide-context-sentence.user.js)

## Pages

- Lessons (`/subject-lessons/*`, `/subjects/*/lesson`)
- Reviews (`/subjects/review`)
- Vocabulary pages (`/vocabulary/*`)
- Extra study (`/subjects/extra_study`)

## Frontend compatibility

Version 2.1.1 uses WaniKani's current `.context-sentences .wk-text` markup
without adding classes through obsolete subtitle selectors. The CSS applies to
content rendered later as well. Initialization runs immediately and after Turbo
navigation; Japanese text remains visible and English is revealed on hover.
