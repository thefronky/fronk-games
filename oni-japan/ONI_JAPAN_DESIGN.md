# ONI: Japan — Design Document
*ONI is the franchise. Japan is this version. Coming to VR 2027.*

## The One-Liner
A thrilling cinematic combat experience — one hour, one night in Japan, relived
until you master it. It doubles as a workout.

## The Loop (the whole game in four beats)
1. **The calm.** A stylish, romanticized 1970s Japan. You're clearly a Western
   traveler. Everyone is funny, kind, awesome. A quiet bar, good music, sushi,
   a stunning view. It is genuinely relaxing — that's the point.
2. **The legendary drink.** At a quiet bar there is a drink with a reputation.
   Take it and the night begins — and when the night ends, you're back at the
   bar. The drink is the diegetic reason you relive the same night, again and
   again. **Lore: the drink is what brings the demon — the oni — out.**
3. **The turn.** In one heartbeat the warmth tips into a very real samurai
   knife fight. The people you drank with are the people you fight.
4. **The mastery.** Every fighter comes out with the same move each run (maybe
   a slightly different position). You learn the night like a kata. Difficulty
   modes exist, but the choreography is roughly fixed — the variable is YOU.

## Combat
- **Sword** — Blade & Sorcery-grade weighted physics. Real collisions, real
  mass. Fencing, not swinging: block, read, one clean strike. Go for the face —
  three inches of steel near a man's eye drains his will to fight. You break
  will, not just bodies.
- **Gun** — Half-Life: Alyx-grade hands. One concealed pistol (P226 X-Five
  Legion class — real, home-defense-plausible guns only, guns as beautiful
  objects not stats). A handful of rounds. No ammo HUD ever: count in your
  head, heft the mag, feel it. Slide locks open on empty → the silent click
  with enemies closing is the signature moment. The sword is the answer; the
  gun is the emergency. **The cost of the draw:** drawing costs real motion —
  sweep the shirt, clear the waistband — so every shot is a decision you earn.
- **Hand-to-hand** — Thrill of the Fight physicality. It's a real workout; if
  you're out of shape you'll have to work for the kill. An in-game warm-up
  ramps you (and your body) up before it gets crazy.
- **Mastery model** — SUPERHOT: deterministic enough to master, reactive
  enough to stay lethal. Replayable because you become John Wick.

## Controls (the grip is core)
- Press A/B to bond the sword to that hand — it becomes part of your hand
  exactly the way the controller already is. Holster it, hand's free. You pick
  a dominant sword arm (or use both).
- **The draw is the middle finger.** Lifting your shirt to grab the pistol maps
  to the controller's middle-finger/grip trigger — the real motion, recreated.
- Carry position: appendix / 4–5 o'clock concealed. (Back-carry rejected —
  untrackable without extra hardware.)
- **He must really GRIP the sword** — white-knuckle, an extension of the body,
  never a floaty tool.

## The Drink System (design intent — never marketed on the nose)
Drinking strengthens the VR comfort vignette (smoother, less dizzying), makes
the world more vibrant/stylized, and slows gameplay slightly. It is the thing
you reach for when you need a break or need it easier — an accessibility assist
disguised diegetically as getting drunk. Players get more comfortable the more
they drink and never think of it as a comfort setting. The bar is a difficulty
slider hidden in plain sight. You can also eat (sushi) to sober up after a
fight — or keep drinking.

## Opponents
- Hand-authored, ONE at a time. No swarms of nobodies. Scheduled waves.
- Range: ragged street toughs → sharp-suited enforcers → traditional samurai
  who look cool as hell.
- Each is built on a real school/trope of Japanese sword culture — the boxing
  analogy: one's a Philly-shell defender, one's a fencer, one's a brawler.
- Groundhog-Day determinism: same move every run, position may vary; they
  rotate/answer your footwork (move side-to-side and they respond).
- Faces obscured mid-move — it's not about them, it's about the fight.
- **Everything must be playtested in VR.** "Is it fun to fight a guy with
  nunchucks? AI can't answer that." No mechanic is declared fun from reasoning.

## Structure
- **~60 minutes**, cinematic, hyper-real. A film you replay.
- **Room-scale preferred** — exponentially more fun with more floor.
- **Solo** = different environments, each rooted in a real, deep Japanese
  story; elder/uncle characters tell tales that ring true to the culture.
- **Co-op** = opens with a drinking contest, then back-to-back blades.
- The story spine honors Japan genuinely — love letter, not pastiche.

## Tone & Art Direction
- Stylish, modern-cool 1970s Japan — sleek, GQ, intimidating. NOT folksy.
- A24 restraint. John Wick-developed world. Show, don't tell; tempt a smart
  audience. Palette of temptation: violence, sex, food, drink, smoke.
- Photoreal foreground bleeding into stylized ukiyo-e distance (the overlook).
- Brand: **ONI** big, **Japan** beneath, Shippori Mincho, black + neon green.

## The Tech Bet
When the pipeline can assemble Alyx-grade gunplay + Blade & Sorcery melee on
demand (cloth sim being the gating tech for the shirt-lift draw), the scarce
thing is the idea and the taste. This document is both, banked. Build target:
Unreal. Learn the UE/physics skillsets now; it could come faster than we think.

## Vertical Slice (proves the feel, nothing else)
One bar, one street. The arrival → sushi chopsticks moment (first tactile
delight) → the legendary drink → the turn → ONE authored duel → dry-gun →
sword transition. If that loop is fun on repeat, the game is real.
