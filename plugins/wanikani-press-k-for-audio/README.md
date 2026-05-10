# Wanikani: Press K for Audio

Press **K** to play the audio pronunciation on WaniKani lesson and item pages, without having to click the audio button manually.

## Install

Click the link below while Tampermonkey is installed in your browser:

[Install wanikani-press-k-for-audio.user.js](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-press-k-for-audio/wanikani-press-k-for-audio.user.js)

## What it does

- Registers `K` as a hotkey via WaniKani's built-in `keyboardManager`
- On keypress, clicks the audio button for the non-autoplay voice (falls back to any audio button if all are set to autoplay)
- Works on lesson pages (`/subject-lessons/*`) and item pages (`/subjects/*`)
- Works after Turbo navigation — the script polls for `window.keyboardManager` at startup and registers once; the callback queries the live DOM on each keypress

## Notes

- Prefers the voice that is not set to auto-play (`data-audio-player-auto-play-value="false"`)
