// Previews clips as the terminal would draw them in quarter-blocks (the tiny size).
//   node tools/tiny.ts out.png [mood...]
import { CLIPS, cellsOf, clipFrames, type Mood } from '../plugin/hooks/clawd.ts'
import { writePng } from './png.ts'

const out = process.argv[2] ?? 'tiny.png'
const only = process.argv.slice(3) as Mood[]
const CW = 10 // cell width in image pixels; a cell is twice as tall
const FW = 36
const PER_ROW = 8
const BG = [0x1e, 0x1e, 0x1e]

const frames = Object.entries(CLIPS)
  .filter(([m]) => !only.length || only.includes(m as Mood))
  .flatMap(([, clips]) => clips.flatMap(c => clipFrames(c, FW).filter((_, i) => i % 2 === 0)))
const cells = frames.map(f => cellsOf(f, 'quad'))
const cols = cells[0]!.columns
const rows = cells[0]!.rows
const tw = (cols + 1) * CW
const th = (rows + 1) * CW * 2
const W = PER_ROW * tw
const H = Math.ceil(cells.length / PER_ROW) * th
const img = Buffer.alloc(W * H * 3)
for (let i = 0; i < img.length; i += 3) img.set(BG, i)
const put = (x: number, y: number, c: number) => {
  const o = (y * W + x) * 3
  img[o] = (c >> 16) & 255; img[o + 1] = (c >> 8) & 255; img[o + 2] = c & 255
}
cells.forEach((c, n) => {
  const ox = (n % PER_ROW) * tw
  const oy = Math.floor(n / PER_ROW) * th
  for (let r = 0; r < c.rows; r++)
    for (let x = 0; x < c.columns; x++) {
      const i = r * c.columns + x
      const ch = c.ch[i]!
      const QUADS = [0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588]
      const mask = Math.max(0, QUADS.indexOf(ch))
      for (let k = 0; k < 4; k++) {
        const on = (mask >> k) & 1
        const col = on ? c.fg[i]! : c.bg[i]!
        if (col >= 0x01000000) continue
        for (let yy = 0; yy < CW; yy++)
          for (let xx = 0; xx < CW / 2; xx++) put(ox + x * CW + (k & 1) * (CW / 2) + xx, oy + r * CW * 2 + (k >> 1) * CW + yy, col)
      }
    }
})
writePng(out, W, H, img)
