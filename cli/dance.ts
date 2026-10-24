#!/usr/bin/env node
// Clawd in any terminal, no Claude Code needed.
//   node cli/dance.ts            a little show: every mood in turn
//   node cli/dance.ts dance      one mood, on repeat
//   node cli/dance.ts --tiny     logo-sized (also --big)
// Keys: ←/→ change mood, space dances, h/l walk Clawd around, q quits.
import { FPS, MOODS, SIZES, Stage, ansiLines, stageWidth, upscale, type Mood, type Size } from '../plugin/hooks/clawd.ts'

const args = process.argv.slice(2)
const size: Size = args.includes('--big') ? 'big' : args.includes('--tiny') ? 'tiny' : 'small'
const { encoding, scale } = SIZES[size]
const only = args.find(a => !a.startsWith('-')) as Mood | undefined
if (only && !MOODS.includes(only)) {
  console.error(`Unknown mood "${only}". Try one of: ${MOODS.join(', ')}`)
  process.exit(1)
}

const out = process.stdout
const width = () => Math.max(24, stageWidth(Math.min(out.columns ?? 80, 160), size))
const stage = new Stage(width(), Date.now() & 0xffff)
stage.even = encoding === 'quad'
let index = only ? MOODS.indexOf(only) : 0
let shownFor = 0
const SHOW_EACH = FPS * 5

const show = (mood: Mood) => {
  stage.setBase(mood === 'thinking' ? 'thinking' : 'idle')
  if (mood !== 'idle' && mood !== 'thinking') stage.play(mood, only ? Number.MAX_SAFE_INTEGER : SHOW_EACH)
  else stage.clearEmote()
  shownFor = 0
}

stage.enter()
show(MOODS[index])

let drawn = 0
const draw = () => {
  if (stage.width !== width()) stage.resize(width())
  const lines = ansiLines(upscale(stage.tick(), scale), encoding)
  const label = `\x1b[2m  ${stage.mood.padEnd(10)}  ←/→ mood · space dance · h/l walk · q quit\x1b[0m`
  let s = drawn ? `\x1b[${drawn}F` : ''
  for (const line of [...lines, label]) s += '\x1b[2K' + line + '\n'
  out.write(s)
  drawn = lines.length + 1
  if (!only && ++shownFor >= SHOW_EACH) {
    index = (index + 1) % MOODS.length
    show(MOODS[index])
  }
}

const quit = () => {
  clearInterval(timer)
  out.write('\x1b[?25h')
  process.exit(0)
}

out.on('error', quit)
out.write('\x1b[?25l')
const timer = setInterval(draw, 1000 / FPS)
process.on('SIGINT', quit)

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', (buf: Buffer) => {
    const k = buf.toString()
    if (k === 'q' || k === '\x03' || k === '\x1b') quit()
    else if (k === ' ') stage.play('dance', FPS * 5)
    else if (k === '\x1b[C' || k === '\x1b[D') {
      index = (index + (k === '\x1b[C' ? 1 : MOODS.length - 1)) % MOODS.length
      show(MOODS[index])
    } else if (k === 'h' || k === 'l') {
      const step = k === 'h' ? -8 : 8
      stage.pinned = Math.max(2, Math.min(stage.width - 16, (stage.pinned ?? stage.home) + step))
    }
  })
}
