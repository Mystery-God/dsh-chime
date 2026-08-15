# dsh-chime

Task-completion chime plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) Web GUI (part of the dsh-web-ui plugin ecosystem).

Plays a ding-dong chime when the current session's agent turn completes. Includes a floating volume control, built-in sound presets, and custom-audio upload. Settings live at **Settings → Plugins → 任务完成提示音 (Task Completion Chime)**.

## Features

- 🔔 **Completion chime**: watches the current session's `running → idle` transition — rings the moment a task finishes (no false rings on session switch or page load)
- 🎚️ **Floating volume control** (bottom-left): mute toggle, volume slider, preview button; every change persists immediately
- 🎵 **Built-in sounds**: 经典叮咚 (classic ding-dong) / 柔和门铃 (soft) / 清脆提示 (bright) / 三连音 (triple) — synthesized with Web Audio, no audio files required
- 📁 **Custom audio**: upload local audio files (mp3 / wav / ogg / m4a / aac / flac / webm, ≤16MB) to `~/.dsh/chime/audio/`; preview and delete from the settings page
- ⚙️ **Plugins settings page**: volume, mute, sound selection, and upload management, all graphical
- 💾 **Zero runtime dependencies**: host half is plain Node built-ins, browser half is plain React; no build toolchain (`lib/` is the shipped artifact)

## Install

```bash
# install into the web profile (dsh plugin market / dsh CLI)
dsh plugin --profile web add github:Mystery-God/dsh-chime
# or edit the profile's package.json deps + bundles, then pnpm install
```

Restart dsh web, then configure it at **Settings → Plugins → 任务完成提示音**.

## How it works

```
lib/index.js   — host half: ~/.dsh/chime/settings.json store + /api/dsh-chime/* routes (settings read/write, audio upload/serve/delete) + agent announcement
lib/client.js  — browser half: Plugins-settings tab (settings.plugins.tab) + floating control (shell.overlay) + completion watcher (useSessions standard props)
cordis.patch.yml — bundle patch: inserts the plugin row into the profile composition
```

- Routes carry a loopback + same-origin fence (same as dsh-ssh); LAN-exposed deployments never serve them
- Volume / mute / sound changes PUT to the host immediately; the two UI surfaces share one in-memory store, so they stay in sync live

## Development

```bash
node scripts/build.mjs   # copies src/ → lib/ (no compile step)
node scripts/test.mjs    # host route smoke test (uses a temp DSH_HOME)
```

No TypeScript, no bundler: `src/` is the hand-written source, `lib/` is the shipped artifact (committed — the dsh plugin market rejects installs whose declared entry artifact is missing).

## License

[MIT](./LICENSE)
