import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ClawdScene, ClawdSize } from '../types'
import { CLIPS, FPS, MOODS, Stage, animatedSvg, clipFrames, rasterCells, upscale } from './clawd.ts'
import type { Canvas, Mood } from './clawd.ts'

const shown = atom({ plugin: 'dancing-claude', key: 'shown' } as const, true)
const size = atom({ plugin: 'dancing-claude', key: 'size' } as const, 'small')
const scene = atom({ plugin: 'dancing-claude', key: 'scene' } as const, { mood: 'idle', clip: 'breathe', n: 0 })

const RASTER = 'clawd'

/** Which mood each tool puts Clawd in while it runs. */
function moodForTool(tool: string): Mood {
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) return 'coding'
  if (/^(Read|Grep|Glob|LS|WebFetch|WebSearch|NotebookRead|ToolSearch)$/.test(tool)) return 'reading'
  if (/^(Bash|PowerShell|BashOutput|KillShell|Monitor|TaskStop)$/.test(tool)) return 'running'
  if (/^(Agent|Task|SendMessage|Workflow|ListAgents)$/.test(tool)) return 'friends'
  if (/^(AskUserQuestion|ExitPlanMode|EnterPlanMode)$/.test(tool)) return 'asking'
  if (/^(TodoWrite|TaskCreate|TaskUpdate|TaskList)$/.test(tool)) return 'thinking'
  if (tool.startsWith('mcp__')) return 'reading'
  return 'running'
}

const KIND = /\b(thanks?|thank you|thx|ty|love|lovely|awesome|amazing|great job|good job|nice|perfect|cute|adorable|well done|you rock|good (boy|girl|bot)|best)\b|<3|❤|♥/i
const CROSS = /\b(wtf|wth|ugh+|argh+|damn|dammit|stupid|hate|annoying|useless|doesn'?t work|not working|still broken|why (won'?t|isn'?t|doesn'?t|did you))\b|!{3,}/i
const SHOUTING = /\b[A-Z]{3,}\b.*\b[A-Z]{3,}\b/

/** `/clawd <word>`: the moods by name and by a few friendlier aliases. */
const ALIASES: Record<string, Mood> = {
  dance: 'dance', boogie: 'dance', party: 'friends', friends: 'friends',
  love: 'love', pet: 'love', hug: 'love', heart: 'love',
  angry: 'angry', mad: 'angry', grr: 'angry', rage: 'angry',
  sleep: 'sleepy', nap: 'sleepy', sleepy: 'sleepy',
  code: 'coding', coding: 'coding', type: 'coding', laptop: 'coding',
  read: 'reading', reading: 'reading', search: 'reading',
  think: 'thinking', thinking: 'thinking', hmm: 'thinking',
  run: 'running', running: 'running', bash: 'running',
  hello: 'hello', hi: 'hello', wave: 'hello',
  oops: 'oops', eek: 'oops', ask: 'asking', asking: 'asking',
  excited: 'excited', hype: 'excited', yay: 'excited', idle: 'idle',
}

const HELP = [
  'Clawd lives above your prompt and reacts to what Claude is doing.',
  '/clawd               show or hide Clawd',
  '/clawd big|small     change the size',
  '/clawd left|center|right   where Clawd hangs out (right is home)',
  `/clawd <emote>       ${[...new Set(Object.keys(ALIASES))].slice(0, 14).join(', ')}, ...`,
].join('\n')

const stage = new Stage(80, Date.now() & 0xffff)
let terminal: { requestId: string; scale: number; columns: number } | null = null
let desktop = false
let lastCells = ''
let lastFrame: Canvas | null = null
let lastScene = ''
let errors = 0

function sceneKey(): string {
  return `${stage.mood}/${stage.clip.name}`
}

async function tick($: EngineInterface): Promise<void> {
  const frame = stage.tick()
  lastFrame = frame
  if (desktop && sceneKey() !== lastScene) {
    lastScene = sceneKey()
    const next: ClawdScene = { mood: stage.mood, clip: stage.clip.name, n: Date.now() }
    await update($, scene, () => next)
  }
  if (!terminal) return
  const { requestId, scale } = terminal
  const { cells } = rasterCells(upscale(frame, scale))
  if (cells === lastCells) return
  lastCells = cells
  const blit = await $.ui.blit({ requestId, key: RASTER, cells })
  if ('deny' in blit && blit.deny) terminal = null
}

async function loadPrefs($: EngineInterface): Promise<void> {
  const savedShown = await $.store.get('shown')
  const savedSize = await $.store.get('size')
  if (typeof savedShown === 'boolean') await update($, shown, () => savedShown)
  if (savedSize === 'small' || savedSize === 'big') await update($, size, () => savedSize as ClawdSize)
  const pinned = await $.store.get('pinned')
  if (pinned === 'left' || pinned === 'center') stage.pinned = pinned === 'left' ? 2 : Math.floor(stage.width / 2) - 6
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'clawd',
      description: 'Show, hide or cheer on Clawd, the dancing Claude above your prompt',
      argumentHint: '[dance|love|angry|sleep|code|big|small|left|right|hide|help]',
      immediate: true,
    })
    await loadPrefs($)
    stage.enter()
    stage.play('hello', FPS * 3)
    $.clock.every(1000 / FPS, () => void tick($))

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    if (text && !text.startsWith('/')) {
      if (KIND.test(text)) stage.play('love', FPS * 3)
      else if (CROSS.test(text) || SHOUTING.test(text)) stage.play('angry', FPS * 3)
      else stage.play('excited', 12)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    errors = 0
    stage.setBase('thinking')

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const mood = moodForTool(e.tool)
    if (stage.emote === 'excited') stage.clearEmote()
    stage.setBase(mood)
    const ran = await next(e)
    if (ran.deny !== undefined) {
      stage.play('oops', FPS * 2)
    } else if (ran.isError) {
      errors++
      stage.play(errors >= 3 ? 'angry' : 'oops', errors >= 3 ? FPS * 3 : FPS * 2)
    }
    if (stage.base === mood) stage.setBase('thinking')

    return ran
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    stage.setBase('asking')

    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (/permission/i.test(e.notification_type)) stage.setBase('asking')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    stage.setBase('idle')
    if (e.reason === 'answer') stage.play('dance', FPS * 5)
    else if (e.reason === 'aborted') stage.play('oops', FPS * 1.5)
    else if (e.reason === 'error') stage.play('oops', FPS * 3)

    return next(e)
  })

  on('command.run', { command: 'clawd' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()
    const say = (text: string) => ({ text })

    if (word === '' || word === 'toggle') {
      const now = !(await read($, shown))
      await update($, shown, () => now)
      await $.store.set('shown', now)
      if (now) stage.play('hello', FPS * 2)
      return say(now ? 'Clawd is back ✶' : 'Clawd is taking a break. /clawd brings it back.')
    }
    if (word === 'show' || word === 'on' || word === 'hide' || word === 'off') {
      const now = word === 'show' || word === 'on'
      await update($, shown, () => now)
      await $.store.set('shown', now)
      return say(now ? 'Clawd is back ✶' : 'Clawd is taking a break.')
    }
    if (word === 'big' || word === 'small' || word === 'large') {
      const next: ClawdSize = word === 'small' ? 'small' : 'big'
      await update($, size, () => next)
      await $.store.set('size', next)
      return say(`Clawd is ${next} now.`)
    }
    if (word === 'left' || word === 'center' || word === 'centre' || word === 'right' || word === 'home') {
      const spot = word === 'centre' ? 'center' : word === 'home' ? 'right' : word
      stage.pinned = spot === 'left' ? 2 : spot === 'center' ? Math.floor(stage.width / 2) - 6 : null
      await $.store.set('pinned', spot)
      return say(`Clawd wanders over to the ${spot}.`)
    }
    const mood = ALIASES[word] ?? (MOODS as string[]).find(m => m === word)
    if (mood) {
      if (!(await read($, shown))) {
        await update($, shown, () => true)
        await $.store.set('shown', true)
      }
      stage.play(mood as Mood, mood === 'sleepy' ? FPS * 12 : FPS * 6)
      return say(`Clawd: ${word}!`)
    }
    return say(HELP)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, shown))) {
      if (e.surface === 'terminal') terminal = null
      else desktop = false
      return next(e)
    }

    if (e.surface === 'terminal') {
      const { Box, Raster } = $.ui.resolve(e)
      const scale = (await read($, size)) === 'big' ? 2 : 1
      const columns = Math.max(16, e.props.bodyColumns - (e.props.bodyColumns % scale))
      const width = Math.floor(columns / scale)
      if (width !== stage.width) {
        stage.resize(width)
        lastFrame = null
      }
      const frame = lastFrame && lastFrame.w === width ? lastFrame : stage.tick()
      const raster = rasterCells(upscale(frame, scale))
      terminal = { requestId: e.requestId, scale, columns }
      lastCells = raster.cells

      return (
        <Box flexDirection="column">
          <Raster key={RASTER} columns={raster.columns} rows={raster.rows} cells={raster.cells} />
        </Box>
      )
    }

    if (e.surface === 'desktop') {
      const { Box, Svg } = $.ui.resolve(e)
      const now = await read($, scene)
      desktop = true
      lastScene = `${now.mood}/${now.clip}`
      const clips = CLIPS[(MOODS as string[]).includes(now.mood) ? (now.mood as Mood) : 'idle']
      const clip = clips.find(c => c.name === now.clip) ?? clips[0]
      const big = (await read($, size)) === 'big'
      const svg = animatedSvg(clipFrames(clip, 40), FPS, big ? 8 : 5)

      return (
        <Box flexDirection="row" justifyContent="flex-end">
          <Svg source={svg} alt={`Clawd, ${now.mood}`} isInteractive />
        </Box>
      )
    }

    return next(e)
  })
}
