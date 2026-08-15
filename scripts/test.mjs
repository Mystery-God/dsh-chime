/**
 * Host-half smoke test: mounts the plugin against a fake ctx, then exercises
 * the /api/dsh-chime route family against an in-memory HTTP pair. Uses a
 * temporary DSH_HOME so the real ~/.dsh/chime store is never touched.
 *
 * Run: node scripts/test.mjs
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

// Isolate the store BEFORE importing the plugin (chimeHome() reads env at call
// time, but keep it early anyway).
const tmpHome = mkdtempSync(join(tmpdir(), 'dsh-chime-test-'))
process.env.DSH_HOME = tmpHome

const mod = await import(new URL('../lib/index.js', import.meta.url))
const { apply } = mod

/** Collect registered routes. */
const routes = []
const fakeCtx = {
  effect: (fn) => { fn(); return () => {} },
  webServer: { register: (route) => { routes.push(route); return () => {} } },
  systemPrompt: { section: () => () => {} },
}

apply(fakeCtx)

/** Run one handler against a fake request, returning status + parsed body. */
async function call(route, { method = 'GET', url, headers = {}, body = null } = {}) {
  const request = {
    method,
    url: url ?? route.path,
    headers: { host: '127.0.0.1:3080', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    [Symbol.asyncIterator]: async function* () {
      if (body !== null) yield Buffer.from(body)
    },
  }
  let status = 0
  let payload = Buffer.alloc(0)
  const response = Object.assign(new EventEmitter(), {
    writeHead: (code) => { status = code },
    write: (chunk) => { payload = Buffer.concat([payload, Buffer.from(chunk)]) },
    destroy: () => {},
    end: (data) => {
      if (data !== undefined) payload = Buffer.from(data)
      response.emit('end')
    },
  })
  response.on('data', (chunk) => { payload = Buffer.concat([payload, chunk]) })
  const done = new Promise((resolve) => response.once('end', resolve))
  await route.handler(request, response)
  await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 2000))])
  let json = null
  try { json = JSON.parse(payload.toString('utf8')) } catch { /* binary */ }
  return { status, json, bytes: payload.length, raw: payload }
}

const byPath = (path) => routes.find((r) => r.path === path)
const settingsRoute = byPath('/api/dsh-chime/settings')
const uploadRoute = byPath('/api/dsh-chime/audio')
const serveRoute = byPath('/api/dsh-chime/audio/')

const results = []
function check(label, condition) {
  results.push({ label, ok: condition === true })
  console.log(`${condition === true ? 'PASS' : 'FAIL'}  ${label}`)
}

// 1. default settings
let r = await call(settingsRoute)
check('GET settings returns defaults', r.status === 200 && r.json.volume === 55 && r.json.muted === false && r.json.sound === 'default')

// 2. patch volume + mute
r = await call(settingsRoute, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ volume: 80, muted: true }) })
check('PUT settings persists volume/mute', r.status === 200 && r.json.volume === 80 && r.json.muted === true)

// 3. invalid sound rejected
r = await call(settingsRoute, { method: 'PUT', body: JSON.stringify({ sound: 'custom:deadbeefdeadbeef' }) })
check('PUT rejects dangling custom sound', r.status === 400)

// 4. upload audio
const fakeAudio = Buffer.from([0x49, 0x44, 0x33, 0x01, 0x02, 0x03, 0x04])
r = await call(uploadRoute, { method: 'POST', headers: { 'x-file-name': encodeURIComponent('我的铃声.mp3') }, body: fakeAudio })
check('POST uploads audio', r.status === 200 && r.json.id !== undefined && r.json.name === '我的铃声.mp3')

const uploadedId = r.json.id
r = await call(settingsRoute)
check('upload selected as sound', r.json.sound === 'custom:' + uploadedId && r.json.customSounds.length === 1)

// 5. serve audio
r = await call(serveRoute, { url: '/api/dsh-chime/audio/' + uploadedId })
check('GET serves uploaded bytes', r.status === 200 && r.bytes === fakeAudio.length)

// 6. delete audio
r = await call(serveRoute, { method: 'DELETE', url: '/api/dsh-chime/audio/' + uploadedId })
check('DELETE removes audio and resets sound', r.status === 200 && r.json.sound === 'default' && r.json.customSounds.length === 0)

// 7. missing audio 404
r = await call(serveRoute, { url: '/api/dsh-chime/audio/' + uploadedId })
check('GET deleted audio 404s', r.status === 404)

// 8. untrusted origin rejected
const farAway = {
  ...(await (async () => {
    const request = {
      method: 'GET',
      url: settingsRoute.path,
      headers: { host: '192.168.1.5:3080', origin: 'http://192.168.1.5:3080' },
      socket: { remoteAddress: '192.168.1.5' },
      [Symbol.asyncIterator]: async function* () {},
    }
    let status = 0
    const response = { writeHead: (code) => { status = code }, end: () => {} }
    await settingsRoute.handler(request, response)
    return { status }
  })()),
}
check('non-loopback origin rejected', farAway.status === 403)

// cleanup
rmSync(tmpHome, { recursive: true, force: true })
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed > 0 ? 1 : 0)
