#!/usr/bin/env node
// CONSUME — ElevenLabs music generator (title theme, trip, daytime bed).
// Key from ../../.env (gitignored). Idempotent. node tools/gen_music.mjs [--force]
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SFX = join(HERE, '..', 'sfx');
mkdirSync(SFX, { recursive: true });
const KEY = (readFileSync(join(HERE, '..', '..', '.env'), 'utf8').match(/ELEVENLABS_API_KEY=(.+)/) || [])[1]?.trim();
if (!KEY) { console.error('no key'); process.exit(1); }
const FORCE = process.argv.includes('--force');
const TRACKS = [
  { name: 'music_title', ms: 33000, prompt: 'A cinematic orchestral main theme for a lonely wilderness survival game. Warm sustained strings, a solitary oboe and french horn melody, soft harp. Hopeful yet solitary and a little haunting, film-score, slow and breathing, no percussion, no drums. Loops gently.' },
  { name: 'music_trip',  ms: 42000, prompt: 'Hypnotic psychedelic magic-carpet music. Swirling sitar, dreamy detuned synth pads, gentle tabla pulse, warped warm reverb, surreal and floating, slowly evolving, no harsh beats. A good trip, beautiful not scary.' },
  { name: 'music_base',  ms: 42000, prompt: 'A haunting minimal ambient underscore for a wild valley at golden hour. Sparse sustained strings, distant glassy tones, low drones, lonely and eerie-calm, almost no melody, very slow, no percussion.' },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const tr of TRACKS) {
  const out = join(SFX, tr.name + '.mp3');
  if (existsSync(out) && !FORCE) { console.log('skip', tr.name); continue; }
  console.log('gen ', tr.name, '...');
  const res = await fetch('https://api.elevenlabs.io/v1/music', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: tr.prompt, music_length_ms: tr.ms }),
  });
  if (!res.ok) { console.error('FAIL', tr.name, res.status, (await res.text()).slice(0, 200)); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(out, buf);
  console.log('ok  ', tr.name, buf.length, 'bytes');
  await sleep(1500);
}
console.log('done.');
