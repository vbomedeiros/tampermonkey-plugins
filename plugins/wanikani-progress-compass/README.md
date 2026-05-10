# WaniKani Progress Compass

A self-regulating dashboard banner that keeps kanji progression and vocabulary management in balance. Replaces the Vocab+3-Kanji Daily Assistant.

## Install

Click the link below while Tampermonkey is installed in your browser:

[Install wanikani-progress-compass.user.js](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-progress-compass/wanikani-progress-compass.user.js)

**Requires:** [WaniKani Open Framework (WKOF)](https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549) — install this first.

## What it does

### Always visible: level-up progress bar
The most prominent element is always the kanji Guru progress bar for your current level, showing how many kanji have reached Guru+ and your ETA to level up.

### Adaptive kanji quota (the core idea)
Instead of a fixed kanji-per-day number, the plugin dynamically adjusts how many kanji lessons to do each day based on the **vocab pipeline**:

| Vocab pipeline supply | Kanji recommended |
|---|---|
| > 7 days | 0 (pipeline full — let vocab clear) |
| 4–7 days | 2 (healthy — light pace) |
| 1–3 days | 3 (normal pace) |
| < 1 day | up to max (queue running dry — accelerate) |

The pipeline is estimated as: `(unlocked vocab queue + expected unlocks from near-Guru kanji × 3) ÷ daily vocab goal`.

This means kanji naturally pace themselves so new vocab unlocks arrive just as the existing queue empties — no more huge piles, no more pausing kanji entirely.

### Banner states
- **Blocked** — apprentice count hit the ceiling; do reviews first
- **Surge** — level-up just happened and a large vocab batch unlocked; focus on vocab
- **Kanji Urgent** — vocab queue is running dry; do kanji now
- **Normal** — steady state; shows today's kanji + vocab targets
- **Kanji Done** — kanji quota met for today; finish vocab
- **All Clear** — queue clear; shows next review countdown
- **Radicals Only** — do radicals to unlock kanji faster

### Always shown
- Countdown to next kanji/radical review (color-coded: red = now, yellow = within 4h, white = later)
- Vocab pipeline bar and one-line explanation of why today's kanji quota is what it is

## Settings (⚙ button on the banner)

| Setting | Default | Description |
|---|---|---|
| Vocab lessons per day | 9 | Daily vocab target |
| Apprentice ceiling | 110 | Blocks all lessons when reached |
| Min kanji/day | 0 | Floor for kanji quota (0 = allow skipping when pipeline full) |
| Max kanji/day | 5 | Cap for kanji quota when queue is running dry |

## Notes

- Works after Turbo navigation — listens for `turbo:load` and re-mounts on the dashboard
- Surge detection uses `localStorage` to notice when you just leveled up
- Level-up ETA is an estimate based on current SRS stages and assumes perfect review accuracy
