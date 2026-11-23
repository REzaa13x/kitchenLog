// Membuat ZIP dari daftar file tertentu (tanpa alat zip eksternal).
import { createWriteStream, readdirSync, statSync, existsSync, unlinkSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { deflateRawSync } from 'zlib';

const ROOT = process.argv[2];
const OUT = process.argv[3];
const INCLUDE_ASSETS = process.argv[4] !== 'no-assets';

interface Entry {
  abs: string;
  rel: string;
  isDir: boolean;
  size: number;
  mtime: Date;
}

function walk(dir: string, acc: Entry[]) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    const rel = relative(ROOT, abs).split(sep).join('/');
    // Lewati gambar yang tidak dirujuk kode (menghemat ~2.6 MB)
    if (!INCLUDE_ASSETS && rel.startsWith('src/assets/images/')) continue;
    if (st.isDirectory()) {
      acc.push({ abs, rel: rel + '/', isDir: true, size: 0, mtime: st.mtime });
      walk(abs, acc);
    } else {
      acc.push({ abs, rel, isDir: false, size: st.size, mtime: st.mtime });
    }
  }
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date) {
  const time =
    ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

if (existsSync(OUT)) unlinkSync(OUT);

const entries: Entry[] = [];
walk(ROOT, entries);
console.log(`entri: ${entries.length} (gambar: ${INCLUDE_ASSETS ? 'ikut' : 'dilewati'})`);

const chunks: Buffer[] = [];
const central: Buffer[] = [];
let offset = 0;

for (const e of entries) {
  const nameBuf = Buffer.from(e.rel, 'utf8');
  const { time, date } = dosTime(e.mtime);
  let data = Buffer.alloc(0);
  let method = 0;
  let crc = 0;
  let compSize = 0;
  let uncompSize = 0;

  if (!e.isDir) {
    const raw = readFileSync(e.abs);
    uncompSize = raw.length;
    crc = crc32(raw);
    const deflated = deflateRawSync(raw, { level: 9 });
    if (deflated.length < raw.length) {
      data = deflated;
      method = 8;
    } else {
      data = raw;
      method = 0;
    }
    compSize = data.length;
  }

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compSize, 18);
  local.writeUInt32LE(uncompSize, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, nameBuf, data);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);
  cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(method, 10);
  cen.writeUInt16LE(time, 12);
  cen.writeUInt16LE(date, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(compSize, 20);
  cen.writeUInt32LE(uncompSize, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt16LE(0, 30);
  cen.writeUInt16LE(0, 32);
  cen.writeUInt16LE(0, 34);
  cen.writeUInt16LE(0, 36);
  cen.writeUInt32LE(e.isDir ? 0x10 : 0, 38);
  cen.writeUInt32LE(offset, 42);
  central.push(cen, nameBuf);

  offset += local.length + nameBuf.length + data.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

const ws = createWriteStream(OUT);
ws.write(Buffer.concat(chunks));
ws.write(centralBuf);
ws.write(end);
ws.end(() => {
  const st = statSync(OUT);
  console.log(`ZIP: ${OUT}`);
  console.log(`ukuran: ${(st.size / 1024).toFixed(1)} KB`);
});
