// Memecah base64 menjadi file chunk agar bisa dikirim bertahap.
import { readFileSync, writeFileSync } from 'fs';

const src = 'D:/Telkom_University/Ko+lab/ngolab/kitchenLog/dapurops.b64';
const b64 = readFileSync(src, 'utf8');
const CHUNK = 190_000;
const total = Math.ceil(b64.length / CHUNK);

for (let i = 0; i < total; i++) {
  const part = b64.slice(i * CHUNK, (i + 1) * CHUNK);
  writeFileSync(
    `D:/Telkom_University/Ko+lab/ngolab/kitchenLog/chunk-${i}.txt`,
    part,
    'utf8'
  );
  console.log(`chunk-${i}.txt : ${part.length} chars`);
}
console.log(`total chunk: ${total}`);
