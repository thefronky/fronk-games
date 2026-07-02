# ONI: Japan — How Great VR Combat Actually Feels Real
*Research digest, 2026-07-02. Four deep-dives + the cross-game literature. Every claim sourced.*

---

## THE ONE BIG IDEA (all four games share it)
Your controller is weightless, but the weapon must not be. **Every serious VR melee
system is the same architecture:** an invisible "ghost" target follows your controller
1:1; the *visible* weapon is a real physics rigidbody joined to that ghost by a
spring-damper (a PD controller). Move slowly → it obeys. Swing hard → it lags,
deflects, carries momentum. **Your brain reads that lag as weight.** This is called
*phantom/physical decoupling*, and it is backed by real perception science
(pseudo-haptics / control-display ratio, Samad et al. CHI 2019).

Everything else — damage, enemies, feedback — is tuning on top of that spine.

---

## 1. BLADE & SORCERY — the physics-sandbox pole (our melee model)
Unity + stock PhysX. Everything data-driven JSON. No scripted combat layer — feel emerged from committing to full simulation (KospY, solo dev).

- **Hand↔weapon = spring / damper / maxForce triplet** (Unity ConfigurableJoint), NOT a rigid attach. Spring = force ∝ distance from controller; damper = resists overshoot; maxForce = a heavy/obstructed weapon *physically cannot* be yanked at controller speed. The force cap (not mass alone) is what makes a claymore ≠ a dagger.
- **Linear spring stiff, rotational spring soft** → on contact the blade deflects in *angle* and the tip drags along obstacles instead of freezing. This is what makes blade-on-blade read as fencing, not a stuck cursor. (Evan Fletcher's canonical write-up.)
- **Weight = lag under a force budget.** Mass + drag per item (dagger mass 0.8, drag 1.0); hand/weapon de-sync IS the weight signal.
- **Two-handing = two independent joints on the same rigidbody** → summed forces + lever-arm torque = physically-correct extra control, no scripted bonus. Handles support choke-up/grip-slide → real leverage for free.
- **Enemies are permanently-physical active ragdolls** whose parts are spring-driven toward the *animation pose* (`springPositionForce` pulls ragdoll parts to animated positions). State machine: Standing → Destabilized (springs weakened) → Inert (limp). "Knockdown" = just turning the muscle-springs down. Smooth continuum flinch→collapse.
- **Damage = velocity gates + edge alignment.** Three damager types (Blunt/Pierce/Slash) on different collider groups. `minSelfVelocity`, `velocityDamageCurve`, `dismembermentMinVelocity`: taps do nothing, committed swings kill. `badAngleDamage` + dot-product edge test → flat-of-blade bounces off (blunt fallback). You must cut *along the edge*.
- **Penetration = swap collision for a damped constraint.** On a qualifying stab, blade↔flesh collision is replaced by a joint along the blade axis with asymmetric in/out damping (`penetrationHeldDamperIn/Out`) — the wet drag of stabbing and the resistance pulling out is pure damper tuning. The single most-praised sensation in the game.
- **Dismemberment is pre-authored slice planes** per ragdoll part (never runtime mesh cutting first) + velocity gate.

Sources: evanfletcher42.com/2018/12/29/sword-mechanics-for-vr · kospy.github.io/BasSDK (Damager JSON, Ragdoll, RagdollPart, Handle, CreatingItems) · github.com/KospY/BasSDK · uploadvr.com/blade-and-sorcery-interview · venturebeat.com Blade&Sorcery interview

---

## 2. HALF-LIFE: ALYX — the hands & gunplay pole (our gun model)
Valve's real postmortem is the in-game **Developer Commentary** (147 nodes, devs named). No GDC talk exists.

- **Floating hands, invisible arms.** Arm IK was cut ("never worked with everyone"); kept *invisible physics arm proxies* so drawers can shut on your arm. The one body part you see obeys physics; the elbows that would look wrong simply aren't drawn.
- **Physics hands = joint-driven ragdoll hand chasing a controller "ghost" target.** Hands collide with the world (lean on walls, brush surfaces) — never ghost through.
- **Grab = snap-to-authored-pose, brief desync tolerated.** A correct-looking grip beats 1:1 fidelity; players don't notice short divergences.
- **One-handed weapons ONLY.** True two-handed was CUT: VR can't give the physical link between your two hands, so grips drift apart. Off-hand *bracing* is auto-posed/cosmetic, not a rigid constraint. Policy: one hand always free for locomotion.
- **Reload = multi-step physical choreography** on *separate deliberate buttons* (eject / insert / rack). Fumbles read as *player* error, not game jank — playtesters named reloading a highlight. Mastery shortcut: reload before empty and the round stays chambered (skip the rack); unique sounds for chambered / last-round / empty.
- **Shotgun anti-tedium:** grabs *two shells per over-shoulder reach* (7 gestures → 4), unique sound on the last shell = full. Keep the fiction of realism, silently halve the boring half.
- **Diegetic ammo counters on each weapon** (pistol = grip LEDs, etc.). Read the gun, not a HUD.
- **Recoil = weapon-model kick + short haptic burst. NEVER move the camera** — in VR the camera is the player's head; screen-shake is off the table. The world reacts (muzzle flash, sound, physics); the view doesn't.
- **Diegetic inventory = gestures at body locations:** over-shoulder backpack hands you the *correct* mag automatically; two wrist pockets for grenades/syringes.
- **Throw velocity is signal-processed:** average of the 3 frames bracketing peak controller velocity in the last 10, framerate-independent → throws land where you meant.
- **What Valve deliberately did NOT do:** melee/crowbar (weightless controller, no good answer → cut), full avatar arms, two-handed rigidity, forced crouch/fatigue, moving the player's viewpoint. **Cut what has no physical feedback rather than ship it half-convincing.**
- **Audio is half of "tactile":** ~2,000 physics sounds across 160+ object types, pitched by impact velocity + material; animation-synced one-shots for frame-exact AV sync.
- Meta-technique: room-at-a-time iteration + relentless instrumented playtesting.

Sources: combineoverwiki.net Developer_commentary/Half-Life:_Alyx · roadtovr.com "These Details Make Half-Life: Alyx…" pts 1–2 · gameinformer.com Valve arms-in-VR · developer.valvesoftware.com Alyx Workshop Tools (example pistol)

---

## 3. THE THRILL OF THE FIGHT — the honest-effort pole (our workout + hand-to-hand model)
Solo dev Ian Fitz. Widely the best VR combat-sim / workout.

- **Damage = impact velocity × mass constant × multiplier**, evaluated per punch. Bands: <2700 ineffective, >3200 dizziness, 4280 = knockdown. Location multipliers (chin/temple/liver/solar-plexus). Pain/trauma accumulates *exponentially* → body work banks damage for later rounds.
- **Auto-calibration is the magic trick:** the game finds the highest force you can *reliably* land and sets that as your balanced max. Muscling/shoving = outlier readings → nerfed instantly. Repeatable snappy technique = power. **This is how "form beats muscle" is enforced.**
- **TOTF2 "Body Effort":** power now graded on the whole kinematic chain (headset/torso motion, weight shift, footwork) — arm-only flicks grade low. Based on real boxing biomechanics studies.
- **No game layer, ever.** No lock-on, no punch windows, no QTEs, no health bars. The opponent is always vulnerable to any unblocked strike. Design test: does real boxing skill transfer 1:1? (It does.)
- **Blocking is pure geometry** — invisible block-volumes wrist-to-elbow; any glove/forearm contact disarms the incoming fist for its duration. Free-form parrying with zero parry system.
- **Opponent reactions are damage-driven, not canned** — AI shifts guard to cover *exactly where you hit*, retreat/pause probability scales with damage; it budgets its own stamina & accuracy.
- **Distinct, exploitable styles per fighter** (counter-puncher, speed-evader, long-reach power, patient punisher…), each with one flaw. You win by scouting tendencies = ring IQ.
- **The player's real body IS the stamina meter** — "you get tired in the game when you get tired in real life." Round/rest structure = free interval training. Measured 9–15 kcal/min, sparring-level.
- **Hit feedback without force feedback:** impact SFX + haptic pulse + particles + grunt (the grunt "is basically the announcer") + damage-scaled reaction; getting hit = white-flash stun that nerfs your damage (a *consequence*, since he can't make you feel it).

Sources: Steam Official Guide (id 1780809608) + damage/auto-adjust/feedback threads · uploadvr.com TOTF2 interview + review · vrfitnessinsider.com interview · vrhealth.institute measurement · medium/super-jump design interview

---

## 4. CROSS-GAME CRAFT — the poles & the named solutions

- **SUPERHOT VR — time coupled to BODY motion (not head).** Scanning the room is free; committing to a swing costs time. Converts every motion into a readable decision → slow-mo feels like *skill*, not a cheat. Levels are hand-authored *choreography* around a fixed standing station; one-hit-kill shatter enemies remove the health/impact-force mismatch entirely. **← This is exactly ONI's drink/loop model.**
- **Boneworks — the full-physics pole.** An 82 kg simulated body → melee weight emerges for free, but the viewpoint gets shoved by collisions → jank + nausea. "Pure simulation, no per-case hacks" kills exploit bugs but costs comfort. Tutorial *coaches the player to pretend to lift heavy things* — pseudo-haptics only works if the player cooperates.
- **Gorn — tuning IS tone.** Same lag/deform parameters: stiff+damped = heft; loose+bouncy = comedy. You cannot borrow Gorn's numbers for a serious sword game.
- **Until You Fall — the arcade compromise (GDC 2020 talks).** Glowing block telegraphs (match pose, not physics), weight via speed-cap not force, and **feedback stacking**: haptic + neon flash + layered SFX + kill slow-mo on every hit. Five cheap channels ≈ the one (force) VR can't deliver.
- **The agency asymmetry (Broken Edge):** you can react to the player but never *move* the player — knockback/hit-stop/root-motion on the body break presence. All "forces on the player" must be diegetic; locomotion is station-based, player-authored, or short dash assists.
- **Hit-stop in VR:** freeze the *enemy/weapon visuals* or dip world-timescale — never the camera.
- **Player IS the animation system** (Saints & Sinners): "the only part that's animated is the fingers." Surrender authored first-person melee anim; polish the physics response.
- **Pseudo-haptics science:** render the virtual hand slightly *slower* than the real hand for heavy objects (control/display ratio) → users genuinely perceive weight (Samad et al., CHI 2019, Facebook Reality Labs). Usable range is narrow; multisensory (C/D + haptics) widens it.

Sources: evanfletcher42.com · gdcvault.com Until You Fall pts 1–2 · gamedeveloper.com Boneworks + Broken Edge · dl.acm.org/10.1145/3290605.3300550 (Samad CHI2019) · voicesofvr.com #88 SUPERHOT · 80.lv Saints & Sinners

---

## THE CORE CURRICULUM — 8 concepts to build weighty VR melee (ranked)
1. **Phantom/physical decoupling** — invisible tracked target + visible rigidbody weapon joined by springs. Everything else tunes this.
2. **PD/spring-damper tuning as tone** — stiffness/damping ARE the game's personality. Asymmetric linear-stiff / rotational-soft is the pro move.
3. **Pseudo-haptics (C/D ratio)** — the science of why lag reads as mass; coach the player to "pretend it's heavy."
4. **Velocity-gated damage** — momentum-at-contact + minimum thresholds + edge-alignment. The anti-waggle law; the player's real muscles become the weight sim.
5. **Feedback stacking instead of force** — haptic pulse + SFX + VFX + world-side hit-stop + enemy flinch. Never freeze the camera.
6. **Active-ragdoll enemies** — spring-driven ragdolls tracking animation poses; impulse on hit; 0.1–0.3 s blend to full ragdoll on death.
7. **The agency asymmetry** — never impose motion/knockback/hit-stop on the player's body; make all player-forces diegetic. Governs comfort/nausea budget.
8. **Resolution contract** — decide before tuning: total-on-contact (SUPERHOT), simulation (B&S), or pattern/telegraph (Until You Fall). Mixing contracts is why mediocre VR melee feels arbitrary.

---

## WHAT THIS MEANS FOR ONI: JAPAN (the synthesis)
- **Sword** → Blade & Sorcery's spring/damper/maxForce blade + velocity-gated edge damage + penetration-as-constraint. This is the proven recipe; tune stiff+damped for heavy katana heft.
- **Gun** → Alyx's laws exactly: one-handed, multi-step reload on separate inputs, diegetic ammo (no HUD), recoil on the model + haptic (never the camera). The **cost of the draw** = a deliberate multi-step gesture, which is *already* how Alyx makes reloads feel earned.
- **Hand-to-hand** → Thrill of the Fight's velocity + body-effort model with reliability-seeking auto-calibration. Form beats muscle; the player's body is the stamina meter = our "it's a workout."
- **The drink / the loop** → SUPERHOT's time-couples-to-motion is our diegetic engine. Slowing time is both the mastery aid AND (per comfort science) a nausea reducer — the drink disguises an accessibility assist as an advantage.
- **Opponents** → active-ragdoll bodies + damage-driven reactions + distinct exploitable styles (TOTF) — matches your "each fighter is a real school of the sword, same move each run" spec exactly.
- **The agency asymmetry is our design constraint:** the fight comes to the player at a station; we never shove the camera. Room-scale footwork is the player's own.
- **The honest gate (the tech bet) — NOW ANSWERED (see §5).** The shirt-lift draw is genuinely novel; a scoped/choreographed version is feasible today. Everything else is buildable with shipped techniques.

---

## 5. THE CLOTH GATE + COMFORT SCIENCE (the tech-bet answer)

**Grabbable worn cloth — prior art:** NONE. No shipping VR game lets you grab/lift worn clothing off the body. All "clothing physics" = ambient sway (Bonelab mods, VRChat PhysBones) or **invisible holster trigger zones with zero cloth in the loop** (VR "concealed carry" = a buzz zone at the hip). Blade & Sorcery U11 "clothing" = swappable skinned garments, not liftable sim. **The ONI shirt-lift is novel — opportunity AND risk.**

**Feasibility verdict (grab garment on a moving body @ 90fps):**
- **Today:** feasible as a SCOPED special case — one hero garment, a GUIDED grab (hand snaps to a pinned hem region, not free-collision anywhere), body mostly still during the draw, ~2–3k particles. NOT feasible: free-form "grab any cloth anywhere while sprinting."
- **1–2 years:** the scoped believable version becomes comfortably shippable.
- **Still far:** fully general, robust, two-handed cloth on a fast-moving body (research-grade).

**Tools:** Unity **Obi Cloth** = strongest off-the-shelf — XPBD particle cloth, VR-supported, **per-particle pin constraints are first-class** (grab-and-hold built in); benchmark ~1.8ms/frame for one full-body cloth char (fits the 11.1ms/90fps budget if it's the only heavy cloth). **Magica Cloth 2** = very fast DOTS, runtime vertex move, but secondary-motion-grade collision. UE5 **Chaos panel-cloth** (Dataflow editor, 5.4+) + hand-attach = the UE path; **ML Deformer** infers drape for ~free but only for TRAINED poses — it does NOT respond to an arbitrary runtime grab, so the interactive layer must be the simulated one. (Discarded two unverifiable search claims: "Google ClothFormer," "NVIDIA NeRF-Cloth" — likely confabulated.)

**Design implication:** don't simulate the whole shirt honestly. **Stage a choreographed hem-grab:** pinned interactive hem region (Obi/Chaos) + hand-attach on grip + rest of shirt on cheap secondary/ML sim + body relatively still during the draw. Reads as physical without demanding free-form correctness. (M5's draw can fall back to a "sweep the jacket" interaction that needs no true garment sim.)

**Comfort science — the drink is validated:**
- **Vignette reduces sickness, invisibly:** Fernandes & Feiner (IEEE 3DUI 2016, Best Paper) — DYNAMIC FOV restriction that closes on motion-mismatch and reopens **significantly cut VR sickness, did NOT reduce presence, and most users never noticed.** Replicated since; now an industry-standard comfort setting.
- **Slowing time reduces nausea (mechanistic, convergent dev consensus):** VR sickness is driven by vection (illusory self-motion) + acceleration (vestibular senses *change* in velocity). Slower speed → less vection; fewer/softer accelerations → less provocation. A drink that slows time cuts BOTH and pairs naturally with a vignette that tightens during fast action.
- **Diegetic comfort is proven, admired design:** Metroid Prime (HUD = Samus's visor), Dead Space (health = suit spine). The "drink that slows the world" is a fictional wrapper over the two best-evidenced comfort levers — players read it as a power/ritual, not an accessibility toggle.

**Bottom line:** the shirt-lift is inventable now (scoped + staged), not copyable; the drink is a real, evidence-backed comfort+accessibility system in a costume — ship it. Sources: Obi Cloth docs (performance/FAQ), Magica Cloth 2, UE5 Panel Cloth (Epic), ML Deformer forums, Fernandes & Feiner (phys.org/IEEE Spectrum), Road to VR comfort glossary, ACM 2021 FOV+spatial-learning.
