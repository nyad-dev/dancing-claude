import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ClawdScene, ClawdSize } from '../types'
import { CLIPS, FPS, MOODS, SIZES, Stage, animatedSvg, clipFrames, rasterCells, stageWidth, upscale } from './clawd.ts'
import type { Canvas, Mood } from './clawd.ts'

const shown = atom({ plugin: 'dancing-claude', key: 'shown' } as const, true)
const size = atom({ plugin: 'dancing-claude', key: 'size' } as const, 'tiny')
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
  happy: 'happy', yay: 'happy', cheer: 'happy',
  love: 'love', pet: 'love', hug: 'love', heart: 'love',
  angry: 'angry', mad: 'angry', grr: 'angry', rage: 'angry',
  sleep: 'sleepy', nap: 'sleepy', sleepy: 'sleepy',
  code: 'coding', coding: 'coding', laptop: 'coding',
  notes: 'notes', write: 'notes',
  read: 'reading', reading: 'reading', search: 'reading',
  think: 'thinking', thinking: 'thinking', hmm: 'thinking',
  run: 'running', running: 'running', bash: 'running',
  hello: 'hello', hi: 'hello', wave: 'hello',
  oops: 'oops', eek: 'oops', ask: 'asking', asking: 'asking',
  excited: 'excited', hype: 'excited', idle: 'idle',
}

const HELP = '/clawd [dance|happy|love|angry|sleep|code|notes|…] · tiny|small|big · left|center|right · hide|show'

const stage = new Stage(80, Date.now() & 0xffff)
let terminal: { requestId: string; size: ClawdSize } | null = null
let desktop = false
let lastCells = ''
let lastFrame: Canvas | null = null
let lastScene = ''
let errors = 0
let lastCheer = 0

function sceneKey(): string {
  return `${stage.mood}/${stage.clip.name}`
}

function cellsFor(frame: Canvas, s: ClawdSize) {
  const { encoding, scale } = SIZES[s]
  return rasterCells(upscale(frame, scale), encoding)
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
  const { requestId } = terminal
  const { cells } = cellsFor(frame, terminal.size)
  if (cells === lastCells) return
  lastCells = cells
  const blit = await $.ui.blit({ requestId, key: RASTER, cells })
  if ('deny' in blit && blit.deny) terminal = null
}

async function loadPrefs($: EngineInterface): Promise<void> {
  const savedShown = await $.store.get('shown')
  const savedSize = await $.store.get('size')
  if (typeof savedShown === 'boolean') await update($, shown, () => savedShown)
  if (savedSize === 'tiny' || savedSize === 'small' || savedSize === 'big') await update($, size, () => savedSize as ClawdSize)
  const pinned = await $.store.get('pinned')
  if (pinned === 'left' || pinned === 'center') stage.pinned = pinned === 'left' ? 2 : Math.floor(stage.width / 2) - 6
}

async function runCommand($: EngineInterface, word: string): Promise<string> {
  if (word === '' || word === 'toggle' || word === 'show' || word === 'on' || word === 'hide' || word === 'off') {
    const now = word === 'show' || word === 'on' ? true : word === 'hide' || word === 'off' ? false : !(await read($, shown))
    await update($, shown, () => now)
    await $.store.set('shown', now)
    if (now) stage.play('hello', FPS * 2)
    return now ? 'Clawd is back ✶' : 'Clawd is taking a break (/clawd brings it back)'
  }
  if (word === 'tiny' || word === 'small' || word === 'big') {
    await update($, size, () => word)
    await $.store.set('size', word)
    return `Clawd is ${word} now`
  }
  if (word === 'left' || word === 'center' || word === 'right' || word === 'home') {
    const spot = word === 'home' ? 'right' : word
    stage.pinned = spot === 'left' ? 2 : spot === 'center' ? Math.floor(stage.width / 2) - 6 : null
    stage.spot = null
    await $.store.set('pinned', spot)
    return `Clawd wanders over to the ${spot}`
  }
  const mood = ALIASES[word] ?? (MOODS as string[]).find(m => m === word)
  if (!mood) return HELP
  if (!(await read($, shown))) {
    await update($, shown, () => true)
    await $.store.set('shown', true)
  }
  stage.play(mood as Mood, mood === 'sleepy' ? FPS * 12 : FPS * 6)
  return ''
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'clawd',
      description: 'Cheer on, resize or hide Clawd',
      argumentHint: '[dance|happy|love|angry|tiny|small|big|left|right|hide]',
      immediate: true,
    })
    await loadPrefs($)
    stage.enter()
    stage.play('hello', FPS * 3)
    $.clock.every(1000 / FPS, () => void tick($))

    return next(e)
  })

  on('prompt.edit', ($, e, next) => {
    stage.typing()

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    if (text && !text.startsWith('/')) {
      stage.typingLeft = 0
      if (stage.base === 'notes') stage.setBase('idle')
      if (KIND.test(text)) stage.play('love', FPS * 4)
      else if (CROSS.test(text) || SHOUTING.test(text)) stage.play('angry', FPS * 4)
      else stage.play('excited', 15)
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
    stage.setBase(mood)
    const ran = await next(e)
    if (ran.deny !== undefined) {
      stage.play('oops', FPS * 3)
    } else if (ran.isError) {
      errors++
      stage.play(errors >= 3 ? 'angry' : 'oops', FPS * 3)
    } else if (mood === 'coding') {
      const now = await $.clock.now()
      if (now - lastCheer > 25_000) {
        lastCheer = now
        stage.play('happy', FPS * 3)
      }
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
    if (e.reason === 'answer') stage.play('dance', FPS * 8)
    else if (e.reason === 'aborted') stage.play('oops', FPS * 2)
    else if (e.reason === 'error') stage.play('oops', FPS * 3)

    return next(e)
  })

  // Answered with a toast and no text, so /clawd never costs the model a token.
  on('command.run', { command: 'clawd' }, async ($, e) => {
    const said = await runCommand($, e.args.trim().toLowerCase())
    if (said) $.ui.toast(said)

    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, shown))) {
      if (e.surface === 'terminal') terminal = null
      else desktop = false
      return next(e)
    }
    const s = await read($, size)

    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const width = stageWidth(e.props.bodyColumns, s)
      if (width !== stage.width) {
        stage.resize(width)
        lastFrame = null
      }
      const frame = lastFrame && lastFrame.w === width ? lastFrame : stage.tick()
      const raster = cellsFor(frame, s)
      terminal = { requestId: e.requestId, size: s }
      lastCells = raster.cells

      return <Raster key={RASTER} columns={raster.columns} rows={raster.rows} cells={raster.cells} />
    }

    if (e.surface === 'desktop') {
      const { Box, Svg } = $.ui.resolve(e)
      const now = await read($, scene)
      desktop = true
      lastScene = `${now.mood}/${now.clip}`
      const clips = CLIPS[(MOODS as string[]).includes(now.mood) ? (now.mood as Mood) : 'idle']
      const clip = clips.find(c => c.name === now.clip) ?? clips[0]
      const svg = animatedSvg(clipFrames(clip, 40), FPS, s === 'big' ? 8 : s === 'small' ? 5 : 3)

      return (
        <Box flexDirection="row" justifyContent="flex-end">
          <Svg source={svg} alt={`Clawd, ${now.mood}`} isInteractive />
        </Box>
      )
    }

    return next(e)
  })
}
