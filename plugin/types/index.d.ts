export type ClawdSize = 'small' | 'big'

/** What the desktop band draws: one clip of one mood, looping. */
export type ClawdScene = { mood: string; clip: string; n: number }

declare module 'claude-code' {
  interface PluginState {
    'dancing-claude': { shown: boolean; size: ClawdSize; scene: ClawdScene }
  }
}
