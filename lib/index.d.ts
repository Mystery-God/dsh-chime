/**
 * Type surface of the dsh-chime host half. Minimal — the implementation is
 * plain JavaScript; this declaration documents the plugin contract and the
 * settings shape for TypeScript consumers.
 */

/** Services the host half requires before mounting. */
export declare const name: 'chime'
export declare const inject: ['webServer', 'systemPrompt']

/** Model-facing announcement text. */
export declare const CHIME_GUIDANCE: string

/** One uploaded custom sound entry (also mirrored to the browser half). */
export interface ChimeCustomSound {
  /** 16-char hex storage id. */
  id: string
  /** Original client file name (≤120 chars). */
  name: string
  /** Byte size at upload time. */
  size: number
}

/** The settings document persisted at ~/.dsh/chime/settings.json. */
export interface ChimeSettings {
  /** Volume percent, 0-100. */
  volume: number
  /** Master mute. */
  muted: boolean
  /** 'default' | 'soft' | 'bright' | 'triple' | `custom:<id>`. */
  sound: string
  /** Uploaded custom sounds. */
  customSounds: ChimeCustomSound[]
}

/** Mount the routes and the system-prompt announcement. */
export declare function apply(ctx: unknown): void
