// Renders every clip's frames to a PNG sprite sheet, for eyeballing the art.
//   node tools/sheet.ts [out.png] [mood...]
import { CLIPS, STAGE_H, clipFrames, type Mood } from '../plugin/hooks/clawd.ts'
import { writePng } from './png.ts'

const out = process.argv[2] ?? 'sheet.png'
const only = process.argv.slice(3) as Mood[]
const SCALE = Number(process.env.SCALE ?? 6)
const FW = Number(process.env.FW ?? 40)
const PER_ROW = Number(process.env.PER_ROW ?? 16)
const GAP = 2
const BG = [0x1e, 0x1e, 0x1e]
const LIGHT = [0xf5, 0xf2, 0xea]

const rows: { label: string; frames: ReturnType<typeof clipFrames> }[] = []
for (const [mood, clips] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(mood as Mood)) continue
  for (const clip of clips) rows.push({ label: `${mood}/${clip.name}`, frames: clipFrames(clip, FW) })
}

const lines = rows.flatMap(r => {
  const out = []
  for (let i = 0; i < r.frames.length; i += PER_ROW) out.push(r.frames.slice(i, i + PER_ROW))
  return out
})
const W = PER_ROW * (FW + GAP) * SCALE
const H = lines.length * (STAGE_H + GAP) * SCALE
const img = Buffer.alloc(W * H * 3)

lines.forEach((frames, li) => {
  frames.forEach((cv, fi) => {
    const ox = fi * (FW + GAP) * SCALE
    const oy = li * (STAGE_H + GAP) * SCALE
    const back = li % 2 ? LIGHT : BG
    for (let y = 0; y < STAGE_H * SCALE; y++)
      for (let x = 0; x < FW * SCALE; x++) {
        const c = cv.get(Math.floor(x / SCALE), Math.floor(y / SCALE))
        const o = ((oy + y) * W + ox + x) * 3
        if (c) {
          img[o] = (c >> 16) & 255; img[o + 1] = (c >> 8) & 255; img[o + 2] = c & 255
        } else {
          img[o] = back[0]; img[o + 1] = back[1]; img[o + 2] = back[2]
        }
      }
  })
})

console.log(rows.map(r => `${r.label} (${r.frames.length})`).join('\n'))

writePng(out, W, H, img)
