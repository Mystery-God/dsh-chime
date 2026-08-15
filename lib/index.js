/**
 * dsh-chime — host half. Owns the settings store (~/.dsh/chime/settings.json),
 * the /api/dsh-chime route family (settings GET/PUT, custom-audio upload /
 * serve / delete) and the system-prompt announcement. Zero runtime
 * dependencies: node builtins only, so no build step is needed — `lib/` is
 * the shipped artifact copied from `src/` by `scripts/build.mjs`.
 *
 * The browser half (./client) renders the Plugins-settings tab and the
 * floating volume control. The completion trigger lives entirely in the
 * browser (session `running` flag transitions), so the host exposes no
 * websocket or polling surface for it.
 */

import { createReadStream, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'

/** Stable cordis plugin name. */
export const name = 'chime'

/** Services required before the chime surfaces can mount. */
export const inject = ['webServer', 'systemPrompt']

/**
 * Model-facing announcement: plugin presence, capabilities, and limits.
 * Kept concise because the plugin exposes no agent tools.
 */
export const CHIME_GUIDANCE = '本机已安装 dsh-chime 插件（任务完成提示音）：当前会话任务结束时播放提示音；设置页在「设置 → 插件 → 任务完成提示音」，可调音量、静音、更换内置音效或上传自定义音频文件；左下角有悬浮音量控件（静音/音量/试听）。自定义音频存于 ~/.dsh/chime/audio，上限 16MB。用户提到「提示音 / 叮咚 / 任务完成声音」时即指本插件，请据此协作。'

/** Cap on uploaded custom audio files. */
const MAX_AUDIO_BYTES = 16 * 1024 * 1024

/** Cap on JSON request bodies (settings patches are tiny). */
const MAX_JSON_BODY_BYTES = 64 * 1024

/** Allowed audio extensions and their serving content types. */
const AUDIO_TYPES = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.oga', 'audio/ogg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.flac', 'audio/flac'],
  ['.webm', 'audio/webm'],
])

const DEFAULT_SETTINGS = { volume: 55, muted: false, sound: 'default', customSounds: [] }

/** Root directory of the plugin-owned store (DSH_HOME honored). */
function chimeHome() {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'chime')
}

function settingsFile() {
  return join(chimeHome(), 'settings.json')
}

function audioDir() {
  return join(chimeHome(), 'audio')
}

function clampVolume(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.volume
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * Read and validate the settings document. Missing or broken files fall back
 * to defaults; the sound selection is checked against the available custom
 * files so a deleted file never leaves a dangling selection.
 */
function readSettings() {
  let raw
  try {
    raw = JSON.parse(readFileSync(settingsFile(), 'utf8'))
  } catch {
    return { ...DEFAULT_SETTINGS, customSounds: [] }
  }
  const customSounds = Array.isArray(raw.customSounds)
    ? raw.customSounds.filter((entry) => entry !== null && typeof entry === 'object'
      && typeof entry.id === 'string' && /^[0-9a-f]{16}$/.test(entry.id)
      && typeof entry.name === 'string')
    : []
  let sound = typeof raw.sound === 'string' ? raw.sound : DEFAULT_SETTINGS.sound
  if (sound.startsWith('custom:')) {
    const id = sound.slice('custom:'.length)
    if (!customSounds.some((entry) => entry.id === id)) sound = DEFAULT_SETTINGS.sound
  }
  return {
    volume: clampVolume(raw.volume),
    muted: raw.muted === true,
    sound,
    customSounds,
  }
}

/** Atomic write: temp file + rename on the same volume. */
function writeSettings(settings) {
  mkdirSync(chimeHome(), { recursive: true })
  const tmp = settingsFile() + '.tmp'
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n')
  renameSync(tmp, settingsFile())
}

/**
 * Loopback literal check plus browser same-origin markers — the pairing
 * routes' fence. These endpoints mutate user-visible state and store files,
 * so LAN-exposed dsh web deployments must not serve them.
 */
function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  response.end(payload)
}

/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = chunk
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Read a raw binary body up to the audio cap (null when over cap). */
async function readBinaryBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = chunk
    size += buffer.length
    if (size > MAX_AUDIO_BYTES) return null
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

/** Sanitize a client-supplied file name into `<id><ext>` storage facts. */
function audioFacts(rawName) {
  let decoded = 'audio.mp3'
  try {
    decoded = decodeURIComponent(rawName)
  } catch { /* keep fallback */ }
  const base = decoded.split(/[\\/]/).pop() ?? 'audio.mp3'
  const match = /\.([a-z0-9]+)$/i.exec(base)
  let ext = match === null ? '.mp3' : '.' + match[1].toLowerCase()
  if (!AUDIO_TYPES.has(ext)) ext = '.mp3'
  return { id: randomBytes(8).toString('hex'), ext, displayName: base.slice(0, 120) || 'audio' + ext }
}

/** Every route the host publishes. */
function makeRoutes() {
  return [
    {
      kind: 'exact',
      path: '/api/dsh-chime/settings',
      handler: async (request, response) => {
        if (!isLoopbackRequest(request)) {
          writeJson(response, 403, { error: 'untrusted origin' })
          return
        }
        if (request.method === 'GET') {
          writeJson(response, 200, readSettings())
          return
        }
        if (request.method === 'PUT') {
          const body = await readJsonBody(request)
          if (body === undefined) {
            writeJson(response, 400, { error: 'invalid JSON body' })
            return
          }
          const current = readSettings()
          const next = {
            volume: body.volume !== undefined ? clampVolume(body.volume) : current.volume,
            muted: body.muted !== undefined ? body.muted === true : current.muted,
            sound: current.sound,
            customSounds: current.customSounds,
          }
          if (body.sound !== undefined) {
            if (typeof body.sound === 'string' && body.sound.length > 0 && body.sound.length <= 120) {
              next.sound = body.sound
            } else {
              writeJson(response, 400, { error: 'invalid sound' })
              return
            }
          }
          // Reject dangling custom selections, mirroring readSettings().
          if (next.sound.startsWith('custom:')) {
            const id = next.sound.slice('custom:'.length)
            if (!/^[0-9a-f]{16}$/.test(id) || !next.customSounds.some((entry) => entry.id === id)) {
              writeJson(response, 400, { error: 'unknown custom sound' })
              return
            }
          }
          writeSettings(next)
          writeJson(response, 200, next)
          return
        }
        response.writeHead(405, { allow: 'GET, PUT' })
        response.end()
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-chime/audio',
      handler: async (request, response) => {
        if (!isLoopbackRequest(request)) {
          writeJson(response, 403, { error: 'untrusted origin' })
          return
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        const rawName = typeof request.headers['x-file-name'] === 'string' ? request.headers['x-file-name'] : 'audio.mp3'
        const facts = audioFacts(rawName)
        const bytes = await readBinaryBody(request)
        if (bytes === null) {
          writeJson(response, 413, { error: 'audio too large (16MB cap)' })
          return
        }
        if (bytes.length === 0) {
          writeJson(response, 400, { error: 'empty audio body' })
          return
        }
        mkdirSync(audioDir(), { recursive: true })
        writeFileSync(join(audioDir(), facts.id + facts.ext), bytes)
        const settings = readSettings()
        const entry = { id: facts.id, name: facts.displayName, size: bytes.length }
        settings.customSounds.push(entry)
        settings.sound = 'custom:' + facts.id
        writeSettings(settings)
        writeJson(response, 200, entry)
      },
    },
    {
      kind: 'prefix',
      path: '/api/dsh-chime/audio/',
      handler: async (request, response) => {
        if (!isLoopbackRequest(request)) {
          writeJson(response, 403, { error: 'untrusted origin' })
          return
        }
        const rest = (request.url ?? '').slice('/api/dsh-chime/audio/'.length).split('?')[0]
        const id = rest.split('/')[0]
        if (!/^[0-9a-f]{16}$/.test(id)) {
          writeJson(response, 404, { error: 'unknown audio' })
          return
        }
        const settings = readSettings()
        const entry = settings.customSounds.find((item) => item.id === id)
        if (entry === undefined) {
          writeJson(response, 404, { error: 'unknown audio' })
          return
        }
        if (request.method === 'GET') {
          // Extension lookup: prefer the stored name's extension, fall back to a
          // directory scan so pre-0.2 stores (id without recorded ext) still serve.
          let ext = '.mp3'
          const match = /\.([a-z0-9]+)$/i.exec(entry.name)
          if (match !== null && AUDIO_TYPES.has('.' + match[1].toLowerCase())) {
            ext = '.' + match[1].toLowerCase()
          }
          let file = join(audioDir(), id + ext)
          if (!existsSync(file)) {
            // Scan the audio dir for this id with any known extension.
            const found = [...AUDIO_TYPES.keys()].map((candidate) => join(audioDir(), id + candidate)).find((path) => existsSync(path))
            if (found === undefined) {
              writeJson(response, 404, { error: 'audio file missing' })
              return
            }
            file = found
            ext = file.slice(file.lastIndexOf('.'))
          }
          const stat = statSync(file)
          response.writeHead(200, {
            'content-type': AUDIO_TYPES.get(ext) ?? 'application/octet-stream',
            'content-length': String(stat.size),
            'cache-control': 'public, max-age=31536000, immutable',
          })
          createReadStream(file).pipe(response)
          return
        }
        if (request.method === 'DELETE') {
          const settingsNow = readSettings()
          for (const candidate of AUDIO_TYPES.keys()) {
            rmSync(join(audioDir(), id + candidate), { force: true })
          }
          const kept = settingsNow.customSounds.filter((item) => item.id !== id)
          const next = {
            ...settingsNow,
            customSounds: kept,
            sound: settingsNow.sound === 'custom:' + id ? DEFAULT_SETTINGS.sound : settingsNow.sound,
          }
          writeSettings(next)
          writeJson(response, 200, next)
          return
        }
        response.writeHead(405, { allow: 'GET, DELETE' })
        response.end()
      },
    },
  ]
}

/**
 * Mount the settings store routes and the agent announcement.
 * @param {object} ctx - host plugin context carrying webServer/systemPrompt.
 */
export function apply(ctx) {
  ctx.effect(() => {
    const disposers = makeRoutes().map((route) => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-chime: routes')

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:dsh-chime',
    order: 151,
    text: CHIME_GUIDANCE,
  }), 'dsh-chime: announcement')
}
