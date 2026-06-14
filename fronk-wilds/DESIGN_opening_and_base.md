# CONSUME — Opening Cinematic & Base/Resting Area (design spec)

Captured from Fronk 2026-06-14. Build this as a focused pass AFTER the
menagerie fleet integrates (don't touch game.js until then).

## Opening cinematic (title → dolly → wake)
- **No touch buttons on the title.** They fade in only AFTER you wake.
- **CONSUME** wordmark (Cinzel) slowly FADES IN over the moving world —
  cinematic, like a piece of art.
- World shot: **sunset**, **lake sparkles**, beautiful. Not centered on
  the spawn — camera **dollies forward across the map, then tilts down**,
  slowly rotating, looking down. Eased: moving at a fine, steady speed.
- On tap: speed **ramps down / eases**, the camera **finds the real spawn**
  in the flower bed, descends, lands → **wake** (eyelids open).
- On wake you're **looking at the SKY**, not forced down. If you don't
  touch the screen you just watch the sky:
  **orange→blue gradient** (sun setting on the LEFT), a few **stars
  top-right** in the blue. A **breath-in** sound as he wakes.
- Then **UI fades in slowly**, each element with its own building/
  resolving sound (a 1-2-3-4 anticipation pack, not the same sound).
- **Cinematic text** (big, centered, NO hud box, feels like he's saying
  it): "Leave base" (his BASE — reused later). Subtle, on-screen.

## Base / resting area (the spawn)
- You wake in a **flower bed ringed by STONES** — you must **jump out**.
  The **jump button appears after ~10s** of looking around / nearing the
  wall (not immediately; you learn by needing it).
- **No arrows yet at wake** — only look + move at first.
- This is **his BASE**, returned to often:
  - **Store meat here.** Carry max **3** animals' meat before you must
    return and store. Taught via subtle dialogue ("I could carry one
    more, then that's it").
  - A **cove in a stone wall** to store meat: **deer skeletons**, hung
    **hides/skin**, a **fire** — reads as a cache.
  - **Campfire** in the center, **interactive flowers**, safe from
    animals, **peaceful music always plays here**.
- **Peaceful base music**: a real, warm folk feel — ideally a **jaw harp
  (mouth harp)** or accordion. Constraint: must be CC0/public-domain OR
  synthesized (game is copyright-clean). Plan: synthesize a gentle
  jaw-harp/drone theme in the WebAudio engine (the distinctive
  harmonic-sweep twang is synthesizable) unless a clean CC0 loop is found.

## Cross-cutting
- Must be **beautiful in BOTH portrait and landscape** (mobile-first).
- Carry-cap (3 meat) + base storage becomes a core loop.
