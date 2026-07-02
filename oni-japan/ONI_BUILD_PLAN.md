# ONI: Japan — First-Playable Build Plan
*From the physics research to a thing you can hold. Grounded in what actually ships.*

## Engine call: Unreal Engine 5
- Chaos physics (rigidbodies + constraints) covers the spring/damper/maxForce blade.
- Best-in-class cloth (Chaos Cloth / ML Cloth) — the one hard gate lives here, so build where the frontier is.
- Strong OpenXR / VR template. (Unity + Obi is the fallback if UE cloth disappoints.)

## The 80% prototype — build THIS first, nothing else
**One room. One sword. No enemies. No story.** Prove the single mechanism everything rides on:

1. **Ghost + blade.** Invisible kinematic target snapped to the motion controller. A visible katana rigidbody. Join them with a `PhysicsConstraint` (UE's ConfigurableJoint equivalent): position drive + angular drive, each with **spring / damper / max-force**.
2. **Tune the triplet, asymmetric.** Linear spring stiff, angular spring soft (so the blade drags in angle on contact). Raise `maxAngularVelocity` — the default will cap swings and ruin it. Continuous-collision on the blade (thin + fast).
3. **The felt test:** slice a hanging lantern. Slow push → it swings away. Committed cut → it splits. If a heavy katana *feels* heavier than a light one purely from the force cap, the core works. This is the whole bet — if this isn't fun, stop.

*Everything after this is addition, not invention.*

## Milestones (each is a self-contained "does it feel right?" gate)
- **M1 — Weight.** The prototype above. Gate: heft is legible without reading a stat.
- **M2 — Cut.** Velocity-gated damage + edge-alignment dot test + a target that reacts. Gate: taps do nothing, form kills.
- **M3 — Flesh.** Penetration-as-damped-constraint on one dummy (the B&S "wet drag"). Gate: the stab-and-pull sensation lands.
- **M4 — Foe.** ONE active-ragdoll opponent: muscle-springs to an animation pose, one authored attack, faces-away, staggers when hit. Gate: fighting a *person*, not a piñata.
- **M5 — Gun.** One P226, Alyx rules: one-handed, multi-step draw-from-concealment gesture, diegetic round count, recoil on model + haptic. Gate: spending a bullet feels like a decision.
- **M6 — Time.** SUPERHOT coupling (world speed = body speed) + the drink dial (vignette + slow + warmth). Gate: slow-mo reads as power, and the drink makes it *easier and cooler* at once.
- **M7 — The turn.** Stitch the calm→violence beat with ONE authored duel. Gate: the tonal whiplash works on a stranger.

## Hard rules baked in from day one (cheap now, impossible to retrofit)
- **Never move or shake the player camera.** All forces on the player are diegetic. (The agency asymmetry — the #1 way VR combat games break themselves.)
- **The player is the animation system.** Only fingers are authored. Don't fight the tracked hands.
- **Everything tunable is data** (DataAssets / JSON), because feel is found by playtesting, never by reasoning — and *every* source said the same thing: instrument it, test it, tune it.
- **Audio is half the feel.** Budget for a per-material impact-sound library early; it's not polish, it's load-bearing.

## The watch item
M-cloth (the shirt-lift concealed draw) is the only piece that may not be feasible yet. **De-risk it in parallel from M1:** a throwaway UE Chaos-Cloth test — can you grab and lift a shirt hem off a moving torso at 90fps? The answer to that question decides the timeline of the whole game. Until then, M5's draw can use a simpler "sweep the jacket" interaction that doesn't need true garment sim.

## What "done with the vertical slice" means
M1–M7 in one alley: arrive → (sushi/chopsticks tactile beat, optional) → the drink → the turn → one authored duel → dry-gun → back to the blade. If that loop is fun to run **three times in a row**, ONI is real and fundable.
