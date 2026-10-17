// Recorte do carro na foto do Drive (máscara alfa): mede o carro (enquadramento da arte) e confere se a foto de
// capa mostra o carro inteiro.
// - Modelo ISNet (ml.js), num processo separado (carMaskWorker.js); resultado em cache por conteúdo da foto.
//   O BiRefNet recorta um pouco melhor, mas usa ~6,5 GB de RAM; no servidor compartilhado não cabe.
// - Se algo falhar, devolve null e a arte sai no enquadramento padrão (sem recorte).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { ensureModel, runModelWorker } from './ml.js';

const CACHE = path.join(config.dataDir, 'auto-masks');
const WORKER = fileURLToPath(new URL('./carMaskWorker.js', import.meta.url));

async function runWorker(photo, out) {
  const model = await ensureModel('isnet');
  const tmp = path.join(os.tmpdir(), `etp-${crypto.randomUUID()}.jpg`);
  fs.writeFileSync(tmp, photo);
  try {
    await runModelWorker(WORKER, [tmp, out, model], { timeout: 120_000 });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * Máscara do carro no tamanho da foto (já girada pelo EXIF): { width, height, data (1 canal), box, area }.
 * box = retângulo do carro em px; area = fração da foto ocupada pelo carro.
 */
export async function carMask(photo) {
  try {
    const { default: sharp } = await import('sharp');
    const hash = crypto.createHash('sha1').update(photo).digest('hex');
    const file = path.join(CACHE, `${hash}.png`);
    if (!fs.existsSync(file)) {
      fs.mkdirSync(CACHE, { recursive: true });
      await runWorker(photo, file);
    }
    const meta = await sharp(photo).rotate().toBuffer({ resolveWithObject: true }).then((r) => r.info);
    const { width, height } = meta;
    const data = await sharp(file).resize(width, height, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    let n = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[y * width + x] < 128) continue;
        n += 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (!n) return null;
    return { width, height, data, box: { x0, y0, x1, y1 }, area: n / (width * height) };
  } catch (err) {
    console.warn(`[arte] recorte do carro indisponível: ${err.message}`);
    return null;
  }
}

/** A foto mostra o carro inteiro (não é detalhe de roda/interior nem carro cortado na borda)? */
export function isFullCar(m) {
  if (!m) return false;
  const { box, width, height, area } = m;
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  return box.x0 > width * 0.002 && box.x1 < width * 0.998 && box.y0 > height * 0.02
    && area > 0.1 && area < 0.8 && bw / bh > 1.05;
}
