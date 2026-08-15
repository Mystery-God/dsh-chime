# dsh-chime · 任务完成提示音

任务完成提示音插件 for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) Web GUI（dsh-web-ui 插件生态）。

当前会话的 agent 任务结束时播放提示音（叮咚），支持音量调节、静音、更换内置音效、上传自定义音频文件。设置页位于「设置 → 插件 → 任务完成提示音」。

A task-completion chime plugin for the DeepSeek Harness Web GUI: rings a ding-dong when the current session's agent turn finishes, with volume control, mute, built-in sound presets, and custom-audio upload. Settings live at **Settings → Plugins → 任务完成提示音**.

## 功能 · Features

- 🔔 **任务完成提示音 · Completion chime**：监听当前会话 `running → idle` 跳变，任务结束瞬间响铃（切换会话 / 页面加载不误响）。Watches the current session's `running → idle` transition — rings the moment a task finishes (no false rings on session switch or page load).
- 🎚️ **音量与静音 · Volume & mute**：设置页内 0–100% 音量滑块与静音开关，改动即持久化。Volume slider (0–100%) and mute toggle in the settings page; every change persists immediately.
- 🎵 **多种音效 · Built-in sounds**：内置「经典叮咚 / 柔和门铃 / 清脆提示 / 三连音」（Web Audio 实时合成，无音频文件依赖）。Four synthesized presets — no audio files required.
- 📁 **自定义音频 · Custom audio**：上传本地音频文件（mp3 / wav / ogg / m4a / aac / flac / webm，≤16MB），保存到 `~/.dsh/chime/audio/`，可试听、可删除。Upload local audio files (≤16MB); preview and delete from the settings page.
- ⚙️ **设置页 · Plugins settings page**：注册在「设置 → 插件」，音量 / 静音 / 音效选择 / 上传管理全部图形化。Volume, mute, sound selection, and upload management, all graphical.
- 💾 **零运行时依赖 · Zero runtime dependencies**：host 半体纯 Node 内置模块，浏览器半体纯 React，无需构建（`lib/` 即发布产物）。No build toolchain — `lib/` is the shipped artifact.

## 安装 · Install

```bash
# 安装到 web profile（dsh 插件市场 / dsh CLI）
# Install into the web profile (dsh plugin market / dsh CLI)
dsh plugin --profile web add github:Mystery-God/dsh-chime
# 或直接改 profile 的 package.json / bundles 后 pnpm install
# Or edit the profile's package.json deps + bundles, then pnpm install
```

安装后重启 dsh web，即可在「设置 → 插件 → 任务完成提示音」中配置。
Restart dsh web, then configure it at **Settings → Plugins → 任务完成提示音**.

## 工作原理 · How it works

```
lib/index.js   — host 半体：~/.dsh/chime/settings.json 存储 + /api/dsh-chime/* 路由（设置读写、音频上传/播放/删除）+ agent 公告
lib/client.js  — 浏览器半体：设置页（settings.plugins.tab）+ 完成监听（shell.overlay + useSessions 标准 props）
cordis.patch.yml — bundle patch：把插件行注入 profile 组合
```

- 路由带 loopback + same-origin 围栏（与 dsh-ssh 一致），LAN 暴露的部署不会对外提供这些接口。Routes carry a loopback + same-origin fence; LAN-exposed deployments never serve them.
- 音量/静音/音效选择即时 PUT 到 host 持久化；浏览器内存中共享一份 store，设置页与完成监听实时同步。Changes PUT to the host immediately; the settings page and the completion watcher share one in-memory store and stay in sync live.

## 开发 · Development

```bash
node scripts/build.mjs   # 把 src/ 复制为 lib/（无编译步骤）· copies src/ → lib/
node scripts/test.mjs    # host 路由冒烟测试（临时 DSH_HOME）· host route smoke test
```

本仓库无 TypeScript / 无打包器：`src/` 是手写源码，`lib/` 是发布产物（需提交，dsh 插件市场校验安装包时要求入口文件存在）。No TypeScript, no bundler: `src/` is the hand-written source, `lib/` is the shipped artifact (committed — the dsh plugin market rejects installs whose declared entry artifact is missing).

## License

[MIT](./LICENSE)

---

纯中文版：[README.zh.md](./README.zh.md)
