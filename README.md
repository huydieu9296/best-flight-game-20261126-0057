# Skyline Courier — a flight game

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/huydieu9296/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/huydieu9296/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A complete, original flight game that runs offline in a desktop browser from
plain static files. Entry for the
[make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057).

## Play

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network request, no assets beyond the files in `game/`.

## The game

You fly a courier jet in chase view over a seeded valley — patchwork fields,
a winding river, side mountains, drifting clouds and hot-air balloons — with
the aircraft in frame, instruments lit, and a runway ahead.

- **Fly the rings.** Each sortie strings glowing rings across the valley.
  Thread one dead-centre for a perfect bonus; every ring also tops up fuel.
- **Mind the gauges.** Airspeed, altitude and heading ride the HUD, with a
  compass tape, an attitude ball, throttle, fuel and hull. Fly too slow and
  the jet stalls; fly too low and the terrain warning flashes.
- **Dodge the balloons.** A strike costs 34% hull. Storm clouds shake the
  airframe.
- **Land it.** Once the rings are clear, line up on runway 27, ride the
  glide slope down and touch down gently — too fast, too steep or too
  crooked and the gear folds.

## Sorties

| Key | Sortie | Rings | Character |
|-----|--------|-------|-----------|
| 1 | Ring Run | 8 | Morning courier, gentle valley |
| 2 | Canyon Courier | 10 | Tall rock, thin fuel |
| 3 | Storm Delivery | 8 | Dusk storm, runway lights on |

## Controls

- **← → / A D** bank and turn · **↑ ↓ / W S** pitch
- **Shift** throttle up · **Ctrl** throttle down · **Mouse** steers too
- **P / Esc** pause · **Space / Enter** start and restart · **1 / 2 / 3** pick a sortie
- Click a sortie card on the title screen to fly it.

## Scoring

Ring +250 (perfect centre +150), distance flown trickles in, and a landing
pays +1,000 plus bonuses for fuel and hull left. Best score is kept in the
browser. Sound is synthesised with WebAudio — engine hum, ring chimes,
warnings, landing arpeggio — and needs no audio files.

## Files

- `game/index.html` + `game/src/` — the game: `config.js` (tuning),
  `world.js` (flight model, terrain, rings, missions), `render.js` (chase-view
  projection, terrain, aircraft, HUD), `input.js`, `audio.js`, `shots.js`
  (autopilot that stages the screenshots), `main.js` (loop and screens).
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored library.
- `vendor/makefun-game.ts` — the kit's library, unchanged.
- `screenshots/` — real renders of the game's own code (`?shot=` scenes).
