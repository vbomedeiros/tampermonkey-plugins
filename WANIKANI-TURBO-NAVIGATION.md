# WaniKani Turbo Navigation — Plugin Migration Guide

WaniKani uses Turbo/Hotwire for client-side navigation. Tampermonkey scripts only run
once per page load on matching URLs. If a plugin is naively written (calling its setup
function directly at startup), it will not re-run after Turbo navigation and the user
will have to hard-refresh.

The fix has two parts: **broaden `@match`** and **register with `wkItemInfo`**.

---

## Part 1 — Broaden `@match` to `wanikani.com/*`

Even if a plugin only injects on lesson pages, the script must be loaded on every page
so it is present when Turbo navigation starts (e.g. from the dashboard).

```js
// Before — script not loaded on dashboard, so Turbo nav from dashboard breaks:
// @match        https://www.wanikani.com/subject-lessons/*

// After — script loaded everywhere, injector handles page filtering:
// @match        https://www.wanikani.com/*
```

The plugin will only inject content on the pages it registers for (see Part 2) — being
present on other pages is harmless.

---

## Part 2 — Register with `wkItemInfo` instead of calling directly

`wkItemInfo` (provided by `wk-item-info-injector`, added via `@require`) is called by
the injector on every matching page load, including after Turbo navigation. Replace any
direct setup call with a `wkItemInfo` registration.

### Checklist

- [ ] Add `@require` for wk-item-info-injector (see version note below)
- [ ] Replace the direct startup call with a `register()` polling function
- [ ] The callback must **return** a DOM element (the injector places it; don't insert
      it manually)
- [ ] Remove any manual DOM insertion (`insertAdjacentElement`, `appendChild` into the
      page structure, etc.)

### Template

```js
;(function () {
    (function register() {
        if (!window.wkItemInfo) { setTimeout(register, 50); return; }
        window.wkItemInfo
            .on('lesson')           // 'lesson', 'lessonQuiz', 'review', 'itemPage', 'extraStudy'
            .forType('vocabulary')  // 'radical', 'kanji', 'vocabulary', 'kanaVocabulary'
            .under('meaning')       // 'composition', 'meaning', 'reading', 'examples'
            .append('Section Title', buildSection);
    })();

    function buildSection(itemObject) {
        // itemObject has: id, characters, meaning, type, reading, partOfSpeech, ...
        const container = document.createElement('div');
        // ... build content and append to container ...
        return container; // injector wraps this in a titled <section>
    }
})();
```

For multiple types (e.g. vocabulary + kanaVocabulary):

```js
['vocabulary', 'kanaVocabulary'].forEach(type => {
    window.wkItemInfo
        .on('lesson')
        .forType(type)
        .under('meaning')
        .append('Section Title', buildSection);
});
```

---

## `wkItemInfo` API quick reference

| Chain method | Values |
|---|---|
| `.on(page)` | `'lesson'`, `'lessonQuiz'`, `'review'`, `'itemPage'`, `'extraStudy'` |
| `.forType(type)` | `'radical'`, `'kanji'`, `'vocabulary'`, `'kanaVocabulary'` |
| `.under(section)` | `'composition'`, `'meaning'`, `'reading'`, `'examples'` |
| `.append(title, fn)` | `fn(itemObject)` must return a DOM element |

`itemObject` properties available in the callback:

| Property | Type | Notes |
|---|---|---|
| `id` | number | WaniKani subject ID |
| `characters` | string | The word/kanji/radical |
| `meaning` | string[] | Primary + alternative meanings |
| `type` | string | Same as `.forType()` value |
| `reading` | string[] | Lesson/review only |
| `partOfSpeech` | string[] | Vocabulary only |
| `on` | string | Same as `.on()` value |

---

## `@require` version to use

Pin to version **1326536** (v3.8) — this is the last version confirmed stable on the
current WaniKani DOM.

```js
// @require      https://greasyfork.org/scripts/430565-wanikani-item-info-injector/code/WaniKani%20Item%20Info%20Injector.user.js?version=1326536
```

**Do not use v3.13 (version=1673042)** — it crashes with
`TypeError: Cannot read properties of null (reading 'textContent')` in
`_updateCurrentStateItemPage` on the current WaniKani layout. Check upstream release
notes before bumping the version.

---

## Non-item pages (search, dashboard, etc.)

`wkItemInfo` only works on item pages (lessons, reviews, vocabulary/kanji pages). For
any other page — search results, the dashboard, etc. — use `turbo:load` with a
MutationObserver fallback instead.

The fallback is necessary because WaniKani sometimes loads page content into a Turbo
Frame asynchronously: `turbo:load` fires before the target element is in the DOM, so a
plain `document.querySelector` returns null. The observer catches the element as soon
as it appears.

```js
// @match        https://www.wanikani.com/*   ← still must be broad

function inject() {
    if (!location.pathname.startsWith('/target-path')) return false;
    if (document.getElementById('my-injected-element')) return true; // already done

    const anchor = document.querySelector('.some-element');
    if (!anchor) return false;

    // … build and insert your element …
    return true;
}

document.addEventListener('turbo:load', () => {
    if (inject()) return;

    // Target element not yet in DOM — watch for it (async Turbo Frame)
    const observer = new MutationObserver(() => {
        if (inject()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 5000); // safety net
});
```

Key points:
- `inject()` returns `true` on success (or if already injected) so the observer disconnects immediately
- The `setTimeout` disconnects after 5 s to prevent a leaked observer if the element never appears
- The `#id` guard in `inject()` prevents double-injection if both the immediate call and the observer fire

Real example: `wanikani-jisho-search-link` uses this pattern for the `/search` page.

---

## Real example — `wanikani-to-anki` (before/after)

### Before (v4.8.0 — broken on Turbo nav)

```js
// @match        https://www.wanikani.com/vocabulary/*
// (no @require for injector, or unused)

;(function () {
    addWanikaniToAnkiSection(); // called once at load, never again

    function addWanikaniToAnkiSection() {
        const section = loadWanikaniToAnkiSection();
        const pagenav = document.querySelector(".page-nav");
        pagenav.insertAdjacentElement("afterend", section); // manual DOM insert
    }
    // ...
})();
```

### After (v4.9.0 — works with Turbo nav)

```js
// @match        https://www.wanikani.com/vocabulary/*
// @require      ...wk-item-info-injector...?version=1326536

;(function () {
    (function register() {
        if (!window.wkItemInfo) { setTimeout(register, 50); return; }
        ['vocabulary', 'kanaVocabulary'].forEach(type => {
            window.wkItemInfo
                .on('itemPage')
                .forType(type)
                .under('meaning')
                .append('For Anki HTML import', buildSection);
        });
    })();

    function buildSection(_itemObject) {
        return loadWanikaniToAnkiSection(); // returns element, injector places it
    }
    // ...
})();
```

Note: `@match` for `wanikani-to-anki` is still `vocabulary/*` because the plugin only
cares about item pages (never navigated to via Turbo from non-matching pages in normal
use). For lesson plugins, broaden to `wanikani.com/*`.
