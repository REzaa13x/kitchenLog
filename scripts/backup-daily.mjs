// Backup harian otomatis DapurOps + retensi + verifikasi restore.
// Server-only. Tidak menyentuh frontend dan tidak pernah menghapus backup
// yang bukan buatan proses ini (nama harus cocok pola dapurops-YYYYMMDD.sql).
//
// Pakai:
//   node scripts/backup-daily.mjs             # backup + verifikasi + retensi
//   node scripts/backup-daily.mjs --no-verify # lewati drill restore
//
// Env:
//   BACKUP_PATH      folder output (default: ../dapurops-backups, di luar webroot)
//   BACKUP_KEEP_DAYS jumlah hari retensi (default 14)
//   DB_* / DATABASE_URL  sama seperti scripts/backup-verify.mjs
//   BACKUP_VERIFY_*  akun restore drill (loopback saja)
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const NAME_RE = /^dapurops-(\d{4})(\d{2})(\d{2})\.sql(\.json)?$/;

function config() {
  const raw = process.env.BACKUP_PATH || join(process.cwd(), '..', 'dapurops-backups');
  // Cron/shell tidak selalu meng-expand ~; lakukan sendiri agar path absolut.
  const expanded = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw;
  const path = resolve(expanded);
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 14);
  if (!Number.isInteger(keepDays) || keepDays < 1 || keepDays > 365) throw new Error('BACKUP_KEEP_DAYS harus 1–365.');
  const webroot = resolve(process.env.WEBROOT || process.cwd());
  const relative = path.startsWith(webroot);
  return { path, keepDays, insideWebroot: relative, webroot };
}

function stamp(date = new Date()) {
  // Tanggal WIB agar nama file cocok dengan hari operasional.
  const wib = new Date(date.getTime() + 7 * 3600_000);
  return `${wib.getUTCFullYear()}${String(wib.getUTCMonth() + 1).padStart(2, '0')}${String(wib.getUTCDate()).padStart(2, '0')}`;
}

async function backupOnce(target) {
  const { stdout } = await run(process.execPath, ['scripts/backup-verify.mjs', 'backup', target], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 15 * 60_000,
  });
  const line = stdout.trim().split(/\r?\n/).pop() || '';
  const parsed = JSON.parse(line);
  if (parsed.backup !== 'PASS') throw new Error('Backup tidak melaporkan PASS.');
  return parsed;
}

async function verifyOnce(target) {
  const { stdout } = await run(process.execPath, ['scripts/backup-verify.mjs', 'verify', target], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 15 * 60_000,
  });
  const line = stdout.trim().split(/\r?\n/).pop() || '';
  const parsed = JSON.parse(line);
  if (parsed.restore !== 'PASS') throw new Error('Verifikasi restore tidak melaporkan PASS.');
  return parsed;
}

/** Hapus hanya backup milik pola nama kita yang lebih tua dari retensi. */
async function retention(dir, keepDays, keepTarget) {
  const entries = await readdir(dir);
  const cutoff = Date.now() - keepDays * 86_400_000;
  const removed = [];
  for (const entry of entries) {
    const match = NAME_RE.exec(entry);
    if (!match) continue; // jangan sentuh file lain
    const filePath = join(dir, entry);
    if (filePath === keepTarget || filePath === `${keepTarget}.json`) continue;
    const info = await stat(filePath);
    if (info.mtimeMs >= cutoff) continue;
    await rm(filePath, { force: true });
    removed.push(entry);
  }
  return removed;
}

const cfg = config();
await mkdir(cfg.path, { recursive: true, mode: 0o700 });
const target = join(cfg.path, `dapurops-${stamp()}.sql`);
if (existsSync(target)) throw new Error(`Backup hari ini sudah ada: ${target}. Tidak ditimpa.`);

const result = await backupOnce(target);
let verified = null;
if (!process.argv.includes('--no-verify')) verified = await verifyOnce(target);
const removed = await retention(dirname(target), cfg.keepDays, target);

console.log(
  JSON.stringify({
    status: 'PASS',
    file: target,
    insideWebroot: cfg.insideWebroot,
    tables: result.tables,
    rows: result.rows,
    sha256: result.sha256,
    restore: verified ? 'PASS' : 'SKIPPED',
    retentionDays: cfg.keepDays,
    removed: removed.length,
  })
);
