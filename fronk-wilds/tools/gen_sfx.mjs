#!/usr/bin/env node
// CONSUME — ElevenLabs sound-effect generator.
// Reads ELEVENLABS_API_KEY from ../../.env (gitignored — never committed).
// Idempotent: skips any sfx/<name>.mp3 that already exists. Re-run freely.
//   node tools/gen_sfx.mjs            # generate missing
//   node tools/gen_sfx.mjs --force    # regenerate everything
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');                 // fronk-wilds/
const SFX = join(ROOT, 'sfx');
const ENV = join(ROOT, '..', '.env');          // fronk-games/.env
mkdirSync(SFX, { recursive: true });

const env = readFileSync(ENV, 'utf8');
const KEY = (env.match(/ELEVENLABS_API_KEY=(.+)/) || [])[1]?.trim();
if (!KEY) { console.error('no ELEVENLABS_API_KEY in', ENV); process.exit(1); }
const FORCE = process.argv.includes('--force');

// Each entry: name, prompt, dur (s), influence (0..1). `n` makes name_1..name_n
// variations so repeated sounds (steps, impacts) don't feel robotic.
const DRY = ', isolated single sound effect, dry, close-mic, no music, no reverb, no speech';
const MANIFEST = [
  // ── arrow impacts (by surface) ──
  { name: 'impact_wood',  n: 2, dur: 1.0, influence: 0.5, prompt: 'an arrow slams hard into a thick solid tree trunk, sharp deep woody THOCK with a faint shaft quiver, dry, close, short' },
  { name: 'impact_ground',n: 2, dur: 1.0, influence: 0.5, prompt: 'an arrow stabs deep into soft earth and grass, dull muffled earthy thud with a tiny soil scatter, short' },
  { name: 'impact_flesh', n: 2, dur: 1.0, influence: 0.5, prompt: 'an arrow strikes a large animal body, heavy wet meaty thwack and flesh impact, visceral, brutal, short, no scream' },
  { name: 'impact_water', n: 2, dur: 1.0, influence: 0.5, prompt: 'an arrow plunges into a lake, sharp water splash and plonk with a small after-ripple, short' },
  // ── the bow ──
  { name: 'bow_release',  n: 2, dur: 1.0, prompt: 'a wooden longbow looses an arrow, string snap and whoosh, taut twang' },
  { name: 'bow_draw',     n: 2, dur: 1.8, influence: 0.4, prompt: 'the real sound of a person slowly drawing a wooden longbow: creaking bending wood, the leather grip flexing and the bowstring stretching taut under rising tension, organic close-mic foley, woody and natural, NO electronic tones, no synth, no music' },
  // ── the bear ──
  { name: 'bear_growl',   n: 2, dur: 2.0, prompt: 'a large angry grizzly bear roars and growls, deep guttural, menacing' },
  { name: 'bear_charge',  n: 1, dur: 2.2, prompt: 'a huge bear charges, thundering heavy footfalls on earth with a low roar' },
  { name: 'bear_rustle',  n: 1, dur: 1.4, prompt: 'a large animal pushes through dense bushes and undergrowth, leaves rustling' },
  // ── footsteps by surface ──
  { name: 'step_grass',   n: 3, dur: 0.5, influence: 0.4, prompt: 'one soft muffled footstep, a leather boot pressing down into a grassy meadow, dry grass and soft soil compressing, natural outdoor foley, organic, warm, NO metallic ring, no click, no clang' },
  { name: 'step_rock',    n: 3, dur: 0.5, influence: 0.4, prompt: 'one footstep, a leather boot on dirt and small loose stones, soft gritty scuff, natural outdoor foley, organic, no metallic ring, no clang' },
  { name: 'step_sand',    n: 3, dur: 0.5, influence: 0.4, prompt: 'one footstep, a leather boot pressing into soft dry sand, muffled granular shuffle, natural, organic, no metallic ring' },
  // ── body / misc foley ──
  { name: 'twig_snap',    n: 2, dur: 0.7, prompt: 'a dry twig snaps sharply underfoot in a forest, crisp crack' },
  { name: 'breath',       n: 2, dur: 1.6, prompt: 'a single human exhale, tired heavy breath out through the nose, close, calm' },
  { name: 'thud',         n: 1, dur: 0.9, prompt: 'a heavy body blow gut punch, dull winded impact, short' },
  { name: 'fire_catch',   n: 1, dur: 1.4, prompt: 'a whoosh as a fire suddenly catches and ignites, flames flaring up' },
  // ── sharks ──
  { name: 'shark_splash', n: 2, dur: 1.2, prompt: 'a large fish or shark thrashing and splashing hard at the surface of a lake, big violent water splash, close' },
  { name: 'shark_lunge',  n: 1, dur: 1.4, prompt: 'a huge shark bursts up out of the water in a violent surging splash, sudden explosive water lunge, menacing' },
  // ── living-animal idle calls (spatial, played by audio.animalCall) ──
  { name: 'deer_call',  n: 2, dur: 1.2, prompt: 'a deer bleats and grunts softly, short nasal call, calm wild animal in a meadow, natural, no music' },
  { name: 'stag_call',  n: 2, dur: 1.8, prompt: 'a red deer stag bellows, deep guttural roar grunt, wild, resonant, autumn rut, natural, no music' },
  { name: 'fox_call',   n: 2, dur: 1.0, prompt: 'a red fox screams and yelps, sharp eerie call, short, piercing, natural, no music' },
  { name: 'cow_moo',    n: 2, dur: 1.6, prompt: 'a cow lows and moos, deep mellow drawn-out call, calm pasture animal, natural, no music' },
  { name: 'horse_call', n: 2, dur: 1.6, prompt: 'a horse whinnies and neighs, bright snorting call, single, wild, natural, no music' },
  { name: 'wolf_call',  n: 2, dur: 1.4, prompt: 'a wolf yips and growls low, short close call, not a full howl, alert wild canine, natural, no music' },
  // ── seamless ambience BEDS (looped in-engine; long clips for smooth loops) ──
  { name: 'bed_wind',  n: 1, dur: 16, influence: 0.3, prompt: 'gentle steady wind blowing through a meadow and trees, soft continuous breeze, calm ambience' },
  { name: 'bed_water', n: 1, dur: 16, influence: 0.3, prompt: 'calm lake water lapping gently at a shoreline, soft continuous ripples, peaceful ambience' },
  { name: 'bed_rain',  n: 1, dur: 16, influence: 0.3, prompt: 'steady soft rainfall on grass and leaves, gentle continuous rain ambience, no thunder' },
  { name: 'bed_fire',  n: 1, dur: 16, influence: 0.3, prompt: 'a large campfire burning steadily, continuous crackling roar of flames, close ambience' },
  // ── raft sailing (sail_wind looped in-engine; the rest one-shots) ──
  { name: 'sail_wind',   n: 1, dur: 12, influence: 0.3, prompt: 'wind filling and luffing a cloth sail on open water, steady rushing breeze flapping canvas with gentle hull wash, continuous, no music' },
  { name: 'raft_creak',  n: 2, dur: 1.4, prompt: 'wet wooden logs and rope lashings creaking and groaning as a raft flexes on the water, organic timber and cordage strain, no music' },
  { name: 'wave_slap',   n: 2, dur: 1.0, prompt: 'a flat wooden raft slaps down onto a lake wave, soft water splash and hull thump, short, natural' },
  { name: 'wave_launch', n: 1, dur: 1.0, prompt: 'a raft rushes up a wave face and lifts off the crest, surging water whoosh and a brief airborne lull, natural' },
  { name: 'wave_crash',  n: 2, dur: 1.4, prompt: 'a heavy raft crashes down hard into open water after a jump, big explosive splash and spray with a deep wooden boom, dramatic, natural' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gen(name, prompt, dur, influence = 0.45) {
  const out = join(SFX, name + '.mp3');
  if (existsSync(out) && !FORCE) { console.log('skip', name); return; }
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt + DRY, duration_seconds: dur, prompt_influence: influence }),
  });
  if (!res.ok) { console.error('FAIL', name, res.status, (await res.text()).slice(0, 200)); return; }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(out, buf);
  console.log('ok  ', name, buf.length, 'bytes');
  await sleep(900);
}

const only = process.argv.slice(2).filter(a => !a.startsWith('--'));   // optional name filter
for (const m of MANIFEST) {
  if (only.length && !only.some(o => m.name.startsWith(o))) continue;
  if (m.n && m.n > 1) for (let i = 1; i <= m.n; i++) await gen(`${m.name}_${i}`, m.prompt, m.dur, m.influence);
  else await gen(m.name, m.prompt, m.dur, m.influence);
}
console.log('done.');
