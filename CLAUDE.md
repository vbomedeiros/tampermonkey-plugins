# Tampermonkey Plugins

## Repo structure

```
plugins/
└── <plugin-name>/
    ├── <plugin-name>.user.js   ← the userscript (source of truth)
    └── README.md               ← what it does + install link
```

## Always confirm before committing or pushing

Never run `git commit`, `git push` without explicitly asking the user first and receiving confirmation. Always show what will be committed and wait for approval before proceeding.

## Metadata header template

Every `.user.js` must begin with this block (filled in per plugin):

```js
// ==UserScript==
// @name         Plugin Display Name
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      1.0.0
// @description  One-line description of what this plugin does
// @author       Victor Medeiros
// @match        https://example.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/PLUGIN-FOLDER/PLUGIN-FOLDER.user.js
// @downloadURL  https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/PLUGIN-FOLDER/PLUGIN-FOLDER.user.js
// ==/UserScript==
```

- `@match` — set to the site(s) this plugin targets (supports wildcards)
- `@updateURL` / `@downloadURL` — both point to the plugin's raw GitHub URL; replace `PLUGIN-FOLDER` with the actual folder name
- `@version` — bump on every push to trigger auto-update in Tampermonkey (use semver)

## WaniKani plugins — Turbo navigation

WaniKani uses Turbo/Hotwire for client-side navigation. Any WaniKani plugin that calls
its setup function directly at startup will break after Turbo navigation (user must
hard-refresh). Full details and a migration template are in
[WANIKANI-TURBO-NAVIGATION.md](WANIKANI-TURBO-NAVIGATION.md).

**Quick checklist when working on a WaniKani plugin:**

1. `@match` must be `https://www.wanikani.com/*` (not narrowed to a sub-path) so the
   script is present when Turbo navigation starts from the dashboard
2. Add `@require` for wk-item-info-injector pinned to **version=1326536** (v3.8) —
   do not bump to v3.13, it crashes on the current WaniKani DOM
3. Replace any direct setup call with a `wkItemInfo` registration that **returns** a
   DOM element from the callback (do not insert into the page manually)

Exception: plugins that only run on item pages (`/vocabulary/*`, `/kanji/*`, etc.) and
are never navigated to via Turbo from a non-matching page can keep a narrower `@match`.
See `wanikani-to-anki` for that pattern.

## Creating a new plugin

```bash
cp -r plugins/_template plugins/my-plugin
mv plugins/my-plugin/plugin-name.user.js plugins/my-plugin/my-plugin.user.js
# Update all metadata headers in the .user.js file
# Update README.md with the correct install link and description
```

## Daily workflow

```bash
# Edit the .user.js directly, bump @version, then push
git add plugins/my-plugin/my-plugin.user.js
git commit -m "..."
git push
# Tampermonkey picks up the update on next scheduled check,
# or manually: dashboard → script menu → "Check for updates"
```

## Install flow

Each plugin's README links to its raw GitHub URL. Opening that URL in a browser
with Tampermonkey installed triggers the install dialog automatically.

Raw URL pattern:
```
https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/<plugin-folder>/<plugin-folder>.user.js
```
