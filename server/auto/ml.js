// Modelos de IA locais (ONNX, rodam na CPU do servidor, sem custo por imagem) usados pelo gerador de artes:
// - isnet: recorte do carro (máscara), para medir o carro e conferir a foto de capa;
// - lama:  inpainting/outpainting (LaMa), para ampliar o cenário da foto até o formato da arte.
// Os arquivos ficam em data/models/ (fora do deploy) e são baixados na primeira vez.
// Cada execução roda num processo separado — a inferência trava a thread por alguns segundos e usa ~0,7 GB,
// que voltam ao sistema quando o processo termina — e uma por vez, para não somar memória no servidor compartilhado.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export const MODELS = {
  // ISNet (DIS, Apache-2.0) exportado pelo projeto rembg. ~180 MB, pico ~0,7 GB.
  isnet: { file: 'isnet.onnx', url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx' },
  // big-lama (Apache-2.0) exportado para ONNX com entrada fixa de 512×512. ~210 MB, pico ~0,65 GB.
  lama: { file: 'lama_fp32.onnx', url: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx' },
};

const MODEL_DIR = path.join(config.dataDir, 'models');
const downloading = new Map();

/** Caminho do modelo, baixando na primeira vez. */
export async function ensureModel(key) {
  const m = MODELS[key];
  const file = path.join(MODEL_DIR, m.file);
  if (fs.existsSync(file)) return file;
  if (!downloading.has(key)) {
    downloading.set(key, (async () => {
      fs.mkdirSync(MODEL_DIR, { recursive: true });
      const res = await fetch(m.url, { signal: AbortSignal.timeout(15 * 60_000) });
      if (!res.ok) throw new Error(`download do modelo ${key} falhou (HTTP ${res.status})`);
      const tmp = `${file}.part`;
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      fs.renameSync(tmp, file);
    })().finally(() => downloading.delete(key)));
  }
  await downloading.get(key);
  return file;
}

let queue = Promise.resolve();

/** Roda um script de modelo (processo Node separado), um de cada vez. */
export function runModelWorker(script, args, { timeout = 180_000 } = {}) {
  const job = queue.then(() => new Promise((resolve, reject) => {
    execFile(process.execPath, [script, ...args], { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const lines = String(stderr || err.message).trim().split('\n');
        reject(new Error(lines.find((l) => /Error/.test(l)) || lines.pop()));
      }
      else resolve(stdout);
    });
  }));
  queue = job.catch(() => {});
  return job;
}
