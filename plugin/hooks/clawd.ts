// Clawd, the little Claude Code critter, as pixel art.
//
// One engine shared by the plugin (terminal Raster, desktop SVG) and the
// standalone CLI (ANSI). No imports, no Node, no DOM: plain TypeScript that
// both the plugin sandbox and `node` (type stripping) run as is.
//
// Geometry is the welcome-screen logo at half-block resolution: a 12x8 body,
// 1x2 eyes, 2x2 arm nubs and four 1x2 legs. Everything is drawn in "base
// pixels"; two stacked pixels make one terminal cell (▀ / ▄).

export type Color = number // 0xRRGGBB; 0 is transparent

export const PALETTE = {
  body: 0xd97757,
  back: 0xc4664a,
  angry: 0xe8553f,
  eye: 0x2a1a14,
  blush: 0xf7a1a8,
  heart: 0xff5c8a,
  note: 0xf6e7c8,
  note2: 0x9fd0ff,
  spark: 0xffd966,
  z: 0x9db8d9,
  sweat: 0x7ec8f2,
  vein: 0xff3b30,
  steam: 0xb9b9b9,
  think: 0xc4c4c4,
  lid: 0xcfd3d8,
  lidEdge: 0x8a9097,
  keys: 0x5f6368,
  glass: 0xbfe6ff,
  rim: 0x9aa0a6,
  term: 0x7ee787,
  bang: 0xffb84d,
  ask: 0x8ab4f8,
  shadow: 0x3b322e,
  code1: 0x7ee787,
  code2: 0x8ab4f8,
  code3: 0xffa657,
} as const

/** Rows of the stage in base pixels: 5 of headroom, 8 of body, 2 of legs, 1 of shadow. */
export const STAGE_H = 16
/** Body top while standing. */
const TOP = 5
export const FPS = 10

// ---------------------------------------------------------------- canvas

export class Canvas {
  w: number
  h: number
  px: Uint32Array
  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.px = new Uint32Array(w * h)
  }
  set(x: number, y: number, c: Color): void {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.px[y * this.w + x] = c
  }
  get(x: number, y: number): Color {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0
    return this.px[y * this.w + x]
  }
  rect(x: number, y: number, w: number, h: number, c: Color): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
  }
  /** Paints a bitmap: `#` in `c`, other letters from `pal`, anything else skipped. */
  bits(x: number, y: number, rows: readonly string[], c: Color, mirror = false, pal?: Record<string, Color>): void {
    for (let j = 0; j < rows.length; j++) {
      const row = mirror ? [...rows[j]].reverse().join('') : rows[j]
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]
        const col = ch === '#' ? c : pal?.[ch]
        if (col) this.set(x + i, y + j, col)
      }
    }
  }
}

/** Nearest-neighbour upscale, for the large size. */
export function upscale(src: Canvas, k: number): Canvas {
  if (k === 1) return src
  const out = new Canvas(src.w * k, src.h * k)
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) out.px[y * out.w + x] = src.px[Math.floor(y / k) * src.w + Math.floor(x / k)]
  return out
}

// ---------------------------------------------------------------- pose

export type Eyes =
  | 'open' | 'blink' | 'happy' | 'closed' | 'squint' | 'wide'
  | 'heart' | 'star' | 'dizzy' | 'angry' | 'sad' | 'none'
export type Arm = 'out' | 'down' | 'up' | 'high' | 'hidden'
export type Facing = 'front' | 'side' | 'back'

export type Prop = { s: Sprite; x: number; y: number; c?: Color; mirror?: boolean }

export type Pose = {
  dx: number
  dy: number
  /** 1: wider and shorter (landing), -1: narrower and taller (stretch). */
  squash: -1 | 0 | 1
  /** Shifts the top half of the body: a groove, a lean into a run. */
  lean: number
  eyes: Eyes
  lookX: number
  lookY: number
  armL: Arm
  armR: Arm
  /** Lift per leg, left to right: 0 down, 1 raised, 2 tucked. */
  legs: readonly [number, number, number, number]
  blush: boolean
  facing: Facing
  /** Which way a side view faces: 1 right, -1 left. */
  dir: 1 | -1
  tint: Color
  shadow: boolean
  laptop: false | 0 | 1
  /** Drawn behind the body, relative to the body's resting top-left. */
  behind: Prop[]
  /** Drawn over the body, relative to the body's resting top-left. */
  props: Prop[]
}

export function pose(p: Partial<Pose> = {}): Pose {
  return {
    dx: 0, dy: 0, squash: 0, lean: 0, eyes: 'open', lookX: 0, lookY: 0,
    armL: 'out', armR: 'out', legs: [0, 0, 0, 0], blush: false,
    facing: 'front', dir: 1, tint: PALETTE.body, shadow: true, laptop: false,
    behind: [], props: [],
    ...p,
  }
}

// ---------------------------------------------------------------- sprites

export type Sprite = { rows: readonly string[]; c: Color; pal?: Record<string, Color> }

const S = (c: Color, ...rows: string[]): Sprite => ({ rows, c })

export const SPRITES = {
  note: S(PALETTE.note, '.##', '.#.', '##.', '##.'),
  note2: S(PALETTE.note2, '.#.', '.##', '##.', '##.'),
  heart: S(PALETTE.heart, '#.#', '###', '.#.'),
  bigHeart: S(PALETTE.heart, '##.##', '#####', '.###.', '..#..'),
  spark: S(PALETTE.spark, '.#.', '###', '.#.'),
  dot: S(PALETTE.spark, '#'),
  z: S(PALETTE.z, '###', '.#.', '###'),
  Z: S(PALETTE.z, '####', '..#.', '.#..', '####'),
  bang: S(PALETTE.bang, '#', '#', '.', '#'),
  ask: S(PALETTE.ask, '##.', '..#', '.#.', '...', '.#.'),
  sweat: S(PALETTE.sweat, '.#', '##', '##'),
  vein: S(PALETTE.vein, '.#.#.', '##.##', '.....', '##.##', '.#.#.'),
  smallVein: S(PALETTE.vein, '#.#', '...', '#.#'),
  puff: S(PALETTE.steam, '.#.', '###'),
  puffSmall: S(PALETTE.steam, '#'),
  thinkS: S(PALETTE.think, '#'),
  thinkM: S(PALETTE.think, '##'),
  thinkL: S(PALETTE.think, '.##.', '####', '.##.'),
  prompt: S(PALETTE.term, '#...', '.#..', '#.##'),
  promptOff: S(PALETTE.term, '#...', '.#..', '#...'),
  dash: S(PALETTE.steam, '##'),
  code1: S(PALETTE.code1, '#'),
  code2: S(PALETTE.code2, '#'),
  code3: S(PALETTE.code3, '#'),
  magnifier: { rows: ['.rr.', 'rggr', 'rggr', '.rr.', '...h', '....'], c: 0, pal: { r: PALETTE.rim, g: PALETTE.glass, h: PALETTE.rim } },
  mini: { rows: ['.bbbbbb.', '.beb.eb.', 'bbbbbbbb', '.bbbbbb.', '.b.b.b..'], c: 0, pal: { b: PALETTE.body, e: PALETTE.eye } },
  miniHop: { rows: ['.bbbbbb.', '.ebbbbe.', 'bbbbbbbb', '.bbbbbb.', '..b..b..'], c: 0, pal: { b: PALETTE.body, e: PALETTE.eye } },
  miniHappy: { rows: ['b.bbbb.b', 'bbebbebb', '.bbbbbb.', '.bbbbbb.', '.b.b.b..'], c: 0, pal: { b: PALETTE.body, e: PALETTE.eye } },
} satisfies Record<string, Sprite>

// Each eye is anchored on its 1x2 slot; the right eye is the left one mirrored.
const EYES: Record<Exclude<Eyes, 'none'>, { rows: string[]; ox: number; oy: number; c?: Color }> = {
  open: { rows: ['#', '#'], ox: 0, oy: 0 },
  blink: { rows: ['#'], ox: 0, oy: 1 },
  happy: { rows: ['.#.', '#.#'], ox: -1, oy: 0 },
  closed: { rows: ['#.#', '.#.'], ox: -1, oy: 0 },
  squint: { rows: ['#.', '.#', '#.'], ox: -1, oy: -1 },
  wide: { rows: ['##', '##', '##'], ox: 0, oy: -1 },
  heart: { rows: ['#.#', '###', '.#.'], ox: -1, oy: -1, c: PALETTE.heart },
  star: { rows: ['.#.', '###', '.#.'], ox: -1, oy: -1, c: PALETTE.spark },
  dizzy: { rows: ['#.#', '.#.', '#.#'], ox: -1, oy: -1 },
  angry: { rows: ['#.', '.#', '.#'], ox: -1, oy: -1 },
  sad: { rows: ['.#', '#.', '#.'], ox: -1, oy: -1 },
}

// Arms, in "outward" coordinates: x 0 is the first column outside the body.
const ARMS: Record<Exclude<Arm, 'hidden'>, readonly (readonly [number, number, number, number])[]> = {
  out: [[0, 4, 2, 2]],
  down: [[0, 5, 1, 3]],
  up: [[0, 4, 2, 1], [1, 2, 2, 2]],
  high: [[0, 4, 2, 1], [1, -1, 1, 5]],
}

// ---------------------------------------------------------------- drawing

/**
 * Draws Clawd with its body's resting top-left at (x0, TOP).
 */
export function drawClawd(cv: Canvas, p: Pose, x0: number): void {
  const restX = Math.round(x0)
  const X = restX + p.dx
  const s = p.facing === 'side' ? 0 : p.squash
  const bw = p.facing === 'side' ? 8 : 12 + 2 * s
  const bh = 8 - s
  const left = p.facing === 'side' ? X + 2 : X - s
  const right = left + bw
  const top = TOP + p.dy + s
  const legTop = TOP + p.dy + 8

  for (const q of p.behind) cv.bits(restX + q.x, TOP + q.y, q.s.rows, q.c ?? q.s.c, q.mirror, q.s.pal)

  if (p.shadow) {
    const lift = Math.max(0, -p.dy)
    const sw = Math.max(4, bw - 2 - lift * 2)
    cv.rect(left + Math.round((bw - sw) / 2), TOP + 10, sw, 1, PALETTE.shadow)
  }

  const body = p.facing === 'back' ? PALETTE.back : p.tint

  // legs
  const legXs = p.facing === 'side' ? [left + 1, left + 5] : [left + 1, left + 3, right - 4, right - 2]
  legXs.forEach((lx, i) => {
    const lift = p.facing === 'side' ? p.legs[i * 2] : p.legs[i]
    const h = 2 - lift
    if (h > 0) cv.rect(lx, legTop, 1, h, body)
  })

  // arms (behind the body edge, so draw first)
  const arm = (a: Arm, side: -1 | 1) => {
    if (a === 'hidden') return
    for (const [ox, y, w, h] of ARMS[a]) {
      const ax = side < 0 ? left - ox - w : right + ox
      cv.rect(ax, top + y + (a === 'out' || a === 'down' ? 0 : 0), w, h, body)
    }
  }
  if (p.facing === 'front') {
    arm(p.armL, -1)
    arm(p.armR, 1)
  } else if (p.facing === 'side') {
    arm(p.dir > 0 ? p.armR : p.armL, p.dir)
  } else {
    arm(p.armR, -1)
    arm(p.armL, 1)
  }

  // body, with the top half leaning
  for (let r = 0; r < bh; r++) cv.rect(left + (r < 4 ? p.lean : 0), top + r, bw, 1, body)

  // face
  const eyeY = top + 2 + p.lookY
  const lean = p.lean
  if (p.facing === 'front' && p.eyes !== 'none') {
    const e = EYES[p.eyes]
    const look = p.eyes === 'open' || p.eyes === 'blink' || p.eyes === 'wide' ? p.lookX : 0
    const lx = left + 2 + lean + look
    const rx = right - 3 + lean + look
    const c = e.c ?? PALETTE.eye
    cv.bits(lx + e.ox, eyeY + e.oy, e.rows, c)
    const w = e.rows[0].length
    cv.bits(rx - (e.ox + w - 1), eyeY + e.oy, e.rows, c, true)
    if (p.blush) {
      cv.set(left + 1 + lean, top + 4, PALETTE.blush)
      cv.set(right - 2 + lean, top + 4, PALETTE.blush)
    }
  } else if (p.facing === 'side' && p.eyes !== 'none') {
    const ex = p.dir > 0 ? right - 2 : left + 1
    const e = p.eyes === 'blink' || p.eyes === 'closed' || p.eyes === 'happy' ? EYES.blink : EYES.open
    cv.bits(ex, eyeY + e.oy, e.rows, PALETTE.eye)
  }

  if (p.laptop !== false) drawLaptop(cv, X, top, p.laptop)

  for (const q of p.props) cv.bits(restX + q.x, TOP + q.y, q.s.rows, q.c ?? q.s.c, q.mirror, q.s.pal)
}

function drawLaptop(cv: Canvas, X: number, top: number, typing: 0 | 1): void {
  // the lid, seen from behind, in front of Clawd's tummy
  cv.rect(X + 2, top + 5, 8, 3, PALETTE.lid)
  cv.rect(X + 2, top + 7, 8, 1, PALETTE.lidEdge)
  cv.set(X + 6, top + 6, PALETTE.body) // a tiny logo
  cv.rect(X, top + 8, 12, 1, PALETTE.keys)
  // paws on the keys, taking turns
  cv.rect(X + 2, top + 4 + typing, 2, 1, PALETTE.body)
  cv.rect(X + 8, top + 5 - typing, 2, 1, PALETTE.body)
}

// ---------------------------------------------------------------- clips

/** Deterministic noise in [0, 1) for a seed and a step. */
export function noise(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n + 0x9e37, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export type Clip = {
  name: string
  len: number
  /** How often the clip is picked among its mood's clips. */
  weight?: number
  frame: (f: number, seed: number) => Pose
}

const cyc = <T,>(f: number, xs: readonly T[]): T => xs[((f % xs.length) + xs.length) % xs.length]

/** Blinks on a couple of seeded frames of a clip. */
function blinks(f: number, seed: number, len: number): boolean {
  const a = Math.floor(noise(seed, 1) * len)
  const b = Math.floor(noise(seed, 2) * len)
  return f === a || (noise(seed, 3) < 0.4 && f === b)
}

/** Music notes drifting up beside Clawd. */
function notes(f: number, x: number, period = 12): Prop[] {
  const out: Prop[] = []
  for (let k = 0; k < 2; k++) {
    const t = (f + k * (period / 2)) % period
    const y = 1 - Math.floor(t / 2)
    if (y < -3) continue
    const side = (Math.floor((f + k * (period / 2)) / period) + k) % 2
    out.push({ s: side ? SPRITES.note : SPRITES.note2, x: side ? x + 15 : x - 6 + (t % 4 < 2 ? 0 : 1), y })
  }
  return out
}

function hearts(f: number, period = 14): Prop[] {
  const out: Prop[] = []
  for (let k = 0; k < 2; k++) {
    const t = (f + k * (period / 2)) % period
    const y = 2 - Math.floor(t / 2)
    if (y < -3) continue
    out.push({ s: SPRITES.heart, x: k ? 14 + (t % 4 < 2 ? 0 : 1) : -5 - (t % 4 < 2 ? 0 : 1), y })
  }
  return out
}

const legsStep = (f: number): Pose['legs'] => cyc(f, [[1, 0, 1, 0], [0, 0, 0, 0], [0, 1, 0, 1], [0, 0, 0, 0]] as const)

export const WALK: Clip = {
  name: 'walk',
  len: 4,
  frame: f => pose({ legs: legsStep(f), armL: f % 4 < 2 ? 'out' : 'down', armR: f % 4 < 2 ? 'down' : 'out', dy: 0 }),
}

export const CLIPS = {
  idle: [
    {
      name: 'breathe', len: 40, weight: 3,
      frame: (f, seed) => pose({ squash: f % 20 >= 14 && f % 20 < 18 ? 1 : 0, eyes: blinks(f, seed, 40) ? 'blink' : 'open' }),
    },
    {
      name: 'look-around', len: 40, weight: 2,
      frame: (f, seed) => pose({
        lookX: f < 10 ? 0 : f < 20 ? -1 : f < 30 ? 1 : 0,
        eyes: blinks(f, seed, 40) || f === 20 ? 'blink' : 'open',
        lean: f >= 12 && f < 18 ? -1 : f >= 22 && f < 28 ? 1 : 0,
      }),
    },
    {
      name: 'hum', len: 36, weight: 1,
      frame: f => pose({ eyes: 'closed', lean: cyc(Math.floor(f / 6), [0, 1, 0, -1]), props: f > 6 ? notes(f, 0, 18).slice(0, 1) : [] }),
    },
    {
      name: 'tap-foot', len: 30, weight: 1,
      frame: (f, seed) => pose({ legs: [0, 0, 0, Math.floor(f / 3) % 2], eyes: blinks(f, seed, 30) ? 'blink' : 'open', lookX: 1 }),
    },
    {
      name: 'stretch', len: 30, weight: 1,
      frame: f => {
        const up = f >= 6 && f < 20
        return pose({ squash: up ? -1 : f >= 20 && f < 23 ? 1 : 0, armL: up ? 'high' : 'out', armR: up ? 'high' : 'out', eyes: up ? 'closed' : 'open' })
      },
    },
  ],
  sleepy: [
    {
      name: 'snooze', len: 40,
      frame: f => {
        const zs: Prop[] = []
        const t = f % 40
        if (t >= 4) zs.push({ s: SPRITES.z, x: 13, y: Math.max(-2, 1 - Math.floor((t - 4) / 8)) })
        if (t >= 20) zs.push({ s: SPRITES.Z, x: 16, y: Math.max(-3, 0 - Math.floor((t - 20) / 8)) })
        return pose({ eyes: 'blink', squash: t % 20 < 10 ? 0 : 1, armL: 'down', armR: 'down', props: zs })
      },
    },
  ],
  hello: [
    {
      name: 'wave', len: 24,
      frame: f => pose({
        eyes: 'happy', armL: 'out', armR: cyc(Math.floor(f / 3), ['up', 'high'] as const), blush: true,
        props: f % 6 < 3 ? [{ s: SPRITES.spark, x: 15, y: -3 }] : [{ s: SPRITES.dot, x: 16, y: -2 }],
      }),
    },
  ],
  excited: [
    {
      name: 'hop', len: 12,
      frame: f => pose({
        dy: cyc(f, [0, 0, -1, -2, -2, -1, 0, 0, 0, 0, 0, 0]),
        squash: f < 2 || f === 6 ? 1 : 0,
        eyes: 'wide',
        armL: f >= 2 && f <= 5 ? 'high' : 'out', armR: f >= 2 && f <= 5 ? 'high' : 'out',
        props: [{ s: SPRITES.bang, x: 14, y: -3 + (f % 4 < 2 ? 0 : 1) }],
      }),
    },
  ],
  thinking: [
    {
      name: 'ponder', len: 30, weight: 2,
      frame: f => {
        const t = f % 30
        const dots: Prop[] = []
        if (t >= 4) dots.push({ s: SPRITES.thinkS, x: 13, y: 0 })
        if (t >= 10) dots.push({ s: SPRITES.thinkM, x: 15, y: -2 })
        if (t >= 16) dots.push({ s: SPRITES.thinkL, x: 17, y: -5 })
        return pose({ eyes: t === 26 ? 'blink' : 'open', lookX: 1, lookY: -1, armR: 'up', props: dots })
      },
    },
    {
      name: 'hmm', len: 30, weight: 1,
      frame: f => pose({
        eyes: f % 30 < 15 ? 'open' : 'closed', lookX: -1, lookY: -1, lean: cyc(Math.floor(f / 5), [0, -1, 0, 1]),
        props: f % 30 >= 6 ? [{ s: SPRITES.ask, x: 14, y: -3 + (f % 10 < 5 ? 0 : 1) }] : [],
      }),
    },
    {
      name: 'idea', len: 24, weight: 1,
      frame: f => {
        const lit = f >= 12
        return pose({
          eyes: lit ? 'star' : 'open', lookY: lit ? 0 : -1, dy: f === 12 || f === 13 ? -1 : 0,
          armR: lit ? 'high' : 'up',
          props: lit ? [{ s: SPRITES.spark, x: 15, y: -3 + (f % 4 < 2 ? 0 : 1) }] : [{ s: SPRITES.thinkS, x: 13, y: 0 }],
        })
      },
    },
  ],
  reading: [
    {
      name: 'scan', len: 32,
      frame: f => {
        const found = f >= 26
        return pose({
          eyes: found ? 'wide' : 'open', lookX: found ? 1 : cyc(Math.floor(f / 4), [-1, 0, 1, 0]), lookY: 1,
          armR: 'up', props: [
            { s: SPRITES.magnifier, x: 13, y: -2 + (f % 8 < 4 ? 0 : 1) },
            ...(found ? [{ s: SPRITES.spark, x: 17, y: -3 }] : []),
          ],
        })
      },
    },
  ],
  coding: [
    {
      name: 'type', len: 24, weight: 3,
      frame: f => {
        const sparks: Prop[] = []
        for (let k = 0; k < 3; k++) {
          const t = (f + k * 4) % 12
          const s = [SPRITES.code1, SPRITES.code2, SPRITES.code3][k]
          sparks.push({ s, x: [-3, 6, 14][k] + (t % 4 < 2 ? 0 : 1), y: -1 - Math.floor(t / 3) })
        }
        return pose({ eyes: f === 20 ? 'blink' : 'open', lookY: 1, laptop: (f % 2) as 0 | 1, armL: 'hidden', armR: 'hidden', props: sparks })
      },
    },
    {
      name: 'proud', len: 16, weight: 1,
      frame: f => pose({
        eyes: 'happy', laptop: 0, armL: 'hidden', armR: 'hidden', dy: f === 2 || f === 3 ? -1 : 0, blush: true,
        props: [{ s: SPRITES.spark, x: -4, y: -2 + (f % 4 < 2 ? 0 : 1) }],
      }),
    },
  ],
  running: [
    {
      name: 'dash', len: 8,
      frame: f => pose({
        legs: cyc(f, [[2, 0, 2, 0], [0, 2, 0, 2]] as const),
        dy: f % 2 ? -1 : 0, lean: 1, eyes: 'squint',
        armL: f % 2 ? 'up' : 'down', armR: f % 2 ? 'down' : 'up',
        behind: [
          { s: SPRITES.dash, x: -5 - (f % 2), y: 3 },
          { s: SPRITES.dash, x: -6 + (f % 2), y: 6 },
        ],
        props: [{ s: f % 4 < 2 ? SPRITES.prompt : SPRITES.promptOff, x: 14, y: -3 }],
      }),
    },
  ],
  friends: [
    {
      name: 'party', len: 8,
      frame: f => {
        const a = f % 4 < 2
        return pose({
          eyes: 'happy', dy: a ? 0 : -1, armL: a ? 'out' : 'high', armR: a ? 'high' : 'out',
          props: [
            { s: a ? SPRITES.mini : SPRITES.miniHop, x: -20, y: a ? 4 : 3 },
            { s: a ? SPRITES.miniHop : SPRITES.miniHappy, x: -10, y: a ? 3 : 4 },
            ...notes(f, 0, 8).slice(0, 1),
          ],
        })
      },
    },
  ],
  asking: [
    {
      name: 'wave-both', len: 16,
      frame: f => {
        const a = Math.floor(f / 3) % 2 === 0
        return pose({
          eyes: f === 12 ? 'blink' : 'open', dy: f % 8 === 0 ? -1 : 0,
          armL: a ? 'high' : 'up', armR: a ? 'up' : 'high',
          props: [{ s: SPRITES.ask, x: 15, y: -3 + (f % 8 < 4 ? 0 : 1) }],
        })
      },
    },
  ],
  oops: [
    {
      name: 'eek', len: 24,
      frame: f => pose({
        dx: f < 6 ? cyc(f, [-1, 1]) : 0,
        eyes: f < 8 ? 'dizzy' : 'sad', armL: 'down', armR: f < 8 ? 'high' : 'up',
        props: f >= 6 ? [{ s: SPRITES.sweat, x: 12, y: Math.min(3, -1 + Math.floor((f - 6) / 3)) }] : [],
      }),
    },
  ],
  angry: [
    {
      name: 'stomp', len: 16, weight: 2,
      frame: f => {
        const stomp = Math.floor(f / 2) % 2
        return pose({
          eyes: 'angry', tint: f % 4 < 2 ? PALETTE.angry : PALETTE.body,
          legs: stomp ? [1, 1, 0, 0] : [0, 0, 1, 1], dy: f % 4 === 1 ? -1 : 0, squash: f % 4 === 2 ? 1 : 0,
          armL: 'down', armR: 'down',
          props: [
            { s: f % 4 < 2 ? SPRITES.vein : SPRITES.smallVein, x: f % 4 < 2 ? 10 : 11, y: -3 },
            { s: SPRITES.puff, x: -3 - Math.floor((f % 8) / 4), y: -1 - Math.floor((f % 8) / 3) },
            { s: SPRITES.puffSmall, x: 14 + Math.floor((f % 8) / 4), y: -1 - Math.floor((f % 8) / 3) },
          ],
        })
      },
    },
    {
      name: 'fists', len: 12, weight: 1,
      frame: f => pose({
        eyes: 'angry', tint: PALETTE.angry, dx: f % 2 ? 1 : 0,
        armL: f % 4 < 2 ? 'high' : 'up', armR: f % 4 < 2 ? 'up' : 'high',
        props: [{ s: SPRITES.vein, x: 11, y: -3 }],
      }),
    },
  ],
  love: [
    {
      name: 'smitten', len: 28,
      frame: f => pose({
        eyes: 'heart', blush: true, lean: cyc(Math.floor(f / 4), [0, 1, 0, -1]), squash: f % 14 === 7 ? 1 : 0,
        armL: 'up', armR: 'up', props: hearts(f),
      }),
    },
  ],
  dance: [
    {
      name: 'bounce', len: 16,
      frame: f => {
        const dy = cyc(f, [0, -1, -2, -3, -2, -1, 0, 0])
        return pose({
          dy, squash: f % 8 === 6 ? 1 : f % 8 === 1 ? -1 : 0, eyes: 'happy',
          armL: dy <= -2 ? 'high' : 'out', armR: dy <= -2 ? 'high' : 'out',
          props: notes(f, 0, 8),
        })
      },
    },
    {
      name: 'shuffle', len: 16,
      frame: f => {
        const dx = cyc(f, [0, 1, 2, 2, 1, 0, -1, -2, -2, -1, 0, 0, 1, 1, 0, 0])
        const going = cyc(f, [1, 1, 1, 0, -1, -1, -1, -1, 0, 1, 1, 1, 0, 0, 0, 0])
        return pose({
          dx, lean: going, lookX: going, eyes: f % 8 === 0 ? 'happy' : 'open',
          legs: legsStep(f), armL: f % 4 < 2 ? 'up' : 'out', armR: f % 4 < 2 ? 'out' : 'up',
          props: notes(f, 0, 12),
        })
      },
    },
    {
      name: 'disco', len: 16,
      frame: f => {
        const right = f < 8
        return pose({
          dx: right ? 1 : -1, lean: right ? 1 : -1,
          armR: right ? 'high' : 'down', armL: right ? 'down' : 'high',
          eyes: f % 8 < 4 ? 'star' : 'happy', legs: right ? [0, 0, 1, 0] : [0, 1, 0, 0],
          props: [{ s: SPRITES.spark, x: right ? 16 : -6, y: -3 + (f % 4 < 2 ? 0 : 1) }, ...(f % 8 >= 4 ? [{ s: SPRITES.dot, x: right ? 19 : -8, y: 1 }] : [])],
        })
      },
    },
    {
      name: 'spin', len: 16,
      frame: f => {
        const facing = cyc(f, ['front', 'front', 'side', 'side', 'back', 'back', 'back', 'side', 'side', 'front', 'front', 'front', 'front', 'front', 'front', 'front'] as const)
        const dir = f < 4 ? 1 : -1
        return pose({
          facing, dir, dy: f >= 2 && f <= 8 ? -1 : 0, squash: f === 10 ? 1 : 0,
          eyes: f >= 10 ? 'happy' : 'open', armL: f >= 11 ? 'high' : 'out', armR: f >= 11 ? 'high' : 'out',
          props: f >= 11 ? [{ s: SPRITES.spark, x: -5, y: -2 }, { s: SPRITES.spark, x: 15, y: -3 }] : [],
        })
      },
    },
    {
      name: 'wiggle', len: 16,
      frame: f => pose({
        squash: cyc(f, [0, 1, 0, -1] as const), lean: cyc(Math.floor(f / 2), [1, 0, -1, 0]),
        eyes: 'closed', blush: true, armL: f % 4 < 2 ? 'up' : 'out', armR: f % 4 < 2 ? 'out' : 'up',
        props: notes(f, 0, 8),
      }),
    },
    {
      name: 'robot', len: 16,
      frame: f => {
        const beat = Math.floor(f / 4)
        const arms = cyc(beat, [['out', 'up'], ['up', 'out'], ['high', 'high'], ['down', 'down']] as const)
        return pose({
          armL: arms[0], armR: arms[1], dx: cyc(beat, [0, 1, 0, -1]), eyes: f % 4 === 0 ? 'wide' : 'open',
          lookX: cyc(beat, [1, -1, 0, 0]), legs: beat % 2 ? [0, 0, 0, 1] : [1, 0, 0, 0],
          props: f % 4 < 2 ? [{ s: SPRITES.note2, x: 15, y: -3 }] : [],
        })
      },
    },
  ],
} satisfies Record<string, Clip[]>

export type Mood = keyof typeof CLIPS

export const MOODS = Object.keys(CLIPS) as Mood[]

/** How a mood gets around the stage. */
const MOVE: Record<Mood, 'home' | 'pace' | 'stay'> = {
  idle: 'home', sleepy: 'home', hello: 'home', excited: 'stay', thinking: 'pace',
  reading: 'stay', coding: 'stay', running: 'stay', friends: 'stay', asking: 'stay',
  oops: 'stay', angry: 'stay', love: 'stay', dance: 'stay',
}

export function pickClip(mood: Mood, r: number, not?: string): Clip {
  const all: Clip[] = CLIPS[mood]
  const clips = all.length > 1 && not ? all.filter(c => c.name !== not) : all
  const total = clips.reduce((n, c) => n + (c.weight ?? 1), 0)
  let x = r * total
  for (const c of clips) if ((x -= c.weight ?? 1) < 0) return c
  return clips[clips.length - 1]
}

// ---------------------------------------------------------------- stage

/** Frames of quiet before an idle Clawd nods off. */
const SLEEP_AFTER = FPS * 150

/**
 * The band Clawd lives in: where it stands, which mood it is in, which clip
 * of that mood it is playing. `tick()` advances one frame and draws it.
 */
export class Stage {
  width: number
  pos: number
  dir: 1 | -1 = -1
  base: Mood = 'idle'
  emote: Mood | null = null
  emoteLeft = 0
  clip: Clip
  f = 0
  seed: number
  n = 0
  quiet = 0
  pause = 0
  target: number | null = null
  pinned: number | null = null

  constructor(width: number, seed = 1) {
    this.width = width
    this.seed = seed >>> 0
    this.pos = this.home
    this.clip = CLIPS.idle[0]
  }

  get mood(): Mood {
    if (this.emote) return this.emote
    if (this.base === 'idle' && this.quiet > SLEEP_AFTER) return 'sleepy'
    return this.base
  }

  /** Clawd's resting spot: the right-hand side, room left for arms and props. */
  get home(): number {
    return this.pinned ?? Math.max(8, this.width - 20)
  }

  resize(width: number): void {
    this.width = width
    this.pos = Math.min(this.pos, Math.max(0, width - 14))
  }

  /** Walks in from the left edge. */
  enter(): void {
    this.pos = -14
    this.dir = 1
  }

  setBase(mood: Mood): void {
    if (mood === this.base) return
    const was = this.mood
    this.base = mood
    this.quiet = 0
    if (this.mood !== was) this.restart()
  }

  /** Plays a mood for a while, then goes back to the base mood. */
  play(mood: Mood, frames: number): void {
    this.emote = mood
    this.emoteLeft = frames
    this.quiet = 0
    this.restart()
  }

  clearEmote(): void {
    if (!this.emote) return
    this.emote = null
    this.restart()
  }

  private rand(): number {
    return noise(this.seed, this.n++)
  }

  private restart(): void {
    this.clip = pickClip(this.mood, this.rand())
    this.f = 0
    this.pause = 0
    this.target = null
  }

  /** Advances one frame and returns it. */
  tick(): Canvas {
    const mood = this.mood
    const offstage = this.pos < 0 || this.pos > this.width - 14
    const move = offstage ? 'home' : MOVE[mood]
    let p: Pose

    const walkTo = (x: number, decor?: (f: number) => Partial<Pose>): boolean => {
      const d = x - this.pos
      if (Math.abs(d) < 0.5) {
        this.pos = x
        return false
      }
      this.dir = d > 0 ? 1 : -1
      this.pos += this.dir * 0.5
      this.f++
      p = { ...WALK.frame(this.f, this.seed), lookX: this.dir, ...decor?.(this.f) }
      return true
    }

    const playClip = () => {
      p = this.clip.frame(this.f, this.seed + this.n)
      this.f++
      if (this.f >= this.clip.len) {
        this.f = 0
        if (CLIPS[mood].length > 1) this.clip = pickClip(mood, this.rand(), this.clip.name)
        this.n++
      }
    }

    if (move === 'home' && walkTo(this.home)) {
      // walking home
    } else if (move === 'pace') {
      if (this.pause > 0) {
        this.pause--
        playClip()
      } else {
        if (this.target === null) {
          const far = Math.max(2, this.home - Math.min(48, Math.floor(this.width * 0.45)))
          this.target = this.pos > (far + this.home) / 2 ? far : this.home
        }
        const thought = (f: number): Partial<Pose> => ({ lookY: -1, props: [{ s: SPRITES.thinkS, x: 13, y: 0 }, ...(f % 8 < 4 ? [] : [{ s: SPRITES.thinkM, x: 15, y: -3 }])] })
        if (!walkTo(this.target, thought)) {
          this.target = null
          this.pause = FPS * 2 + Math.floor(this.rand() * FPS * 3)
          this.clip = pickClip('thinking', this.rand())
          this.f = 0
          playClip()
        }
      }
    } else {
      playClip()
    }

    if (this.emote && --this.emoteLeft <= 0) {
      this.emote = null
      this.restart()
    }
    if (this.base === 'idle' && !this.emote) {
      const wasAwake = this.quiet <= SLEEP_AFTER
      this.quiet++
      if (wasAwake && this.quiet > SLEEP_AFTER) this.restart()
    }

    const cv = new Canvas(this.width, STAGE_H)
    drawClawd(cv, p!, this.pos)
    return cv
  }
}

/** Every frame of one clip, Clawd centred on a canvas of `width`. */
export function clipFrames(clip: Clip, width: number, seed = 1): Canvas[] {
  const x = Math.floor((width - 12) / 2)
  const out: Canvas[] = []
  for (let f = 0; f < clip.len; f++) {
    const cv = new Canvas(width, STAGE_H)
    drawClawd(cv, clip.frame(f, seed), x)
    out.push(cv)
  }
  return out
}

// ---------------------------------------------------------------- encoders

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += B64[n >> 18] + B64[(n >> 12) & 63] + '=='
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '='
  }
  return out
}

const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄

/** Packs a canvas as Raster cells: one cell per column and pixel pair. */
export function rasterCells(cv: Canvas): { columns: number; rows: number; cells: string } {
  const rows = Math.ceil(cv.h / 2)
  const words = new Uint32Array(cv.w * rows * 3)
  let k = 0
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < cv.w; x++) {
      const t = cv.get(x, r * 2)
      const b = cv.get(x, r * 2 + 1)
      if (t && b) {
        words[k++] = UPPER; words[k++] = t; words[k++] = b
      } else if (t) {
        words[k++] = UPPER; words[k++] = t; words[k++] = DEFAULT
      } else if (b) {
        words[k++] = LOWER; words[k++] = b; words[k++] = DEFAULT
      } else {
        words[k++] = 0x20; words[k++] = DEFAULT; words[k++] = DEFAULT
      }
    }
  }
  return { columns: cv.w, rows, cells: base64(new Uint8Array(words.buffer)) }
}

const fg = (c: Color) => `\x1b[38;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`
const bg = (c: Color) => `\x1b[48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`

/** A canvas as truecolor ANSI lines, half-blocks two pixels to a cell. */
export function ansiLines(cv: Canvas): string[] {
  const lines: string[] = []
  for (let r = 0; r < Math.ceil(cv.h / 2); r++) {
    let line = ''
    let last = ''
    for (let x = 0; x < cv.w; x++) {
      const t = cv.get(x, r * 2)
      const b = cv.get(x, r * 2 + 1)
      let style: string
      let ch: string
      if (t && b) { style = fg(t) + bg(b); ch = '▀' }
      else if (t) { style = '\x1b[0m' + fg(t); ch = '▀' }
      else if (b) { style = '\x1b[0m' + fg(b); ch = '▄' }
      else { style = '\x1b[0m'; ch = ' ' }
      if (style !== last) line += style
      last = style
      line += ch
    }
    lines.push(line + '\x1b[0m')
  }
  return lines
}

const hex = (c: Color) => '#' + c.toString(16).padStart(6, '0')

/** One frame as SVG paths, a path per colour, a run per row. */
function framePaths(cv: Canvas): string {
  const byColor = new Map<Color, string>()
  for (let y = 0; y < cv.h; y++) {
    let x = 0
    while (x < cv.w) {
      const c = cv.get(x, y)
      let e = x + 1
      while (e < cv.w && cv.get(e, y) === c) e++
      if (c) byColor.set(c, (byColor.get(c) ?? '') + `M${x} ${y}h${e - x}v1h${x - e}z`)
      x = e
    }
  }
  return [...byColor].map(([c, d]) => `<path fill="${hex(c)}" d="${d}"/>`).join('')
}

/**
 * Frames as one self-animating SVG (SMIL, no script): identical frames are
 * drawn once and shown at each of their turns.
 */
export function animatedSvg(frames: Canvas[], fps: number, scale: number): string {
  const w = frames[0].w
  const h = frames[0].h
  const n = frames.length
  const dur = n / fps
  const groups = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const body = framePaths(frames[i])
    groups.set(body, [...(groups.get(body) ?? []), i])
  }
  let out = ''
  for (const [body, at] of groups) {
    if (groups.size === 1) {
      out += `<g>${body}</g>`
      break
    }
    const values: string[] = []
    const times: string[] = []
    for (let i = 0; i < n; i++) {
      const on = at.includes(i) ? 'visible' : 'hidden'
      if (values[values.length - 1] === on) continue
      values.push(on)
      times.push((i / n).toFixed(4))
    }
    out += `<g visibility="${values[0]}"><animate attributeName="visibility" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" values="${values.join(';')}" keyTimes="${times.join(';')}"/>${body}</g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges">${out}</svg>`
}
