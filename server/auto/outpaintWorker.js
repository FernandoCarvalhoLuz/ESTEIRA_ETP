// Processo separado que amplia o cenário da foto com o LaMa (ONNX 512×512), como no Canva "expandir":
// teto, paredes e piso continuam naturalmente até o formato da arte, sem esticar nem distorcer o carro.
// Uso: node outpaintWorker.js <tarefa.json> <modelo.onnx>
// tarefa = { photo: caminho, jobs: [{ W, H, x, y, w, out }] } — foto com largura w colada em (x, y) numa tela W×H.
import fs from 'node:fs';
import ort from 'onnxruntime-node';
import sharp from 'sharp';

const S = 512; // entrada fixa do modelo
const OVERLAP_RAMP = 96; // linhas de transição entre janelas
const [taskPath, modelPath] = process.argv.slice(2);
const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));

const session = await ort.InferenceSession.create(modelPath, {
  intraOpNumThreads: 2,
  enableCpuMemArena: false,
  enableMemPattern: false,
});

async function lama(rgb, mask) {
  const img = new Float32Array(3 * S * S);
  const m = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    for (let c = 0; c < 3; c++) img[c * S * S + i] = rgb[i * 3 + c] / 255;
    m[i] = mask[i] > 127 ? 1 : 0;
  }
  const r = await session.run({ image: new ort.Tensor('float32', img, [1, 3, S, S]), mask: new ort.Tensor('float32', m, [1, 1, S, S]) });
  const o = r[session.outputNames[0]].data;
  const res = Buffer.alloc(S * S * 3);
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) res[i * 3 + c] = Math.max(0, Math.min(255, Math.round(o[c * S * S + i])));
  return res;
}

/** Retângulo da foto na tela com recuo `pad` nos lados que não encostam na borda da tela. */
function inset(rect, W, H, pad) {
  return {
    x0: rect.x + (rect.x > 0 ? pad : 0),
    y0: rect.y + (rect.y > 0 ? pad : 0),
    x1: rect.x + rect.w - (rect.x + rect.w < W ? pad : 0),
    y1: rect.y + rect.h - (rect.y + rect.h < H ? pad : 0),
  };
}

/** Janelas de 512 linhas que cobrem as linhas a preencher, com contexto e sobreposição. */
function windows(smask, sh) {
  let r0 = -1;
  let r1 = -1;
  for (let y = 0; y < sh; y++) {
    let any = false;
    for (let x = 0; x < S; x++) if (smask[y * S + x] > 127) { any = true; break; }
    if (any) { if (r0 < 0) r0 = y; r1 = y; }
  }
  if (r0 < 0) return [];
  if (sh <= S) return [0];
  const first = Math.max(0, Math.min(r0, sh - S));
  const last = Math.max(0, Math.min(r1 + 1 - S, sh - S));
  if (last <= first) return [Math.max(0, Math.min(r1 + 1 - S, sh - S, r0))].map((v) => Math.max(0, v));
  const n = Math.ceil((last - first) / (S - OVERLAP_RAMP * 2)) + 1;
  return Array.from({ length: n }, (_, i) => Math.round(first + ((last - first) * i) / (n - 1)));
}

/** LaMa em ~metade da resolução (largura 512), em janelas de 512 linhas misturadas nas sobreposições. */
async function fillWithLama(canvas, mask, W, H) {
  const sh = Math.round((H * S) / W);
  const small = await sharp(canvas, { raw: { width: W, height: H, channels: 3 } }).resize(S, sh, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  const smask = await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).resize(S, sh, { kernel: 'nearest', fit: 'fill' }).extractChannel(0).raw().toBuffer();
  const acc = new Float32Array(S * sh * 3);
  const wsum = new Float32Array(S * sh);
  const starts = windows(smask, sh);
  for (const y0 of starts) {
    const rows = Math.min(S, sh - y0);
    const win = Buffer.alloc(S * S * 3, 128);
    const wm = Buffer.alloc(S * S, 255);
    small.copy(win, 0, y0 * S * 3, (y0 + rows) * S * 3);
    smask.copy(wm, 0, y0 * S, (y0 + rows) * S);
    const res = await lama(win, wm);
    for (let yy = 0; yy < rows; yy++) {
      const top = y0 === 0 ? 1 : Math.min(1, (yy + 1) / OVERLAP_RAMP);
      const bot = y0 + rows >= sh ? 1 : Math.min(1, (rows - yy) / OVERLAP_RAMP);
      const wt = Math.max(1e-3, Math.min(top, bot));
      for (let xx = 0; xx < S; xx++) {
        const i = (y0 + yy) * S + xx;
        wsum[i] += wt;
        for (let c = 0; c < 3; c++) acc[i * 3 + c] += res[(yy * S + xx) * 3 + c] * wt;
      }
    }
  }
  const merged = Buffer.alloc(S * sh * 3);
  for (let i = 0; i < S * sh; i++) for (let c = 0; c < 3; c++) merged[i * 3 + c] = wsum[i] ? Math.round(acc[i * 3 + c] / wsum[i]) : small[i * 3 + c];
  const ai = await sharp(merged, { raw: { width: S, height: sh, channels: 3 } }).resize(W, H, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().raw().toBuffer();

  return { ai, windows: starts.length };
}

async function outpaint({ W, H, x, y, w }, photo) {
  const meta = await sharp(photo).rotate().metadata().then(async (m) => (m.orientation >= 5 ? { width: m.height, height: m.width } : m));
  const ph = Math.round((meta.height * w) / meta.width);
  const pic = await sharp(photo).rotate().resize(w, ph, { kernel: 'lanczos3' }).removeAlpha().toBuffer();

  // 1) Tela cinza com a foto na posição pedida (o que passa da tela é cortado).
  const vis = { left: Math.max(0, -x), top: Math.max(0, -y) };
  const rect = { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(w - vis.left, W - Math.max(0, x)), h: Math.min(ph - vis.top, H - Math.max(0, y)) };
  const piece = await sharp(pic).extract({ left: vis.left, top: vis.top, width: rect.w, height: rect.h }).toBuffer();
  const canvas = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .composite([{ input: piece, left: rect.x, top: rect.y }]).removeAlpha().raw().toBuffer();

  // 2) Máscara do LaMa: tudo a preencher, menos a foto com 4 px de recuo.
  const hole = inset(rect, W, H, 4);
  const mask = Buffer.alloc(W * H, 255);
  for (let yy = hole.y0; yy < hole.y1; yy++) mask.fill(0, yy * W + hole.x0, yy * W + hole.x1);

  // 3) LaMa preenche o que falta.
  const { ai, windows: count } = await fillWithLama(canvas, mask, W, H);

  // 4) A foto original volta por cima, com borda suave (recuo de 19 px e desfoque 9,5): carro e foto saem nítidos,
  //    só as áreas novas vêm da IA.
  const keep = inset(rect, W, H, 19);
  const km = Buffer.alloc(W * H, 0);
  for (let yy = keep.y0; yy < keep.y1; yy++) km.fill(255, yy * W + keep.x0, yy * W + keep.x1);
  const soft = await sharp(km, { raw: { width: W, height: H, channels: 1 } }).blur(9.5).extractChannel(0).raw().toBuffer();
  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const a = soft[i] / 255;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(ai[i * 3 + c] * (1 - a) + canvas[i * 3 + c] * a);
  }
  return { png: await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), windows: count };
}

// Tarefa "inpaint": tela e máscara prontas (PNG W×H; máscara branca = refazer). Devolve só o preenchimento da IA;
// quem chamou recompõe a foto por cima (ex.: parede do layout Vitrine, refeita sem o letreiro).
async function inpaint({ W, H, canvas, mask }) {
  const C = await sharp(canvas).removeAlpha().raw().toBuffer();
  const M = await sharp(mask).extractChannel(0).raw().toBuffer();
  const { ai, windows: count } = await fillWithLama(C, M, W, H);
  return { png: await sharp(ai, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), windows: count };
}

const photo = task.photo ? fs.readFileSync(task.photo) : null;
for (const job of task.jobs) {
  const r = job.kind === 'inpaint' ? await inpaint(job) : await outpaint(job, photo);
  fs.writeFileSync(job.out, r.png);
  process.stdout.write(`${job.out} ${r.windows}\n`);
}
