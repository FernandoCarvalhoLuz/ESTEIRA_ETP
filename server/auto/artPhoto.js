// Foto das artes: enquadramento "estúdio" (layout Vitrine: carro na faixa do layout, parede refeita a partir do
// recorte) e cenário ampliado com IA (layout Rodapé/Auto Prime: a foto original fica intacta e o LaMa estende teto,
// paredes e piso até o formato, como no documento de padrão do cliente).
import crypto from 'node:crypto';
import { inpaint, outpaint } from './outpaint.js';

async function avgColor(sharp, buf, region) {
  const { data } = await sharp(buf).extract(region).resize(1, 1, { kernel: 'cubic' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

/**
 * Enquadra a foto no formato: escala para o carro ocupar fmt.car (sem deixar faixa vazia nas laterais),
 * troca a parede acima do teto do carro por um fundo liso (some a placa da loja atrás do texto) e estende o piso.
 * photoCar = faixa vertical do carro na foto original (fração da altura), padrão de fotos de estúdio.
 */
export async function composePhoto(sharp, photo, fmt, photoCar = { top: 0.22, bottom: 0.93 }, mask = null) {
  if (mask) return withFloorFade(sharp, fmt, await composeMasked(sharp, photo, fmt, mask));
  const meta = await sharp(photo).metadata();
  const w0 = meta.width;
  const h0 = meta.height;
  const carH = fmt.car.bottom - fmt.car.top;
  let s = carH / ((photoCar.bottom - photoCar.top) * h0);
  if (w0 * s < fmt.w) s = fmt.w / w0;
  const pw = Math.round(w0 * s);
  const ph = Math.round(h0 * s);
  const left = Math.round((fmt.w - pw) / 2);
  const roof = fmt.car.top;
  const top = Math.round(roof - photoCar.top * ph);
  const scaled = await sharp(photo).rotate().resize(pw, ph).toBuffer();

  // Cores da parede: topo da foto e logo acima do teto do carro.
  const band = (y0, y1) => ({ left: 0, top: Math.max(0, Math.round(y0 * ph)), width: pw, height: Math.max(2, Math.round((y1 - y0) * ph)) });
  const wallTop = await avgColor(sharp, scaled, band(0, 0.04));
  const wallLow = await avgColor(sharp, scaled, band(Math.max(0, photoCar.top - 0.05), Math.max(0.02, photoCar.top - 0.01)));
  const floor = await avgColor(sharp, scaled, band(0.95, 1));
  const rgb = (c) => `rgb(${c.join(',')})`;
  const bg = Buffer.from(`<svg width="${fmt.w}" height="${fmt.h}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${rgb(wallTop.map((x) => Math.round(x * 0.9)))}"/>
<stop offset="${(roof / fmt.h).toFixed(3)}" stop-color="${rgb(wallLow)}"/>
<stop offset="${Math.min(1, (top + ph) / fmt.h).toFixed(3)}" stop-color="${rgb(floor)}"/>
<stop offset="1" stop-color="${rgb(floor.map((x) => Math.round(x * 0.8)))}"/>
</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);

  // Parede de fundo: a faixa de parede da própria foto (acima do teto) esticada até o topo e bem desfocada —
  // mantém a luz e a cor reais do estúdio e transforma a placa da loja num brilho suave atrás do texto.
  const wallBand = band(0, Math.max(0.06, photoCar.top - 0.02));
  const wallH = Math.max(1, roof + 40);
  const wall = await sharp(scaled).extract(wallBand)
    .resize(fmt.w, wallH, { fit: 'fill' })
    .blur(Math.max(20, Math.round(fmt.w / 28)))
    .modulate({ saturation: 0.85 })
    .png().toBuffer();

  // Máscara: a foto aparece pouco acima do teto do carro (a placa fica escondida) e some no piso.
  const fadeTop = Math.max(0, roof - top - 45);
  const fadeEnd = Math.max(fadeTop + 1, roof - top - 4);
  const fadeMask = Buffer.from(`<svg width="${pw}" height="${ph}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="${ph}" gradientUnits="userSpaceOnUse">
<stop offset="${(fadeTop / ph).toFixed(4)}" stop-color="#fff" stop-opacity="0"/>
<stop offset="${(fadeEnd / ph).toFixed(4)}" stop-color="#fff" stop-opacity="1"/>
<stop offset="0.97" stop-color="#fff" stop-opacity="1"/>
<stop offset="1" stop-color="#fff" stop-opacity="0"/>
</linearGradient></defs><rect width="${pw}" height="${ph}" fill="url(#m)"/></svg>`);
  const masked = await sharp(scaled).ensureAlpha().composite([{ input: await sharp(fadeMask).png().toBuffer(), blend: 'dest-in' }]).png().toBuffer();

  // Recorta o que passar do quadro (a foto pode ser mais larga/alta que o formato).
  const cropL = Math.max(0, -left);
  const cropT = Math.max(0, -top);
  const visW = Math.min(pw - cropL, fmt.w - Math.max(0, left));
  const visH = Math.min(ph - cropT, fmt.h - Math.max(0, top));
  const piece = await sharp(masked).extract({ left: cropL, top: cropT, width: visW, height: visH }).toBuffer();
  const layers = [
    { input: await sharp(wall).extract({ left: 0, top: 0, width: fmt.w, height: Math.min(wallH, fmt.h) }).toBuffer(), left: 0, top: 0 },
    { input: piece, left: Math.max(0, left), top: Math.max(0, top) },
  ];
  return withFloorFade(sharp, fmt, await sharp(await sharp(bg).png().toBuffer()).composite(layers).png().toBuffer());
}

/** Stories: o piso escurece até o preto embaixo (como nas artes do cliente). */
async function withFloorFade(sharp, fmt, base) {
  if (!fmt.floorFade) return base;
  const fade = Buffer.from(`<svg width="${fmt.w}" height="${fmt.h}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="${fmt.h}" gradientUnits="userSpaceOnUse">
<stop offset="${(fmt.floorFade.from / fmt.h).toFixed(3)}" stop-color="#000" stop-opacity="0"/>
<stop offset="${(fmt.floorFade.to / fmt.h).toFixed(3)}" stop-color="#000" stop-opacity="1"/>
</linearGradient></defs><rect width="100%" height="100%" fill="url(#f)"/></svg>`);
  return sharp(base).composite([{ input: fade }]).png().toBuffer();
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Preenchimento suave (push-pull): espalha as cores conhecidas para as áreas vazias, de pirâmide em pirâmide.
 * col = cores (3 canais, float), wt = peso 0..1 por célula. Devolve as cores preenchidas.
 */
function pushPull(col, wt, w, h) {
  if (w <= 1 && h <= 1) return col;
  const nw = Math.ceil(w / 2);
  const nh = Math.ceil(h / 2);
  const ccol = new Float32Array(nw * nh * 3);
  const cwt = new Float32Array(nw * nh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const j = (y >> 1) * nw + (x >> 1);
      cwt[j] += wt[i];
      for (let c = 0; c < 3; c++) ccol[j * 3 + c] += col[i * 3 + c] * wt[i];
    }
  }
  for (let j = 0; j < nw * nh; j++) {
    if (cwt[j] > 0) for (let c = 0; c < 3; c++) ccol[j * 3 + c] /= cwt[j];
    cwt[j] = Math.min(1, cwt[j]);
  }
  const coarse = pushPull(ccol, cwt, nw, nh);
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(nh - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(nh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(nw - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(nw - 1, x0 + 1);
      const tx = fx - x0;
      const i = y * w + x;
      for (let c = 0; c < 3; c++) {
        const v = (coarse[(y0 * nw + x0) * 3 + c] * (1 - tx) + coarse[(y0 * nw + x1) * 3 + c] * tx) * (1 - ty)
          + (coarse[(y1 * nw + x0) * 3 + c] * (1 - tx) + coarse[(y1 * nw + x1) * 3 + c] * tx) * ty;
        out[i * 3 + c] = col[i * 3 + c] * wt[i] + v * (1 - wt[i]);
      }
    }
  }
  return out;
}

/**
 * Enquadramento com o carro recortado (mask de carMask.js):
 * - o carro é medido de verdade: fica centralizado, com a altura da faixa fmt.car e sem passar da largura;
 * - do meio do carro para baixo a foto fica intacta (piso, reflexo e sombra reais);
 * - acima disso só o carro continua da foto; a parede (com o letreiro da loja) é refeita a partir das cores
 *   da própria parede perto do carro, com a luz caindo para o topo e grão de foto — sem borrão nem emenda.
 */
async function composeMasked(sharp, photo, fmt, m) {
  const W = fmt.w;
  const H = fmt.h;
  const { box } = m;
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  let s = Math.min((fmt.car.bottom - fmt.car.top) / bh, (W * 0.92) / bw);
  if (m.width * s < W) s = W / m.width;
  const pw = Math.round(m.width * s);
  const ph = Math.round(m.height * s);
  const top = Math.round(fmt.car.bottom - (box.y1 + 1) * s);
  const left = Math.min(0, Math.max(W - pw, Math.round(W / 2 - ((box.x0 + box.x1 + 1) / 2) * s)));
  const P = await sharp(photo).rotate().resize(pw, ph, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const A = await sharp(m.data, { raw: { width: m.width, height: m.height, channels: 1 } }).resize(pw, ph, { fit: 'fill' }).extractChannel(0).raw().toBuffer();

  const carTop = top + box.y0 * s;
  const carH = bh * s;
  const keep = carTop + carH * 0.55; // abaixo daqui a foto fica como está
  const band = carH * 0.3; // transição da parede refeita para a original

  // Cores conhecidas da parede/piso (fora do carro, abaixo de `keep`) numa grade reduzida.
  const F = 6;
  const gw = Math.ceil(W / F);
  const gh = Math.ceil(H / F);
  const col = new Float32Array(gw * gh * 3);
  const wt = new Float32Array(gw * gh);
  const yStart = Math.max(0, Math.ceil(keep - band * 0.5));
  for (let y = yStart; y < Math.min(H, top + ph - 2); y++) {
    const py = y - top;
    if (py < 0) continue;
    for (let x = 0; x < W; x++) {
      const px = x - left;
      if (px < 0 || px >= pw) continue;
      const k = py * pw + px;
      if (A[k] > 12) continue;
      const g = Math.floor(y / F) * gw + Math.floor(x / F);
      wt[g] += 1;
      for (let c = 0; c < 3; c++) col[g * 3 + c] += P[k * 3 + c];
    }
  }
  for (let g = 0; g < gw * gh; g++) {
    if (wt[g] > 0) for (let c = 0; c < 3; c++) col[g * 3 + c] /= wt[g];
    wt[g] = Math.min(1, wt[g] / (F * F));
  }
  const filled = pushPull(col, wt, gw, gh);
  const small = Buffer.alloc(gw * gh * 3);
  for (let i = 0; i < small.length; i++) small[i] = Math.max(0, Math.min(255, Math.round(filled[i])));
  const wall = await sharp(small, { raw: { width: gw, height: gh, channels: 3 } })
    .resize(W, H, { fit: 'fill', kernel: 'cubic' }).blur(F * 2).raw().toBuffer();

  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const py = y - top;
    const wy = smooth(keep - band, keep, y); // 0 = parede refeita, 1 = foto original
    const light = 0.84 + 0.16 * smooth(0, keep, y); // a luz cai para o topo, como num estúdio
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dx = (x - W / 2) / (W / 2);
      const shade = light * (1 - 0.07 * dx * dx);
      const px = x - left;
      const inside = py >= 0 && py < ph && px >= 0 && px < pw;
      const k = inside ? py * pw + px : 0;
      const a = inside ? smooth(0.12, 0.85, A[k] / 255) : 0;
      const keepW = inside ? wy : 0;
      const g = (1 - keepW) * (1 - a);
      const noise = g > 0 ? (Math.random() + Math.random() + Math.random() - 1.5) * 4 : 0;
      for (let c = 0; c < 3; c++) {
        const f = wall[i * 3 + c] * (g > 0 ? 1 - (1 - shade) * (1 - keepW) : 1);
        let v = f;
        if (inside) {
          const p = P[k * 3 + c];
          v = f + (p - f) * keepW;
          v += (p - v) * a;
        }
        out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(v + noise * g)));
      }
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}


// ---------------------------------------------------------------- Cenário ampliado (outpainting)

/**
 * Posição da foto na tela do formato (fmt.photo = { x, y, width, baseMax }). Com o recorte do carro, a foto sobe
 * até a base do carro (para-choque/pneus) ficar em baseMax — o carro nunca fica atrás do bloco de texto.
 */
export function outpaintPlacement(fmt, mask) {
  const p = fmt.photo;
  let y = p.y;
  if (mask?.box && p.baseMax) {
    const base = (mask.box.y1 + 1) * (p.width / mask.width);
    y = Math.min(y, Math.round(p.baseMax - base));
  }
  return { W: fmt.w, H: fmt.h, x: p.x, y, w: p.width };
}

/** Sem a IA (modelo indisponível): cola a foto e preenche o resto com as cores das bordas, suave e com grão. */
async function plainExtend(sharp, photo, job) {
  const { W, H, x, y, w } = job;
  const meta = await sharp(photo).rotate().toBuffer({ resolveWithObject: true }).then((r) => r.info);
  const ph = Math.round((meta.height * w) / meta.width);
  const P = await sharp(photo).rotate().resize(w, ph).removeAlpha().raw().toBuffer();
  const F = 6;
  const gw = Math.ceil(W / F);
  const gh = Math.ceil(H / F);
  const col = new Float32Array(gw * gh * 3);
  const wt = new Float32Array(gw * gh);
  const canvas = Buffer.alloc(W * H * 3);
  const inside = new Uint8Array(W * H);
  for (let yy = Math.max(0, y); yy < Math.min(H, y + ph); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
      const k = ((yy - y) * w + (xx - x)) * 3;
      const i = yy * W + xx;
      inside[i] = 1;
      const g = Math.floor(yy / F) * gw + Math.floor(xx / F);
      wt[g] += 1;
      for (let c = 0; c < 3; c++) { canvas[i * 3 + c] = P[k + c]; col[g * 3 + c] += P[k + c]; }
    }
  }
  for (let g = 0; g < gw * gh; g++) {
    if (wt[g] > 0) for (let c = 0; c < 3; c++) col[g * 3 + c] /= wt[g];
    wt[g] = Math.min(1, wt[g] / (F * F));
  }
  const filled = pushPull(col, wt, gw, gh);
  const small = Buffer.alloc(gw * gh * 3);
  for (let i = 0; i < small.length; i++) small[i] = Math.max(0, Math.min(255, Math.round(filled[i])));
  const fill = await sharp(small, { raw: { width: gw, height: gh, channels: 3 } }).resize(W, H, { fit: 'fill', kernel: 'cubic' }).blur(F * 2).raw().toBuffer();
  for (let i = 0; i < W * H; i++) {
    if (inside[i]) continue;
    const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 4;
    for (let c = 0; c < 3; c++) canvas[i * 3 + c] = Math.max(0, Math.min(255, Math.round(fill[i * 3 + c] + noise)));
  }
  return sharp(canvas, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

/**
 * Fundos de vários formatos de uma vez (o modelo carrega uma vez só). Devolve { backgrounds, ai } — ai = false
 * quando a IA falhou e o fundo saiu pelo preenchimento simples.
 */
export async function outpaintBackgrounds(sharp, photo, jobs) {
  try {
    return { backgrounds: await outpaint(photo, jobs), ai: true };
  } catch (err) {
    console.warn(`[arte] ampliação do cenário com IA indisponível: ${err.message}`);
    const backgrounds = [];
    for (const job of jobs) backgrounds.push(await plainExtend(sharp, photo, job));
    return { backgrounds, ai: false };
  }
}

// ---------------------------------------------------------------- Estúdio com a parede refeita pela IA

/**
 * Layout Vitrine com o recorte do carro: mesmo enquadramento do composeMasked, mas a parede acima do meio do carro
 * (onde fica o letreiro da loja, atrás do texto) e o que falta da tela são refeitos pelo LaMa, com textura de parede
 * de verdade. O carro e o piso continuam da foto. Todos os formatos numa chamada só; se a IA falhar, cada formato
 * cai no preenchimento liso (composePhoto).
 */
export async function studioBackgrounds(sharp, photo, fmts, m) {
  const hash = crypto.createHash('sha1').update(photo).digest('hex');
  const preps = [];
  for (const fmt of fmts) {
    const W = fmt.w;
    const H = fmt.h;
    const { box } = m;
    const bw = box.x1 - box.x0 + 1;
    const bh = box.y1 - box.y0 + 1;
    let s = Math.min((fmt.car.bottom - fmt.car.top) / bh, (W * 0.92) / bw);
    if (m.width * s < W) s = W / m.width;
    const pw = Math.round(m.width * s);
    const ph = Math.round(m.height * s);
    const top = Math.round(fmt.car.bottom - (box.y1 + 1) * s);
    const left = Math.min(0, Math.max(W - pw, Math.round(W / 2 - ((box.x0 + box.x1 + 1) / 2) * s)));
    const P = await sharp(photo).rotate().resize(pw, ph, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const A = await sharp(m.data, { raw: { width: m.width, height: m.height, channels: 1 } }).resize(pw, ph, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
    const keepLine = top + box.y0 * s + bh * s * 0.45; // abaixo disto a foto fica como está (piso, reflexo, sombra)
    const canvas = Buffer.alloc(W * H * 3, 128);
    const fill = Buffer.alloc(W * H, 255);
    const alpha = Buffer.alloc(W * H, 0);
    const below = Buffer.alloc(W * H, 0); // foto abaixo da linha: fica como está
    for (let y = 0; y < H; y++) {
      const py = y - top;
      if (py < 0 || py >= ph) continue;
      for (let x = 0; x < W; x++) {
        const px = x - left;
        if (px < 0 || px >= pw) continue;
        const k = py * pw + px;
        const i = y * W + x;
        for (let c = 0; c < 3; c++) canvas[i * 3 + c] = P[k * 3 + c];
        alpha[i] = A[k];
        if (y >= keepLine) { fill[i] = 0; below[i] = 255; }
      }
    }
    // O carro (com folga) também entra na área refeita: a IA desenha a parede inteira por trás dele só a partir do
    // fundo, sem copiar o teto, a antena ou o brilho do letreiro colado no contorno; o carro volta por cima depois.
    const halo = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(5).extractChannel(0).raw().toBuffer();
    for (let i = 0; i < W * H; i++) if (halo[i] > 12 || alpha[i] > 12) fill[i] = 255;
    preps.push({
      fmt, canvas, alpha, below,
      job: {
        W, H, key: `${hash}-studio2-${W}x${H}-${fmt.car.top}-${fmt.car.bottom}`,
        canvas: await sharp(canvas, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(),
        mask: await sharp(fill, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer(),
      },
    });
  }
  let filled;
  try {
    filled = await inpaint(preps.map((p) => p.job));
  } catch (err) {
    console.warn(`[arte] parede refeita pela IA indisponível, usando o preenchimento liso: ${err.message}`);
    const out = [];
    for (const p of preps) out.push(await composePhoto(sharp, photo, p.fmt, undefined, m));
    return { backgrounds: out, ai: false };
  }
  const backgrounds = [];
  for (const [n, p] of preps.entries()) {
    const { W, H } = p.job;
    const ai = await sharp(filled[n]).removeAlpha().raw().toBuffer();
    const keep = await sharp(p.below, { raw: { width: W, height: H, channels: 1 } }).blur(6).extractChannel(0).raw().toBuffer();
    const out = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      const car = Math.min(1, Math.max(0, (p.alpha[i] - 60) / 140)); // borda do recorte sem o halo do fundo antigo
      const a = Math.max(keep[i] / 255, car);
      for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(ai[i * 3 + c] * (1 - a) + p.canvas[i * 3 + c] * a);
    }
    backgrounds.push(await withFloorFade(sharp, p.fmt, await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()));
  }
  return { backgrounds, ai: true };
}
