// One representative frame per mood, in a grid with a caption strip, for the README.
//   node tools/poster.ts docs/moods.png
import { CLIPS, STAGE_H, clipFrames, type Mood } from '../plugin/hooks/clawd.ts'
import { writePng } from './png.ts'

const out = process.argv[2] ?? 'docs/moods.png'
const SCALE = 8
const FW = 30
const COLS = 4
const BG = [0x26, 0x24, 0x22]

const picks: [Mood, string, number][] = [
  ['idle', 'breathe', 0], ['hello', 'wave', 4], ['thinking', 'ponder', 20], ['reading', 'scan', 28],
  ['coding', 'type', 1], ['running', 'dash', 1], ['asking', 'wave-both', 3], ['love', 'smitten', 5],
  ['dance', 'bounce', 3], ['dance', 'disco', 2], ['dance', 'spin', 13], ['angry', 'stomp', 0],
  ['oops', 'eek', 2], ['sleepy', 'snooze', 30], ['excited', 'hop', 3], ['coding', 'proud', 2],
]

const rows = Math.ceil(picks.length / COLS)
const W = COLS * FW * SCALE
const H = rows * STAGE_H * SCALE
const img = Buffer.alloc(W * H * 3)
for (let i = 0; i < img.length; i += 3) img.set(BG, i)

picks.forEach(([mood, name, f], i) => {
  const clip = CLIPS[mood].find(c => c.name === name)!
  const cv = clipFrames(clip, FW)[f]!
  const ox = (i % COLS) * FW * SCALE
  const oy = Math.floor(i / COLS) * STAGE_H * SCALE
  for (let y = 0; y < STAGE_H * SCALE; y++)
    for (let x = 0; x < FW * SCALE; x++) {
      const c = cv.get(Math.floor(x / SCALE), Math.floor(y / SCALE))
      if (!c) continue
      const o = ((oy + y) * W + ox + x) * 3
      img[o] = (c >> 16) & 255
      img[o + 1] = (c >> 8) & 255
      img[o + 2] = c & 255
    }
})

writePng(out, W, H, img)
console.log(`wrote ${out}: ${picks.map(p => p[0]).join(', ')}`)
