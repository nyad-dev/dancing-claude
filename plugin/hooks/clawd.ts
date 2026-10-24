// Clawd, the little Claude Code critter, as pixel art.
//
// One engine shared by the plugin (terminal Raster, desktop SVG) and the
// standalone CLI (ANSI). No imports, no Node, no DOM: plain TypeScript that
// both the plugin sandbox and `node` (type stripping) run as is.
//
// Geometry is the welcome-screen logo at half-block resolution: a 12x8 body,
// 1x2 eyes, 2x2 arm nubs and four 1x2 legs. Everything is drawn in "base
// pixels". The `half` encoding stacks two pixels in a cell (▀ ▄); the `quad`
// encoding packs 2x4 pixels into a quarter-block cell (▘ ▞ ▙ ...), which is
// the logo's own size: Clawd three rows tall.

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
  code1: 0x7ee787,
  code2: 0x8ab4f8,
  code3: 0xffa657,
  paper: 0xf4f1e6,
  ink: 0x9a948a,
  pencil: 0xf2c14e,
} as const

/** The body colours: a quarter-block cell lets anything else win over them. */
const SKIN = new Set<Color>([PALETTE.body, PALETTE.back, PALETTE.angry])

/** Rows of the stage in base pixels: 4 of headroom (hops, raised arms, props), 8 of body, 2 of legs. */
export const STAGE_H = 14
/** Body top while standing. A multiple of 4, so quarter-blocks split the body like the logo. */
const TOP = 4
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

/** Nearest-neighbour upscale, for the big size. */
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
  laptop: false | 0 | 1
  /** A notepad held low on the right; the number is where the pencil is. */
  notepad: false | 0 | 1 | 2
  /** Drawn behind the body, relative to the body's resting top-left. */
  behind: Prop[]
  /** Drawn over the body, relative to the body's resting top-left. */
  props: Prop[]
}

export function pose(p: Partial<Pose> = {}): Pose {
  return {
    dx: 0, dy: 0, squash: 0, lean: 0, eyes: 'open', lookX: 0, lookY: 0,
    armL: 'out', armR: 'out', legs: [0, 0, 0, 0], blush: false,
    facing: 'front', dir: 1, tint: PALETTE.body, laptop: false, notepad: false,
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

  const body = p.facing === 'back' ? PALETTE.back : p.tint

  // legs
  const legXs = p.facing === 'side' ? [left + 1, left + 5] : [left + 1, left + 3, right - 4, right - 2]
  legXs.forEach((lx, i) => {
    const lift = p.facing === 'side' ? p.legs[i * 2] : p.legs[i]
    const h = 2 - lift
    if (h > 0) cv.rect(lx, legTop, 1, h, body)
  })

  // arms, then the body over their roots
  const arm = (a: Arm, side: -1 | 1) => {
    if (a === 'hidden') return
    for (const [ox, y, w, h] of ARMS[a]) cv.rect(side < 0 ? left - ox - w : right + ox, top + y, w, h, body)
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
    cv.bits(rx - (e.ox + e.rows[0].length - 1), eyeY + e.oy, e.rows, c, true)
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
  if (p.notepad !== false) drawNotepad(cv, X, top, p.notepad)

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

function drawNotepad(cv: Canvas, X: number, top: number, pen: 0 | 1 | 2): void {
  // a little ruled pad held out in the right paw, a pencil scribbling on it
  cv.rect(X + 14, top + 4, 4, 4, PALETTE.paper)
  cv.rect(X + 15, top + 5, 2, 1, PALETTE.ink)
  cv.rect(X + 15, top + 7, 2, 1, PALETTE.ink)
  cv.set(X + 14 + pen, top + 3, PALETTE.pencil)
  cv.set(X + 15 + pen, top + 2, PALETTE.pencil)
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
function notes(f: number, period = 12): Prop[] {
  const out: Prop[] = []
  for (let k = 0; k < 2; k++) {
    const t = (f + k * (period / 2)) % period
    const y = 4 - Math.floor(t / 2)
    if (y < -2) continue
    const side = (Math.floor((f + k * (period / 2)) / period) + k) % 2
    out.push({ s: side ? SPRITES.note : SPRITES.note2, x: side ? 15 : -6 + (t % 4 < 2 ? 0 : 1), y })
  }
  return out
}

function hearts(f: number, period = 14): Prop[] {
  const out: Prop[] = []
  for (let k = 0; k < 2; k++) {
    const t = (f + k * (period / 2)) % period
    const y = 4 - Math.floor(t / 2)
    if (y < -2) continue
    out.push({ s: SPRITES.heart, x: k ? 14 + (t % 4 < 2 ? 0 : 1) : -5 - (t % 4 < 2 ? 0 : 1), y })
  }
  return out
}

const legsStep = (f: number): Pose['legs'] => cyc(f, [[2, 0, 2, 0], [0, 0, 0, 0], [0, 2, 0, 2], [0, 0, 0, 0]] as const)

/** One hop: crouch, rise, hang, land. Six frames. */
const HOP_DY = [0, -1, -2, -2, -1, 0] as const
function hopPose(t: number, extra: Partial<Pose> = {}): Pose {
  const air = t > 0 && t < 5
  return pose({
    dy: HOP_DY[t], squash: t === 0 || t === 5 ? 1 : t === 2 ? -1 : 0,
    armL: air ? 'up' : 'out', armR: air ? 'up' : 'out', legs: air ? [1, 0, 0, 1] : [0, 0, 0, 0],
    eyes: air ? 'happy' : 'open', ...extra,
  })
}

export const WALK: Clip = {
  name: 'walk',
  len: 4,
  frame: f => pose({ legs: legsStep(f), armL: f % 4 < 2 ? 'out' : 'down', armR: f % 4 < 2 ? 'down' : 'out' }),
}

export const CLIPS = {
  idle: [
    {
      name: 'breathe', len: 50, weight: 3,
      frame: (f, seed) => pose({ squash: f % 25 >= 18 && f % 25 < 22 ? 1 : 0, eyes: blinks(f, seed, 50) ? 'blink' : 'open' }),
    },
    {
      name: 'look-around', len: 50, weight: 2,
      frame: (f, seed) => pose({
        lookX: f < 12 ? 0 : f < 25 ? -1 : f < 38 ? 1 : 0,
        eyes: blinks(f, seed, 50) || f === 25 ? 'blink' : 'open',
        lean: f >= 15 && f < 22 ? -1 : f >= 28 && f < 35 ? 1 : 0,
      }),
    },
    {
      name: 'hum', len: 48, weight: 1,
      frame: f => pose({ eyes: 'closed', lean: cyc(Math.floor(f / 8), [0, 1, 0, -1]), props: f > 8 ? notes(f, 24).slice(0, 1) : [] }),
    },
    {
      name: 'tap-foot', len: 40, weight: 1,
      frame: (f, seed) => pose({ legs: [0, 0, 0, Math.floor(f / 4) % 2], eyes: blinks(f, seed, 40) ? 'blink' : 'open', lookX: 1 }),
    },
    {
      name: 'stretch', len: 40, weight: 1,
      frame: f => {
        const up = f >= 8 && f < 26
        return pose({ squash: up ? -1 : f >= 26 && f < 30 ? 1 : 0, armL: up ? 'high' : 'out', armR: up ? 'high' : 'out', eyes: up ? 'closed' : 'open' })
      },
    },
    {
      name: 'groove', len: 32, weight: 2,
      frame: f => pose({
        lean: cyc(Math.floor(f / 4), [1, 0, -1, 0]), dy: f % 8 === 4 ? -1 : 0, eyes: f % 16 < 8 ? 'happy' : 'closed',
        armL: f % 8 < 4 ? 'up' : 'out', armR: f % 8 < 4 ? 'out' : 'up', props: notes(f, 16).slice(0, 1),
      }),
    },
    {
      name: 'bunny-hops', len: 30, weight: 1,
      frame: f => (f < 12 ? hopPose(f % 6) : pose({ eyes: f < 18 ? 'happy' : 'open' })),
    },
  ],
  notes: [
    {
      name: 'scribble', len: 40, weight: 3,
      frame: (f, seed) => pose({
        notepad: cyc(Math.floor(f / 2), [0, 1, 2, 1] as const),
        eyes: blinks(f, seed, 40) ? 'blink' : 'open', lookX: 1,
        dy: f % 20 === 10 ? 1 : 0,
      }),
    },
    {
      name: 'peek', len: 40, weight: 2,
      frame: f => {
        const look = f < 20
        return pose({
          notepad: look ? 0 : cyc(Math.floor(f / 2), [0, 1, 2, 1] as const),
          eyes: f === 8 || f === 30 ? 'blink' : 'open', lookX: look ? -1 : 1,
          props: look && f > 4 ? [{ s: SPRITES.thinkS, x: -2, y: 1 }] : [],
        })
      },
    },
    {
      name: 'nod', len: 30, weight: 1,
      frame: f => pose({
        notepad: 1,
        dy: cyc(Math.floor(f / 3), [0, 1, 0, 0, 0]), eyes: f >= 20 ? 'happy' : 'open',
      }),
    },
  ],
  sleepy: [
    {
      name: 'snooze', len: 40,
      frame: f => {
        const zs: Prop[] = []
        const t = f % 40
        if (t >= 4) zs.push({ s: SPRITES.z, x: 13, y: Math.max(-2, 2 - Math.floor((t - 4) / 8)) })
        if (t >= 20) zs.push({ s: SPRITES.Z, x: 16, y: Math.max(-2, 1 - Math.floor((t - 20) / 8)) })
        return pose({ eyes: 'blink', squash: t % 20 < 10 ? 0 : 1, armL: 'down', armR: 'down', props: zs })
      },
    },
  ],
  hello: [
    {
      name: 'wave', len: 24,
      frame: f => pose({
        eyes: 'happy', armL: 'out', armR: cyc(Math.floor(f / 3), ['up', 'high'] as const), blush: true,
        props: f % 6 < 3 ? [{ s: SPRITES.spark, x: 15, y: -2 }] : [{ s: SPRITES.dot, x: 16, y: -1 }],
      }),
    },
  ],
  excited: [
    {
      name: 'hop', len: 15,
      frame: f => {
        const t = Math.min(f, 5)
        return hopPose(t, { eyes: 'wide', armL: t > 0 && t < 5 ? 'high' : 'out', armR: t > 0 && t < 5 ? 'high' : 'out', props: [{ s: SPRITES.bang, x: 14, y: -2 + (f % 4 < 2 ? 0 : 1) }] })
      },
    },
  ],
  thinking: [
    {
      name: 'ponder', len: 30, weight: 2,
      frame: f => {
        const dots: Prop[] = []
        if (f >= 4) dots.push({ s: SPRITES.thinkS, x: 13, y: 1 })
        if (f >= 10) dots.push({ s: SPRITES.thinkM, x: 15, y: -1 })
        if (f >= 16) dots.push({ s: SPRITES.thinkL, x: 17, y: -2 })
        return pose({ eyes: f === 26 ? 'blink' : 'open', lookX: 1, armR: 'up', props: dots })
      },
    },
    {
      name: 'hmm', len: 30, weight: 1,
      frame: f => pose({
        eyes: f < 15 ? 'open' : 'closed', lookX: -1, lean: cyc(Math.floor(f / 5), [0, -1, 0, 1]),
        props: f >= 6 ? [{ s: SPRITES.ask, x: 14, y: -2 + (f % 10 < 5 ? 0 : 1) }] : [],
      }),
    },
    {
      name: 'idea', len: 24, weight: 1,
      frame: f => {
        const lit = f >= 12
        return pose({
          eyes: lit ? 'star' : 'open', dy: f === 12 || f === 13 ? -1 : 0,
          armR: lit ? 'high' : 'up',
          props: lit ? [{ s: SPRITES.spark, x: 15, y: -2 + (f % 4 < 2 ? 0 : 1) }] : [{ s: SPRITES.thinkS, x: 13, y: 1 }],
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
          eyes: found ? 'wide' : 'open', lookX: found ? 1 : cyc(Math.floor(f / 4), [-1, 0, 1, 0]),
          armR: 'up', props: [
            { s: SPRITES.magnifier, x: 13, y: -2 + (f % 8 < 4 ? 0 : 1) },
            ...(found ? [{ s: SPRITES.spark, x: 17, y: -2 }] : []),
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
          sparks.push({ s, x: [-3, 6, 14][k] + (t % 4 < 2 ? 0 : 1), y: 1 - Math.floor(t / 4) })
        }
        return pose({ eyes: f === 20 ? 'blink' : 'open', laptop: (f % 2) as 0 | 1, armL: 'hidden', armR: 'hidden', props: sparks })
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
        props: [{ s: f % 4 < 2 ? SPRITES.prompt : SPRITES.promptOff, x: 14, y: -2 }],
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
            { s: a ? SPRITES.mini : SPRITES.miniHop, x: -20, y: a ? 5 : 4 },
            { s: a ? SPRITES.miniHop : SPRITES.miniHappy, x: -10, y: a ? 4 : 5 },
            ...notes(f, 8).slice(0, 1),
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
          props: [{ s: SPRITES.ask, x: 15, y: -2 + (f % 8 < 4 ? 0 : 1) }],
        })
      },
    },
  ],
  oops: [
    {
      name: 'eek', len: 30,
      frame: f => pose({
        dx: f < 6 ? cyc(f, [-1, 1]) : 0,
        eyes: f < 10 ? 'dizzy' : 'sad', armL: 'down', armR: f < 10 ? 'high' : 'up',
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
            { s: f % 4 < 2 ? SPRITES.vein : SPRITES.smallVein, x: f % 4 < 2 ? 11 : 12, y: -2 },
            { s: SPRITES.puff, x: -3 - Math.floor((f % 8) / 4), y: -1 - Math.floor((f % 8) / 4) },
            { s: SPRITES.puffSmall, x: 15 + Math.floor((f % 8) / 4), y: 1 - Math.floor((f % 8) / 3) },
          ],
        })
      },
    },
    {
      name: 'fists', len: 12, weight: 1,
      frame: f => pose({
        eyes: 'angry', tint: PALETTE.angry, dx: f % 2 ? 1 : 0,
        armL: f % 4 < 2 ? 'high' : 'up', armR: f % 4 < 2 ? 'up' : 'high',
        props: [{ s: SPRITES.vein, x: 12, y: -2 }],
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
  happy: [
    {
      name: 'happy-feet', len: 16, weight: 2,
      frame: f => pose({
        legs: cyc(Math.floor(f / 2), [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 2], [0, 0, 0, 0]] as const),
        dy: f % 4 === 1 ? -1 : 0, eyes: 'happy', blush: true, lean: cyc(Math.floor(f / 4), [-1, 1]),
        armL: f % 8 < 4 ? 'high' : 'up', armR: f % 8 < 4 ? 'up' : 'high', props: notes(f, 8),
      }),
    },
    {
      name: 'cheer', len: 16, weight: 2,
      frame: f => {
        const up = f % 4 < 2
        return pose({
          dy: up ? -2 : 0, squash: up ? -1 : 1, eyes: up ? 'star' : 'happy',
          armL: up ? 'high' : 'down', armR: up ? 'high' : 'down', legs: up ? [1, 0, 0, 1] : [0, 0, 0, 0],
          props: up ? [{ s: SPRITES.spark, x: -5, y: -2 }, { s: SPRITES.spark, x: 15, y: -2 }] : [{ s: SPRITES.dot, x: -4, y: 0 }, { s: SPRITES.dot, x: 16, y: 0 }],
        })
      },
    },
    {
      name: 'sway', len: 24, weight: 1,
      frame: f => pose({
        lean: cyc(Math.floor(f / 3), [0, 1, 1, 0, -1, -1]), dx: cyc(Math.floor(f / 6), [0, 1, 0, -1]),
        eyes: 'closed', blush: true, armL: 'up', armR: 'up', props: notes(f, 12),
      }),
    },
  ],
  dance: [
    {
      name: 'bounce', len: 16,
      frame: f => {
        const dy = cyc(f, [0, -1, -2, -2, -2, -1, 0, 0])
        return pose({
          dy, squash: f % 8 === 6 ? 1 : f % 8 === 1 ? -1 : 0, eyes: 'happy',
          armL: dy <= -2 ? 'high' : 'out', armR: dy <= -2 ? 'high' : 'out',
          props: notes(f, 8),
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
          props: notes(f, 12),
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
          props: [{ s: SPRITES.spark, x: right ? 16 : -6, y: -2 + (f % 4 < 2 ? 0 : 1) }, ...(f % 8 >= 4 ? [{ s: SPRITES.dot, x: right ? 19 : -8, y: 1 }] : [])],
        })
      },
    },
    {
      name: 'spin', len: 16,
      frame: f => {
        const facing = cyc(f, ['front', 'front', 'side', 'side', 'back', 'back', 'back', 'side', 'side', 'front', 'front', 'front', 'front', 'front', 'front', 'front'] as const)
        return pose({
          facing, dir: f < 4 ? 1 : -1, dy: f >= 2 && f <= 8 ? -1 : 0, squash: f === 10 ? 1 : 0,
          eyes: f >= 10 ? 'happy' : 'open', armL: f >= 11 ? 'high' : 'out', armR: f >= 11 ? 'high' : 'out',
          props: f >= 11 ? [{ s: SPRITES.spark, x: -5, y: -2 }, { s: SPRITES.spark, x: 15, y: -2 }] : [],
        })
      },
    },
    {
      name: 'wiggle', len: 16,
      frame: f => pose({
        squash: cyc(f, [0, 1, 0, -1] as const), lean: cyc(Math.floor(f / 2), [1, 0, -1, 0]),
        eyes: 'closed', blush: true, armL: f % 4 < 2 ? 'up' : 'out', armR: f % 4 < 2 ? 'out' : 'up',
        props: notes(f, 8),
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
          props: f % 4 < 2 ? [{ s: SPRITES.note2, x: 15, y: -2 }] : [],
        })
      },
    },
    {
      name: 'side-hops', len: 24,
      frame: f => {
        const hop = Math.floor(f / 6)
        const t = f % 6
        const xs = [0, -6, 0, 6, 0]
        const dx = Math.round(xs[hop] + ((xs[hop + 1] - xs[hop]) * t) / 5)
        return hopPose(t, { dx, lookX: Math.sign(xs[hop + 1] - xs[hop]), props: t === 5 ? [{ s: SPRITES.dot, x: dx + (hop % 2 ? 13 : -2), y: 7 }] : [] })
      },
    },
    {
      name: 'conga', len: 24,
      frame: f => {
        const step = Math.floor(f / 3)
        return pose({
          dx: cyc(step, [0, 1, 2, 3, 2, 1, 0, -1]), legs: legsStep(f), lean: cyc(step, [1, 1, 1, 0, -1, -1, -1, 0]),
          eyes: step % 4 === 3 ? 'star' : 'happy', armL: step % 2 ? 'up' : 'high', armR: step % 2 ? 'high' : 'up',
          props: [...notes(f, 8), { s: SPRITES.mini, x: -12 + cyc(step, [0, 1, 2, 3, 2, 1, 0, -1]), y: f % 6 < 3 ? 5 : 4 }],
        })
      },
    },
  ],
} satisfies Record<string, Clip[]>

export type Mood = keyof typeof CLIPS

export const MOODS = Object.keys(CLIPS) as Mood[]

/** How a mood gets around the stage. */
const MOVE: Record<Mood, 'home' | 'pace' | 'stay'> = {
  happy: 'stay', idle: 'home', sleepy: 'home', hello: 'home', notes: 'stay', excited: 'stay', thinking: 'pace',
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
/** The least a mood stays on screen before the next one takes over. */
const MIN_HOLD = FPS * 3
/** The least an emote plays before another emote may cut in. */
const MIN_EMOTE = FPS * 2
/** How long Clawd keeps taking notes after the last keystroke. */
const TYPING_GRACE = FPS * 3

type Gait = 'walk' | 'hop'

/**
 * The band Clawd lives in: where it stands, which mood it is in, which clip
 * of that mood it is playing. `tick()` advances one frame and draws it.
 *
 * Moods are sticky: a new base mood waits until the current one has been on
 * screen for MIN_HOLD, and an emote waits for the one playing to have had
 * MIN_EMOTE, so a burst of quick tool calls doesn't make Clawd flicker.
 */
export class Stage {
  width: number
  pos: number
  dir: 1 | -1 = -1
  /** The mood the events last asked for. */
  base: Mood = 'idle'
  /** The base mood on screen; catches up with `base` after MIN_HOLD. */
  shownBase: Mood = 'idle'
  emote: Mood | null = null
  emoteLeft = 0
  queued: { mood: Mood; frames: number } | null = null
  clip: Clip
  f = 0
  seed: number
  n = 0
  /** Frames the current mood has been on screen. */
  held = 0
  quiet = 0
  typingLeft = 0
  pause = 0
  target: number | null = null
  gait: Gait = 'walk'
  hopT = 0
  pinned: number | null = null
  /** Where an idle Clawd has wandered off to, how long it stays, when it next goes. */
  spot: number | null = null
  stayLeft = 0
  wanderIn = FPS * 60
  /** Quarter-block drawing: keep the body on whole cells (no squash, hops in steps of two). */
  even = false
  /** When an idle Clawd next breaks into a little dance for no reason. */
  danceIn = FPS * 40

  constructor(width: number, seed = 1) {
    this.width = width
    this.seed = seed >>> 0
    this.pos = this.home
    this.clip = CLIPS.idle[0]
  }

  get mood(): Mood {
    if (this.emote) return this.emote
    if (this.shownBase === 'idle' && this.quiet > SLEEP_AFTER) return 'sleepy'
    return this.shownBase
  }

  /** Clawd's resting spot: the right-hand side, room left for arms and props. */
  get home(): number {
    return this.pinned ?? Math.max(8, this.width - 20)
  }

  resize(width: number): void {
    this.width = width
    this.pos = Math.min(this.pos, Math.max(0, width - 14))
    if (this.spot !== null) this.spot = Math.min(this.spot, Math.max(2, width - 16))
  }

  /** Walks in from the left edge. */
  enter(): void {
    this.pos = -14
    this.dir = 1
  }

  setBase(mood: Mood): void {
    this.base = mood
    if (mood !== 'idle') this.quiet = 0
  }

  /** Plays a mood for a while, then goes back to the base mood. */
  play(mood: Mood, frames: number): void {
    this.quiet = 0
    if (this.emote && this.held < MIN_EMOTE) {
      this.queued = { mood, frames }
      return
    }
    this.startEmote(mood, frames)
  }

  clearEmote(): void {
    if (!this.emote) return
    this.emote = null
    this.queued = null
    this.restart()
  }

  /** The person is typing: Clawd takes notes while nothing else is going on. */
  typing(): void {
    this.typingLeft = TYPING_GRACE
    this.quiet = 0
    if (this.base === 'idle') this.setBase('notes')
  }

  private startEmote(mood: Mood, frames: number): void {
    this.emote = mood
    this.emoteLeft = frames
    this.queued = null
    this.restart()
  }

  private rand(): number {
    return noise(this.seed, this.n++)
  }

  private restart(): void {
    this.clip = pickClip(this.mood, this.rand())
    this.f = 0
    this.pause = this.mood === 'thinking' ? FPS * 6 : 0
    this.held = 0
    this.target = null
  }

  /** Where an idle Clawd wants to be: home, or a spot it hopped or strolled to. */
  private idleTarget(): number {
    if (this.spot !== null) {
      if (Math.abs(this.pos - this.spot) < 0.5 && --this.stayLeft <= 0) {
        this.spot = null
        this.gait = 'walk'
      }
    } else if (Math.abs(this.pos - this.home) < 0.5 && this.pinned === null && --this.wanderIn <= 0) {
      this.wanderIn = FPS * (60 + Math.floor(this.rand() * 60))
      const room = this.width - 16
      if (room > 30) {
        const to = Math.max(2, this.home - 10 - Math.floor(this.rand() * 16))
        this.spot = to
        this.stayLeft = FPS * (6 + Math.floor(this.rand() * 8))
        this.gait = this.rand() < 0.5 ? 'hop' : 'walk'
      }
    }
    return this.spot ?? this.home
  }

  /** Advances one frame and returns it. */
  tick(): Canvas {
    // moods catch up, never faster than MIN_HOLD
    this.held++
    if (this.typingLeft > 0 && --this.typingLeft === 0 && this.base === 'notes') this.setBase('idle')
    if (!this.emote && this.base !== this.shownBase && this.held >= MIN_HOLD) {
      this.shownBase = this.base
      this.restart()
    } else if (this.emote && this.base !== this.shownBase) {
      this.shownBase = this.base // the emote covers the switch
    }

    const mood = this.mood
    const offstage = this.pos < 0 || this.pos > this.width - 14
    const move = offstage ? 'home' : MOVE[mood]
    let p: Pose | undefined

    const travel = (x: number, decor?: (f: number) => Partial<Pose>): boolean => {
      const d = x - this.pos
      if (Math.abs(d) < 0.5 && this.hopT === 0) {
        this.pos = x
        return false
      }
      this.dir = d > 0 ? 1 : d < 0 ? -1 : this.dir
      if (this.gait === 'hop' && !offstage) {
        const t = this.hopT
        if (t > 0 && t < 5) this.pos += this.dir * Math.min(1.5, Math.abs(d))
        this.hopT = (t + 1) % 6
        p = hopPose(t, { lookX: this.dir, ...decor?.(this.f) })
      } else {
        this.pos += this.dir * Math.min(0.5, Math.abs(d))
        p = { ...WALK.frame(this.f, this.seed), lookX: this.dir, ...decor?.(this.f) }
      }
      this.f++
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

    if (move === 'home' && travel(mood === 'idle' && !offstage ? this.idleTarget() : this.home)) {
      // on the way
    } else if (move === 'pace') {
      if (this.pause > 0) {
        this.pause--
        playClip()
      } else {
        if (this.target === null) {
          const far = Math.max(2, this.home - 8 - Math.floor(this.rand() * 8))
          this.target = this.pos > (far + this.home) / 2 ? far : this.home
          this.gait = this.rand() < 0.3 ? 'hop' : 'walk'
        }
        const thought = (f: number): Partial<Pose> => ({ props: [{ s: SPRITES.thinkS, x: 13, y: 1 }, ...(f % 8 < 4 ? [] : [{ s: SPRITES.thinkM, x: 15, y: -1 }])] })
        if (!travel(this.target, thought)) {
          this.target = null
          this.pause = FPS * 8 + Math.floor(this.rand() * FPS * 8)
          this.clip = pickClip('thinking', this.rand())
          this.f = 0
          playClip()
        }
      }
    } else {
      this.hopT = 0
      playClip()
    }

    if (this.emote && --this.emoteLeft <= 0) {
      const next = this.queued
      this.emote = null
      if (next) this.startEmote(next.mood, next.frames)
      else this.restart()
    } else if (this.emote && this.queued && this.held >= MIN_EMOTE) {
      this.startEmote(this.queued.mood, this.queued.frames)
    }
    if (this.mood === 'idle' && this.spot === null && --this.danceIn <= 0) {
      this.danceIn = FPS * (30 + Math.floor(this.rand() * 40))
      this.play(this.rand() < 0.6 ? 'happy' : 'dance', FPS * (4 + Math.floor(this.rand() * 3)))
    }
    if (this.shownBase === 'idle' && !this.emote) {
      const wasAwake = this.quiet <= SLEEP_AFTER
      this.quiet++
      if (wasAwake && this.quiet > SLEEP_AFTER) this.restart()
    }

    if (this.even) p = { ...p!, squash: 0, dy: 2 * Math.round(p!.dy / 2) }
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

/** How pixels become cells: two stacked per cell, or 2x4 as quarter-blocks. */
export type Encoding = 'half' | 'quad'

/** A size, as the plugin and the CLI offer it. */
export type Size = 'tiny' | 'small' | 'big'

export const SIZES: Record<Size, { encoding: Encoding; scale: number; pxPerColumn: number }> = {
  tiny: { encoding: 'quad', scale: 1, pxPerColumn: 2 },
  small: { encoding: 'half', scale: 1, pxPerColumn: 1 },
  big: { encoding: 'half', scale: 2, pxPerColumn: 0.5 },
}

/** Stage width in base pixels for a band of `columns` at a size. */
export function stageWidth(columns: number, size: Size): number {
  return Math.floor(columns * SIZES[size].pxPerColumn)
}

const DEFAULT = 0x01000000

type Cells = { columns: number; rows: number; ch: Uint32Array; fg: Uint32Array; bg: Uint32Array }

function halfCells(cv: Canvas): Cells {
  const rows = Math.ceil(cv.h / 2)
  const n = cv.w * rows
  const out: Cells = { columns: cv.w, rows, ch: new Uint32Array(n), fg: new Uint32Array(n), bg: new Uint32Array(n) }
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < cv.w; x++) {
      const i = r * cv.w + x
      const t = cv.get(x, r * 2)
      const b = cv.get(x, r * 2 + 1)
      if (t) [out.ch[i], out.fg[i], out.bg[i]] = [0x2580, t, b || DEFAULT]
      else if (b) [out.ch[i], out.fg[i], out.bg[i]] = [0x2584, b, DEFAULT]
      else [out.ch[i], out.fg[i], out.bg[i]] = [0x20, DEFAULT, DEFAULT]
    }
  }
  return out
}

// Quarter-blocks by mask: top-left 1, top-right 2, bottom-left 4, bottom-right 8.
const QUADS = [0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588]

/** Two stacked pixels as one: a detail (eye, prop) wins over the body, anything over nothing. */
function squeeze(a: Color, b: Color): Color {
  if (!a) return b
  if (!b) return a
  return SKIN.has(a) ? b : a
}

/**
 * Quarter-block rows are lined up with the body top, so the cells split Clawd
 * where the logo does: head and eyes, arms and tummy, legs; one row above.
 */
const QUAD_Y0 = TOP - 4

function quadCells(cv: Canvas): Cells {
  const columns = Math.ceil(cv.w / 2)
  const rows = Math.ceil((cv.h - QUAD_Y0) / 4)
  const n = columns * rows
  const out: Cells = { columns, rows, ch: new Uint32Array(n), fg: new Uint32Array(n), bg: new Uint32Array(n) }
  const sub = [0, 0, 0, 0]
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      for (let k = 0; k < 4; k++) {
        const x = c * 2 + (k & 1)
        const y = QUAD_Y0 + r * 4 + (k >> 1) * 2
        sub[k] = squeeze(cv.get(x, y), cv.get(x, y + 1))
      }
      // the commonest colour is the glyph, the next the background
      const counts = new Map<Color, number>()
      for (const s of sub) if (s) counts.set(s, (counts.get(s) ?? 0) + 1)
      const ranked = [...counts].sort((a, b) => b[1] - a[1] || (SKIN.has(a[0]) ? 1 : -1))
      const i = r * columns + c
      if (ranked.length === 0) {
        [out.ch[i], out.fg[i], out.bg[i]] = [0x20, DEFAULT, DEFAULT]
        continue
      }
      const fg = ranked[0][0]
      const hasGap = sub.some(s => !s)
      const bg = !hasGap && ranked.length > 1 ? ranked[1][0] : DEFAULT
      let mask = 0
      sub.forEach((s, k) => {
        if (s === fg || (s && s !== bg && !hasGap)) mask |= 1 << k
      })
      if (mask === 15 && bg !== DEFAULT) mask = sub.reduce((m, s, k) => (s === fg ? m | (1 << k) : m), 0)
      ;[out.ch[i], out.fg[i], out.bg[i]] = [QUADS[mask], fg, bg]
    }
  }
  return out
}

export function cellsOf(cv: Canvas, encoding: Encoding): Cells {
  return encoding === 'quad' ? quadCells(cv) : halfCells(cv)
}

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

/** Packs a canvas as Raster cells (RasterProps). */
export function rasterCells(cv: Canvas, encoding: Encoding = 'half'): { columns: number; rows: number; cells: string } {
  const c = cellsOf(cv, encoding)
  const words = new Uint32Array(c.ch.length * 3)
  for (let i = 0; i < c.ch.length; i++) {
    words[i * 3] = c.ch[i]
    words[i * 3 + 1] = c.fg[i]
    words[i * 3 + 2] = c.bg[i]
  }
  return { columns: c.columns, rows: c.rows, cells: base64(new Uint8Array(words.buffer)) }
}

const sgr = (c: Color, layer: 38 | 48) =>
  c === DEFAULT ? `\x1b[${layer + 1}m` : `\x1b[${layer};2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`

/** A canvas as truecolor ANSI lines. */
export function ansiLines(cv: Canvas, encoding: Encoding = 'half'): string[] {
  const c = cellsOf(cv, encoding)
  const lines: string[] = []
  for (let r = 0; r < c.rows; r++) {
    let line = ''
    let last = ''
    for (let x = 0; x < c.columns; x++) {
      const i = r * c.columns + x
      const style = c.ch[i] === 0x20 ? '\x1b[0m' : sgr(c.fg[i], 38) + sgr(c.bg[i], 48)
      if (style !== last) line += style
      last = style
      line += String.fromCharCode(c.ch[i])
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
