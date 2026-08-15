/**
 * dsh-chime — browser half. Renders three surfaces:
 *
 * 1. The Plugins-settings tab (「设置 → 插件 → 任务完成提示音」): volume,
 *    mute, sound choice (built-in presets + uploaded custom audio), and a
 *    preview button. Every change PUTs to /api/dsh-chime/settings.
 * 2. A floating volume pill (bottom-left): mute toggle, slider, preview.
 * 3. An invisible completion watcher: when the current session's agent turn
 *    transitions running -> idle, the selected sound plays at the configured
 *    volume (skipped while muted).
 *
 * Both surfaces share one in-memory settings store, so a change in the tab
 * reaches the pill and the watcher immediately.
 *
 * Module contract: `window.__ModuleLoader__.load({ id, factory })` and the
 * factory exports `{ inject, apply }` — plain React via `require('react')`,
 * no JSX, no bundler.
 */
window.__ModuleLoader__.load({
  id: '@linxin666/dsh-chime',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { useState, useEffect, useRef } = React

    const API = {
      settings: '/api/dsh-chime/settings',
      audio: '/api/dsh-chime/audio',
    }

    // ------------------------------------------------------------------ store
    const store = { settings: null, listeners: new Set() }
    function subscribe(listener) {
      store.listeners.add(listener)
      return () => store.listeners.delete(listener)
    }
    function notify() {
      for (const listener of [...store.listeners]) listener()
    }
    async function loadSettings() {
      const response = await fetch(API.settings)
      if (!response.ok) throw new Error('settings load failed: ' + response.status)
      store.settings = await response.json()
      notify()
      return store.settings
    }
    async function saveSettings(patch) {
      const response = await fetch(API.settings, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? ('settings save failed: ' + response.status))
      }
      store.settings = await response.json()
      notify()
      return store.settings
    }
    async function uploadAudio(file) {
      const response = await fetch(API.audio, {
        method: 'POST',
        headers: { 'x-file-name': encodeURIComponent(file.name ?? 'audio.mp3') },
        body: file,
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? ('upload failed: ' + response.status))
      }
      return response.json()
    }
    async function deleteAudio(id) {
      const response = await fetch(API.audio + '/' + id, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? ('delete failed: ' + response.status))
      }
      store.settings = await response.json()
      notify()
      return store.settings
    }

    // ------------------------------------------------------------------ audio
    const PRESETS = {
      default: { label: '经典叮咚', notes: [[659.25, 0.24, 0], [523.25, 0.42, 0.24]] },
      soft: { label: '柔和门铃', notes: [[440, 0.4, 0], [349.23, 0.5, 0.32]] },
      bright: { label: '清脆提示', notes: [[1046.5, 0.18, 0], [783.99, 0.3, 0.16]] },
      triple: { label: '三连音', notes: [[659.25, 0.16, 0], [783.99, 0.16, 0.16], [1046.5, 0.3, 0.32]] },
    }

    const MIN_PEAK = 0.0001
    let audioCtx = null
    let customAudio = null

    function ensureAudioContext() {
      if (audioCtx !== null) return audioCtx
      const Ctor = typeof AudioContext !== 'undefined'
        ? AudioContext
        : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : undefined)
      if (Ctor === undefined) return undefined
      try {
        audioCtx = new Ctor()
      } catch (error) {
        audioCtx = undefined
        return undefined
      }
      return audioCtx
    }

    function tone(ctx, at, freq, duration, peak) {
      const safePeak = Math.max(peak, MIN_PEAK)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(MIN_PEAK, at)
      gain.gain.exponentialRampToValueAtTime(safePeak, at + 0.03)
      gain.gain.exponentialRampToValueAtTime(MIN_PEAK, at + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + duration + 0.05)
    }

    function playPreset(id, peak) {
      const preset = PRESETS[id] ?? PRESETS.default
      const ctx = ensureAudioContext()
      if (ctx === undefined) return
      const start = () => {
        if (ctx.state !== 'running') return
        const at = ctx.currentTime + 0.02
        for (const [freq, duration, offset] of preset.notes) {
          tone(ctx, at + offset, freq, duration, peak)
        }
      }
      try {
        if (ctx.state === 'suspended') {
          ctx.resume().then(start).catch(() => {})
        } else {
          start()
        }
      } catch (error) {
        // Audio failures never crash a slot entry.
      }
    }

    /** Play whatever the settings select: a custom file or a built-in preset. */
    function playSound(settings) {
      if (settings.muted === true) return
      const peak = Math.max(0, Math.min(1, (settings.volume ?? 55) / 100))
      if (!(peak > 0)) return
      const sound = typeof settings.sound === 'string' ? settings.sound : 'default'
      if (sound.startsWith('custom:')) {
        const id = sound.slice('custom:'.length)
        if (/^[0-9a-f]{16}$/.test(id)) {
          try {
            if (customAudio !== null) customAudio.pause()
            customAudio = new Audio(API.audio + '/' + id)
            customAudio.volume = peak
            customAudio.play().catch(() => {})
            return
          } catch (error) {
            // fall through to the default preset
          }
        }
      }
      playPreset(sound, peak)
    }

    // ------------------------------------------------------------------- css
    const CSS = [
      '.dshc-tab{font-size:13px;line-height:1.6;color:inherit;max-width:560px;}',
      '.dshc-tab h3{margin:0 0 4px;font-size:15px;}',
      '.dshc-tab .dshc-desc{margin:0 0 14px;opacity:.65;}',
      '.dshc-row{display:flex;align-items:center;gap:10px;margin:10px 0;flex-wrap:wrap;}',
      '.dshc-row label{display:flex;align-items:center;gap:6px;cursor:pointer;}',
      '.dshc-range{width:180px;accent-color:#3ddc84;}',
      '.dshc-btn{border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;',
      'border-radius:8px;padding:4px 12px;cursor:pointer;font-size:12px;}',
      '.dshc-btn:hover{background:rgba(128,128,128,.15);}',
      '.dshc-btn.dshc-danger:hover{background:rgba(255,90,90,.2);}',
      '.dshc-sound-list{display:flex;flex-direction:column;gap:6px;margin:10px 0;}',
      '.dshc-sound-item{display:flex;align-items:center;gap:8px;}',
      '.dshc-muted{opacity:.55;}',
      '.dshc-error{color:#ff8a8a;margin-top:8px;}',
      '.dshc-pill{position:fixed;left:16px;bottom:16px;z-index:2147483000;pointer-events:auto;',
      'display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;',
      'background:rgba(22,24,31,.9);border:1px solid rgba(255,255,255,.10);',
      'box-shadow:0 6px 20px rgba(0,0,0,.4);font-family:ui-sans-serif,system-ui,"Segoe UI",sans-serif;',
      'user-select:none;-webkit-user-select:none;}',
      '.dshc-pill-btn{border:0;background:transparent;cursor:pointer;font-size:14px;line-height:1;',
      'padding:4px;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;',
      'justify-content:center;}',
      '.dshc-pill-btn:hover{background:rgba(255,255,255,.12);}',
      '.dshc-pill-range{width:110px;accent-color:#3ddc84;cursor:pointer;margin:0;}',
    ].join('')

    // ------------------------------------------------------- settings tab
    function ChimeSettingsTab() {
      const [settings, setSettings] = useState(store.settings)
      const [error, setError] = useState(null)
      const [uploading, setUploading] = useState(false)
      const fileRef = useRef(null)

      useEffect(() => {
        let alive = true
        loadSettings()
          .then((value) => { if (alive) setSettings(value) })
          .catch((e) => { if (alive) setError(String(e && e.message ? e.message : e)) })
        const off = subscribe(() => setSettings(store.settings))
        return () => { alive = false; off() }
      }, [])

      function update(patch) {
        setError(null)
        saveSettings(patch)
          .then((value) => setSettings(value))
          .catch((e) => setError(String(e && e.message ? e.message : e)))
      }

      function onPickFile(event) {
        const file = event.target.files && event.target.files[0]
        event.target.value = ''
        if (file === undefined) return
        setUploading(true)
        setError(null)
        uploadAudio(file)
          .then(() => store.settings)
          .then((value) => setSettings(value))
          .catch((e) => setError(String(e && e.message ? e.message : e)))
          .finally(() => setUploading(false))
      }

      if (settings === null) {
        return React.createElement('div', { className: 'dshc-tab' },
          React.createElement('div', null, '正在加载设置…'),
          error !== null ? React.createElement('div', { className: 'dshc-error' }, error) : null)
      }

      const customSounds = Array.isArray(settings.customSounds) ? settings.customSounds : []
      const soundChoices = [
        ...Object.entries(PRESETS).map(([id, preset]) => ({ id, label: preset.label, custom: false })),
        ...customSounds.map((entry) => ({ id: 'custom:' + entry.id, label: '自定义：' + entry.name, custom: true })),
      ]

      return React.createElement('div', { className: 'dshc-tab' },
        React.createElement('h3', null, '任务完成提示音'),
        React.createElement('p', { className: 'dshc-desc' }, '当前会话任务结束时播放提示音；左下角悬浮条可随时静音或调音量。'),
        React.createElement('div', { className: 'dshc-row' },
          React.createElement('label', null,
            React.createElement('input', {
              type: 'checkbox',
              checked: settings.muted === true,
              onChange: (e) => update({ muted: e.target.checked }),
            }),
            '静音')),
        React.createElement('div', { className: 'dshc-row' },
          React.createElement('label', null, '音量'),
          React.createElement('input', {
            className: 'dshc-range',
            type: 'range',
            min: 0,
            max: 100,
            step: 5,
            value: settings.volume,
            onChange: (e) => update({ volume: Number(e.target.value) }),
            title: '音量 ' + settings.volume + '%',
          }),
          React.createElement('span', null, settings.volume + '%')),
        React.createElement('div', { className: 'dshc-sound-list' },
          soundChoices.map((choice) => React.createElement('div', {
            className: 'dshc-sound-item' + (settings.muted === true ? ' dshc-muted' : ''),
            key: choice.id,
          },
            React.createElement('input', {
              type: 'radio',
              name: 'dshc-sound',
              checked: settings.sound === choice.id,
              onChange: () => update({ sound: choice.id }),
            }),
            React.createElement('span', null, choice.label),
            React.createElement('button', {
              className: 'dshc-btn',
              onClick: () => playSound({ ...settings, sound: choice.id, muted: false }),
            }, '试听'),
            choice.custom
              ? React.createElement('button', {
                className: 'dshc-btn dshc-danger',
                onClick: () => deleteAudio(choice.id.slice('custom:'.length))
                  .then((value) => setSettings(value))
                  .catch((e) => setError(String(e && e.message ? e.message : e))),
              }, '删除')
              : null))),
        React.createElement('div', { className: 'dshc-row' },
          React.createElement('input', {
            type: 'file',
            accept: 'audio/*',
            style: { display: 'none' },
            ref: fileRef,
            onChange: onPickFile,
          }),
          React.createElement('button', {
            className: 'dshc-btn',
            disabled: uploading,
            onClick: () => { if (fileRef.current !== null) fileRef.current.click() },
          }, uploading ? '上传中…' : '上传自定义音频（≤16MB）'),
          React.createElement('button', {
            className: 'dshc-btn',
            onClick: () => playSound({ ...settings, muted: false }),
          }, '试听当前')),
        error !== null ? React.createElement('div', { className: 'dshc-error' }, error) : null)
    }

    // ----------------------------------------------------- floating pill + watcher
    function ChimeOverlay(props) {
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : undefined
      const currentId = useSessions !== undefined ? useSessions((s) => s.current) : undefined
      const running = useSessions !== undefined
        ? useSessions((s) => {
          const id = s.current
          if (id === undefined) return false
          const row = s.byId[id]
          return row !== undefined && row.running === true
        })
        : false

      const [settings, setSettings] = useState(store.settings ?? { volume: 55, muted: false })

      useEffect(() => {
        loadSettings().then((value) => setSettings(value)).catch(() => {})
        return subscribe(() => setSettings(store.settings))
      }, [])

      // Completion trigger: current session running true -> false.
      const prev = useRef(null)
      useEffect(() => {
        const previous = prev.current
        const sameSession = previous !== null && previous.id === currentId
        if (sameSession && previous.running === true && running === false) {
          playSound(store.settings ?? { volume: 55, muted: false })
        }
        prev.current = { id: currentId, running }
      }, [currentId, running])

      const changeVolume = (value) => saveSettings({ volume: value }).catch(() => {})
      const toggleMute = () => saveSettings({ muted: !(settings.muted === true) }).catch(() => {})
      const preview = () => playSound({ ...settings, muted: false })

      return React.createElement('div', { className: 'dshc-pill' },
        React.createElement('button', {
          className: 'dshc-pill-btn',
          title: settings.muted === true ? '取消静音' : '静音',
          onClick: toggleMute,
        }, settings.muted === true ? '🔕' : '🔊'),
        React.createElement('input', {
          className: 'dshc-pill-range',
          type: 'range',
          min: 0,
          max: 100,
          step: 5,
          value: settings.volume ?? 55,
          onChange: (e) => changeVolume(Number(e.target.value)),
          title: '音量 ' + (settings.volume ?? 55) + '%',
        }),
        React.createElement('button', { className: 'dshc-pill-btn', title: '试听', onClick: preview }, '▶'))
    }

    // ---------------------------------------------------------------- plugin
    const inject = ['slots']

    function apply(ctx) {
      const style = document.createElement('style')
      style.id = 'dsh-chime-style'
      style.textContent = CSS
      document.head.append(style)
      ctx.effect(() => () => style.remove(), 'dsh-chime: styles')

      ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'chime',
        order: 90,
        label: '任务完成提示音',
      }, () => React.createElement(ChimeSettingsTab)))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'dsh-chime-float', label: '任务完成提示音' },
        (props) => React.createElement(ChimeOverlay, { useSessions: props.useSessions }),
      ))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
