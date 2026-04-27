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
