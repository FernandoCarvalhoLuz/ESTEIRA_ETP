// Amplia o cenário da foto do Drive até o formato da arte com o LaMa (ver outpaintWorker.js).
// Os fundos ficam em cache (data/auto-outpaint) por foto e posição: a mesma foto não roda a IA de novo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { ensureModel, runModelWorker } from './ml.js';

const CACHE = path.join(config.dataDir, 'auto-outpaint');
const WORKER = fileURLToPath(new URL('./outpaintWorker.js', import.meta.url));
const VERSION = 1; // muda quando o método mudar, para não reaproveitar fundos antigos

/**
 * jobs = [{ W, H, x, y, w }]: tela W×H com a foto na largura w colada em (x, y).
 * Devolve os fundos (PNG) na mesma ordem.
 */
export async function outpaint(photo, jobs) {
  const hash = crypto.createHash('sha1').update(photo).digest('hex');
  const file = (j) => path.join(CACHE, `${hash}-v${VERSION}-${j.W}x${j.H}-${j.x}_${j.y}_${j.w}.png`);
  const missing = jobs.filter((j) => !fs.existsSync(file(j)));
  if (missing.length) {
    const model = await ensureModel('lama');
    fs.mkdirSync(CACHE, { recursive: true });
    const tmp = path.join(os.tmpdir(), `etp-${crypto.randomUUID()}`);
    fs.writeFileSync(`${tmp}.jpg`, photo);
    fs.writeFileSync(`${tmp}.json`, JSON.stringify({ photo: `${tmp}.jpg`, jobs: missing.map((j) => ({ ...j, out: file(j) })) }));
    try {
      await runModelWorker(WORKER, [`${tmp}.json`, model], { timeout: 240_000 + missing.length * 120_000 });
    } finally {
      fs.rmSync(`${tmp}.jpg`, { force: true });
      fs.rmSync(`${tmp}.json`, { force: true });
    }
  }
  return jobs.map((j) => fs.readFileSync(file(j)));
}

/**
 * Inpainting com tela e máscara prontas: jobs = [{ W, H, canvas (PNG), mask (PNG, branco = refazer), key }].
 * Devolve o preenchimento da IA (PNG W×H) de cada um, na mesma ordem; key identifica o resultado no cache.
 */
export async function inpaint(jobs) {
  const file = (j) => path.join(CACHE, `${j.key}-v${VERSION}-inpaint.png`);
  const missing = jobs.filter((j) => !fs.existsSync(file(j)));
  if (missing.length) {
    const model = await ensureModel('lama');
    fs.mkdirSync(CACHE, { recursive: true });
    const tmp = path.join(os.tmpdir(), `etp-${crypto.randomUUID()}`);
    const list = missing.map((j, i) => {
      fs.writeFileSync(`${tmp}-${i}-c.png`, j.canvas);
      fs.writeFileSync(`${tmp}-${i}-m.png`, j.mask);
      return { kind: 'inpaint', W: j.W, H: j.H, canvas: `${tmp}-${i}-c.png`, mask: `${tmp}-${i}-m.png`, out: file(j) };
    });
    fs.writeFileSync(`${tmp}.json`, JSON.stringify({ jobs: list }));
    try {
      await runModelWorker(WORKER, [`${tmp}.json`, model], { timeout: 240_000 + missing.length * 120_000 });
    } finally {
      fs.rmSync(`${tmp}.json`, { force: true });
      for (const j of list) { fs.rmSync(j.canvas, { force: true }); fs.rmSync(j.mask, { force: true }); }
    }
  }
  return jobs.map((j) => fs.readFileSync(file(j)));
}
