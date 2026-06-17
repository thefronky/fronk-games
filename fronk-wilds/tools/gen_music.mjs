#!/usr/bin/env node
// CONSUME — ElevenLabs music + stingers. One cohesive violin-led theme (D minor)
// and short stingers cut from the same world. Key from ../../.env (gitignored).
//   node tools/gen_music.mjs            # missing only
//   node tools/gen_music.mjs --force    # all
//   node tools/gen_music.mjs music_title sting_kill   # only these
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SFX = join(HERE, '..', 'sfx');
mkdirSync(SFX, { recursive: true });
const KEY = (readFileSync(join(HERE, '..', '..', '.env'), 'utf8').match(/ELEVENLABS_API_KEY=(.+)/) || [])[1]?.trim();
if (!KEY) { console.error('no key'); process.exit(1); }
const FORCE = process.argv.includes('--force');
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));

// A shared world so the pieces feel like one score: a lonely, expressive solo
// VIOLIN theme in D minor over warm strings. No chiptune, no 8-bit, no drums.
const THEME = 'a lonely, expressive solo violin in D minor over warm sustained orchestral strings, film score, hopeful yet haunting, NO chiptune, no 8-bit, no synth beeps, no drums';
const TRACKS = [
  { name: 'music_title', ms: 34000, prompt: `The main title theme: ${THEME}. A clear singable violin melody that swells and breathes, slow, cinematic, loops gently.` },
  { name: 'music_trip',  ms: 42000, prompt: `The same D minor solo violin theme reimagined as a dreamlike, surreal, floating version: a softly wavering detuned solo violin with lush reverb and gentle swirling strings, hypnotic and weightless, slowly shifting, beautiful and calm, no beats, no drums.` },
  // ── stingers — short musical hits cut from the same theme/key ──
  { name: 'sting_kill',   ms: 6000, prompt: `A short triumphant musical STINGER in D minor from a violin-led film score: a rising solo violin flourish landing on a confident resolved chord, then silence. About 3 seconds, cinematic, clean ending.` },
  { name: 'sting_flee',   ms: 6000, prompt: `A short wistful musical STINGER in D minor, violin-led: a soft falling two-note violin sigh, a missed chance, gentle and brief, then silence. About 2 seconds.` },
  { name: 'sting_escape', ms: 7000, prompt: `A short dramatic musical STINGER in D minor, violin-led: tense strings surge then exhale into relief, a narrow escape, brief, then silence. About 3 seconds.` },
  { name: 'sting_boat',   ms: 7000, prompt: `A short adventurous musical STINGER in D minor, violin-led: solo violin and strings lift and swell upward as if setting off on a journey, brief, then settle. About 3 seconds.` },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const tr of TRACKS) {
  if (only.length && !only.includes(tr.name)) continue;
  const out = join(SFX, tr.name + '.mp3');
  if (existsSync(out) && !FORCE && !only.includes(tr.name)) { console.log('skip', tr.name); continue; }
  console.log('gen ', tr.name, '...');
  const res = await fetch('https://api.elevenlabs.io/v1/music', {
    method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: tr.prompt, music_length_ms: tr.ms }),
  });
  if (!res.ok) { console.error('FAIL', tr.name, res.status, (await res.text()).slice(0, 200)); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(out, buf);
  console.log('ok  ', tr.name, buf.length, 'bytes');
  await sleep(1500);
}
console.log('done.');
