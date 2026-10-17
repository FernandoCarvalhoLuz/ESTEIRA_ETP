// Processo separado que recorta o carro da foto (modelo ISNet, ONNX, roda na CPU).
// Fica fora do servidor porque a inferência trava a thread por alguns segundos e usa ~700 MB, que voltam
// ao sistema quando o processo termina. Uso: node carMaskWorker.js <foto> <saída.png> <modelo.onnx>
import fs from 'node:fs';
import ort from 'onnxruntime-node';
import sharp from 'sharp';

const S = 1024;
const [photoPath, outPath, modelPath] = process.argv.slice(2);

const session = await ort.InferenceSession.create(modelPath, {
  intraOpNumThreads: 2,
  enableCpuMemArena: false,
  enableMemPattern: false,
});
const { data } = await sharp(fs.readFileSync(photoPath)).rotate().resize(S, S, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const input = new Float32Array(3 * S * S);
for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) input[c * S * S + i] = data[i * 3 + c] / 255 - 0.5;
const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, S, S]) });
const raw = out[session.outputNames[0]].data;

let mn = Infinity;
let mx = -Infinity;
for (let i = 0; i < S * S; i++) { if (raw[i] < mn) mn = raw[i]; if (raw[i] > mx) mx = raw[i]; }
const soft = new Uint8Array(S * S);
for (let i = 0; i < S * S; i++) soft[i] = Math.round((255 * (raw[i] - mn)) / (mx - mn || 1));

// Limpeza: o modelo às vezes pega o letreiro da loja (ligado ao teto por uma ponte fina) e deixa furos no capô.
// 1) abertura (erode + dilata) quebra as pontes finas; 2) fica só o maior pedaço (o carro);
// 3) furos internos viram carro; 4) a borda suave do modelo é mantida só perto do carro.
const bin = new Uint8Array(S * S);
for (let i = 0; i < S * S; i++) bin[i] = soft[i] >= 128 ? 1 : 0;

function morph(src, r, erode) {
  // Separável (linhas e depois colunas) com janela quadrada de raio r.
  const tmp = new Uint8Array(S * S);
  const dst = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = erode ? 1 : 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        const p = xx < 0 || xx >= S ? (erode ? 0 : 0) : src[y * S + xx];
        if (erode ? !p : p) { v = erode ? 0 : 1; break; }
      }
      tmp[y * S + x] = v;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = erode ? 1 : 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        const p = yy < 0 || yy >= S ? 0 : tmp[yy * S + x];
        if (erode ? !p : p) { v = erode ? 0 : 1; break; }
      }
      dst[y * S + x] = v;
    }
  }
  return dst;
}

const opened = morph(morph(bin, 7, true), 7, false);
const label = new Int32Array(S * S);
let best = 0;
let bestSize = 0;
let next = 0;
const stack = new Int32Array(S * S);
for (let i = 0; i < S * S; i++) {
  if (!opened[i] || label[i]) continue;
  next += 1;
  let top = 0;
  let size = 0;
  stack[top++] = i;
  label[i] = next;
  while (top) {
    const p = stack[--top];
    size += 1;
    const x = p % S;
    const y = (p - x) / S;
    const nb = [x > 0 ? p - 1 : -1, x < S - 1 ? p + 1 : -1, y > 0 ? p - S : -1, y < S - 1 ? p + S : -1];
    for (const q of nb) if (q >= 0 && opened[q] && !label[q]) { label[q] = next; stack[top++] = q; }
  }
  if (size > bestSize) { bestSize = size; best = next; }
}
// Carro = maior pedaço, devolvido ao contorno original (dilata e cruza com a máscara binária).
let car = new Uint8Array(S * S);
for (let i = 0; i < S * S; i++) car[i] = label[i] === best ? 1 : 0;
const grown = morph(car, 9, false);
for (let i = 0; i < S * S; i++) car[i] = grown[i] && bin[i] ? 1 : 0;

// Furos: o que não é carro e não alcança a borda da imagem.
const outside = new Uint8Array(S * S);
let top = 0;
for (let x = 0; x < S; x++) for (const p of [x, (S - 1) * S + x]) if (!car[p] && !outside[p]) { outside[p] = 1; stack[top++] = p; }
for (let y = 0; y < S; y++) for (const p of [y * S, y * S + S - 1]) if (!car[p] && !outside[p]) { outside[p] = 1; stack[top++] = p; }
while (top) {
  const p = stack[--top];
  const x = p % S;
  const y = (p - x) / S;
  const nb = [x > 0 ? p - 1 : -1, x < S - 1 ? p + 1 : -1, y > 0 ? p - S : -1, y < S - 1 ? p + S : -1];
  for (const q of nb) if (q >= 0 && !car[q] && !outside[q]) { outside[q] = 1; stack[top++] = q; }
}
const near = morph(car, 3, false);
const mask = Buffer.alloc(S * S);
for (let i = 0; i < S * S; i++) {
  if (!outside[i] && !car[i]) mask[i] = 255; // furo
  else if (car[i]) mask[i] = soft[i];
  else if (near[i]) mask[i] = soft[i];
  else mask[i] = 0;
}
// Letreiro encostado no teto (picape alta): vira um "platô" estreito acima do carro. Num carro, a largura
// salta de 0 para ~40% em 2–3% da altura (o teto); se demora mais de 6%, o que está acima é o letreiro.
const rows = new Int32Array(S);
let y0 = -1;
let y1 = -1;
let widest = 0;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) if (mask[y * S + x] >= 128) rows[y] += 1;
  if (rows[y]) { if (y0 < 0) y0 = y; y1 = y; }
  widest = Math.max(widest, rows[y]);
}
if (y0 >= 0) {
  const h = y1 - y0 + 1;
  let roof = y0;
  while (roof < y1 && rows[roof] < widest * 0.3) roof += 1;
  if (roof - y0 > h * 0.06) {
    // Colunas do letreiro = as que têm máscara bem acima do teto. Embaixo dele a linha do teto é refeita
    // ligando a borda do teto logo à esquerda e à direita do letreiro; tudo acima dessa linha sai.
    const high = Math.round(roof - h * 0.02);
    let xl = S;
    let xr = -1;
    for (let x = 0; x < S; x++) {
      for (let y = y0; y < high; y++) if (mask[y * S + x] >= 128) { xl = Math.min(xl, x); xr = Math.max(xr, x); break; }
    }
    const topOf = (x) => {
      for (let y = 0; y < S; y++) if (mask[y * S + x] >= 128) return y;
      return roof;
    };
    if (xr >= xl) {
      const pad = Math.round(S * 0.006);
      const a = Math.max(0, xl - pad);
      const b = Math.min(S - 1, xr + pad);
      const clampRoof = (t) => Math.min(roof + h * 0.04, Math.max(roof - h * 0.01, t));
      const ta = clampRoof(xl - pad > 0 ? topOf(Math.max(0, xl - pad * 2)) : roof);
      const tb = clampRoof(xr + pad < S - 1 ? topOf(Math.min(S - 1, xr + pad * 2)) : roof);
      for (let x = a; x <= b; x++) {
        const line = Math.round(ta + ((tb - ta) * (x - a)) / Math.max(1, b - a)) + 1;
        for (let y = 0; y < line; y++) mask[y * S + x] = 0;
      }
    }
  }
}
await sharp(mask, { raw: { width: S, height: S, channels: 1 } }).png().toFile(outPath);
