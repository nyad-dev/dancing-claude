# Dancing Claude

**Clawd**, the little Claude Code critter, moves in above your prompt and reacts to whatever Claude is doing. It types on a tiny laptop while Claude edits files, squints through a magnifier while Claude reads, paces back and forth while Claude thinks, and breaks into a dance when a turn finishes.

![Clawd's moods](docs/moods.png)

## Install

**Inside Claude Code** (any platform):

```
/plugin marketplace add nyad-dev/dancing-claude
/plugin install dancing-claude@dancing-claude
```

**One-liner, Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/nyad-dev/dancing-claude/main/install.ps1 | iex
```

**One-liner, macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/nyad-dev/dancing-claude/main/install.sh | bash
```

**From a clone** (no install, handy for hacking on it):

```bash
git clone https://github.com/nyad-dev/dancing-claude
claude --plugin-dir dancing-claude/plugin
```

Then start a new session. Clawd walks in from the left, waves, and settles on the right-hand side of the band above your prompt.

To update: `claude plugin marketplace update dancing-claude`. To remove: `claude plugin uninstall dancing-claude@dancing-claude`.

## What Clawd does

| When Claude is…                        | Clawd…                                                      |
| -------------------------------------- | ----------------------------------------------------------- |
| starting a session                     | walks in and waves hello                                    |
| waiting for you                        | breathes, blinks, looks around, hums, taps a foot, stretches |
| idle for a few minutes                 | nods off (zZz)                                              |
| receiving your prompt                  | hops with a little `!`                                      |
| thinking                               | paces side to side with thought bubbles, has ideas ✦        |
| reading / searching (Read, Grep, Web…) | scans with a magnifying glass                               |
| editing / writing files                | types on a laptop, code sparks flying                       |
| running commands (Bash, PowerShell)    | runs in place, `>_` blinking                                |
| using subagents                        | throws a party with two mini Clawds                         |
| asking you something / permission      | waves both arms with a `?`                                  |
| hitting an error                       | gets dizzy (x x) and sweats                                 |
| hitting errors three times in a turn   | stomps, turns red, steams 💢                                |
| finishing a turn                       | **dances** (bounce, shuffle, disco, spin, wiggle or robot)  |

Clawd also reads the room. Thank it or call it cute and it gets heart eyes. Shout at it IN CAPS and it gets cross.

## Commands

```
/clawd                    show or hide Clawd
/clawd dance              …or love, angry, sleep, code, read, think, run, party, wave, oops
/clawd big | small        double size or the default
/clawd left | center | right   where Clawd hangs out (right is home)
/clawd help
```

These preferences are remembered across sessions.

## Where it works

- **Terminal (CLI):** drawn as true-colour half-block pixel art, animated at 10 fps.
- **Desktop app:** drawn as a self-animating SVG in the same band.

Requires a Claude Code version with plugin function hooks (built and tested on 2.1.286).

## Try it without Claude Code

```bash
node cli/dance.ts          # every mood in turn
node cli/dance.ts dance    # just one
node cli/dance.ts --big
```

←/→ change the mood, space dances, h/l walk Clawd around, q quits. Needs Node 22.18 or newer, plus a terminal with true colour.

## Hacking on it

```
plugin/hooks/clawd.ts      sprite engine: poses, moods, clips, stage, encoders (shared with the CLI)
plugin/hooks/register.tsx  the plugin: events → moods, the band, /clawd
plugin/tests/              claude plugin test suite
cli/dance.ts               standalone terminal demo
tools/sheet.ts             renders every clip to a PNG sprite sheet
```

`npm test` validates and runs the plugin tests. `npm run dev` starts Claude Code with your working copy (it hot-reloads on save). `npm run sheet` dumps every animation frame to `sheet.png`, so you can eyeball new art.

To add a mood, add a list of clips to `CLIPS` in `clawd.ts`. Each clip is a length plus a `frame(f) → pose` function. Then give the mood a movement style in `MOVE` and wire it to an event in `register.tsx`.

---

Clawd is Anthropic's Claude Code mascot. This is an unofficial fan project and is not affiliated with or endorsed by Anthropic.
