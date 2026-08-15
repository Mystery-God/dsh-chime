# dsh-chime

任务完成提示音插件 for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) Web GUI（dsh-web-ui 插件生态）。

当前会话的 agent 任务结束时播放提示音（叮咚），支持音量调节、静音、更换内置音效、上传自定义音频文件，设置页位于「设置 → 插件 → 任务完成提示音」，另带一个悬浮音量控件。

## 功能

- 🔔 **任务完成提示音**：监听当前会话 `running → idle` 跳变，任务结束瞬间响铃（切换会话 / 页面加载不误响）
- 🎚️ **悬浮音量控件**（左下角）：静音开关、音量滑块、试听按钮，改动即持久化
- 🎵 **多种音效**：内置「经典叮咚 / 柔和门铃 / 清脆提示 / 三连音」（Web Audio 实时合成，无音频文件依赖）
- 📁 **自定义音频**：上传本地音频文件（mp3 / wav / ogg / m4a / aac / flac / webm，≤16MB），保存到 `~/.dsh/chime/audio/`，可试听、可删除
- ⚙️ **设置页**：注册在「设置 → 插件」，音量 / 静音 / 音效选择 / 上传管理全部图形化
- 💾 **零运行时依赖**：host 半体纯 Node 内置模块，浏览器半体纯 React，无需构建（`lib/` 即发布产物）

## 安装

```bash
# 安装到 web profile（dsh 插件市场 / dsh CLI）
dsh plugin --profile web add github:Mystery-God/dsh-chime
# 或直接改 profile 的 package.json / bundles 后 pnpm install
```

安装后重启 dsh web，即可在「设置 → 插件 → 任务完成提示音」中配置。

## 工作原理

```
lib/index.js   — host 半体：~/.dsh/chime/settings.json 存储 + /api/dsh-chime/* 路由（设置读写、音频上传/播放/删除）+ agent 公告
lib/client.js  — 浏览器半体：设置页（settings.plugins.tab）+ 悬浮控件（shell.overlay）+ 完成监听（useSessions 标准 props）
cordis.patch.yml — bundle patch：把插件行注入 profile 组合
```

- 路由带 loopback + same-origin 围栏（与 dsh-ssh 一致），LAN 暴露的部署不会对外提供这些接口
- 音量/静音/音效选择即时 PUT 到 host 持久化；浏览器内存中共享一份 store，设置页与悬浮条实时同步

## 开发

```bash
node scripts/build.mjs   # 把 src/ 复制为 lib/（无编译步骤）
node scripts/test.mjs    # host 路由冒烟测试（使用临时 DSH_HOME，不碰真实配置）
```

本仓库无 TypeScript / 无打包器：`src/` 是手写源码，`lib/` 是发布产物（需提交，dsh 插件市场校验安装包时要求入口文件存在）。

## License

[MIT](./LICENSE)
