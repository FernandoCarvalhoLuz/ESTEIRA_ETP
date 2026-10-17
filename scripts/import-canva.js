// Importa artes exportadas do Canva para a biblioteca de UMA conta (cada conta é um cliente).
// Uso: node scripts/import-canva.js act_123456789 "<pasta>"
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { mediaStore } from '../server/builder/media.js';
import { parseCanvaName, readPngSize } from '../server/builder/canva.js';
import { uploadsDir } from '../server/store.js';

const [accountId, folder] = process.argv.slice(2);
if (!/^act_\d+$/.test(accountId || '') || !folder || !fs.existsSync(folder)) {
  console.error('Uso: node scripts/import-canva.js act_<id da conta> "<pasta com as artes>"');
  process.exit(1);
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const existing = new Set(mediaStore.list().filter((m) => m.scope === 'canva' && m.accountId === accountId).map((m) => `${m.originalName}|${m.size}`));
let imported = 0;
let skipped = 0;

for (const file of walk(folder)) {
  const ext = path.extname(file).toLowerCase();
  if (!MIME[ext]) continue;
  const originalName = path.basename(file);
  const size = fs.statSync(file).size;
  if (existing.has(`${originalName}|${size}`)) {
    skipped += 1;
    continue;
  }
  const header = Buffer.alloc(24);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, header, 0, 24, 0);
  fs.closeSync(fd);
  const dims = ext === '.png' ? readPngSize(header) : {};

  const filename = `${crypto.randomUUID()}${ext}`;
  fs.copyFileSync(file, path.join(uploadsDir, filename));
  mediaStore.insert({
    accountId,
    scope: 'canva',
    kind: 'image',
    mime: MIME[ext],
    size,
    filename,
    originalName,
    width: dims.width || null,
    height: dims.height || null,
    canva: parseCanvaName(originalName, { size, ...dims, folder: path.basename(path.dirname(file)) }),
    meta: {},
    createdBy: 'import-canva',
  });
  imported += 1;
}

console.log(`Conta ${accountId}: ${imported} arte(s) importada(s); ${skipped} já existiam.`);
