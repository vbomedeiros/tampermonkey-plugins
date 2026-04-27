# tampermonkey-plugins

A collection of personal Tampermonkey userscripts. Each plugin is a standalone `.user.js` file installable directly from GitHub.

## Plugins

| Plugin | Description | Install |
|--------|-------------|---------|
| [WaniKani Kanji Vocabulary in Lessons](plugins/wanikani-kanji-vocab-lessons/) | Shows all vocabulary words for a kanji during WaniKani lessons, sorted by level | [Install](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-kanji-vocab-lessons/wanikani-kanji-vocab-lessons.user.js) |
| [WaniKani to Anki](plugins/wanikani-to-anki/) | Builds copy-ready HTML for Anki's HTML editor from any WaniKani vocabulary page | [Install](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-to-anki/wanikani-to-anki.user.js) |
| [WaniKani Vocabulary Analysis](plugins/wanikani-vocab-analysis/) | Adds a ChatGPT-powered etymology and analysis section to WaniKani vocabulary lessons | [Install](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-vocab-analysis/wanikani-vocab-analysis.user.js) |

## How to install a plugin

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser
2. Click the **Install** link in the plugin's row above (or open its README)
3. Tampermonkey will show an install dialog — click **Install**

Installed scripts auto-update when a new version is pushed to this repo.

## Adding a new plugin

```bash
cp -r plugins/_template plugins/my-plugin
mv plugins/my-plugin/plugin-name.user.js plugins/my-plugin/my-plugin.user.js
# Update metadata headers and README, then add a row to the table above
```

See [CLAUDE.md](CLAUDE.md) for full conventions.
