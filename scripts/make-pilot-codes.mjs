// Generates participant codes for the research pilot: TF-XXXX-XXXX from 30 unambiguous characters
// (no 0/O, 1/I/L, U), about 39 bits each, so an issued code cannot be found by guessing.
// Prints the codes, then the SQL that registers them (Supabase → SQL editor). Only registered codes can upload.
// Usage: node scripts/make-pilot-codes.mjs [count=20]
// Keep the code ↔ person list OFFLINE: never in this repository, the database or a shared drive.
import { randomInt } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; // keep in sync with src/shared/pilot.ts (a test checks)
const count = Number(process.argv[2] ?? 20);
if (!Number.isInteger(count) || count < 1 || count > 1000) { console.error('usage: node scripts/make-pilot-codes.mjs [count 1-1000]'); process.exit(1); }
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const codes = new Set();
while (codes.size < count) codes.add(`TF-${group()}-${group()}`);

console.log([...codes].join('\n'));
console.log(`\n-- Register them (Supabase → SQL editor):\ninsert into public.pilot_codes (code) values\n${[...codes].map((c) => `  ('${c}')`).join(',\n')}\non conflict do nothing;`);
