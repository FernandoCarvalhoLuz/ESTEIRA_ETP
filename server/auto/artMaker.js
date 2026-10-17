// Arte nova do carro (quando não há arte pronta): escolhe o motor configurado no cliente.
// - 'etp'   → gerador próprio (artRender.js): layout medido nas artes do cliente, fotos do Drive, feed + stories.
// - 'canva' → preenchimento automático do modelo do Canva (canvaArt.js).
// As fotos vêm sempre da pasta do carro no Drive, nunca do site.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { downloadFile } from './drive.js';
import { LAYOUTS, renderArts } from './artRender.js';
import { createCanvaArt } from './canvaArt.js';
import { carMask, isFullCar } from './carMask.js';
import { canvaPublic } from './canvaConnect.js';
import { cleanFolderName } from './driveStock.js';
import { llmEnabled, llmSettings, pickCoverPhoto } from './llm.js';
import { contactSheet } from './photoPick.js';

const LOGO_DIR = path.join(config.dataDir, 'auto-logos');
const HEX = /^#[0-9a-f]{6}$/i;

export const ART_LAYOUTS = Object.entries(LAYOUTS).map(([key, l]) => ({ key, label: l.label, colors: l.colors, fields: l.fields }));

/** Estilo de estúdio das fotos do cliente, para a escolha da capa sem IA (photoPick.js). */
export const photoStyle = (client) => LAYOUTS[client?.art?.layout]?.photoStyle || 'studio';

const logoFile = (accountId) => path.join(LOGO_DIR, `${accountId}.png`);

export function hasLogo(accountId) {
  return fs.existsSync(logoFile(accountId));
}

export function readLogo(accountId) {
  return hasLogo(accountId) ? fs.readFileSync(logoFile(accountId)) : null;
}

/** Guarda o logo do cliente (PNG com fundo transparente; outros formatos são convertidos). */
export async function saveLogo(accountId, buffer) {
  const { default: sharp } = await import('sharp');
  const png = await sharp(buffer).trim().resize({ width: 900, withoutEnlargement: true }).png().toBuffer();
  fs.mkdirSync(LOGO_DIR, { recursive: true });
  fs.writeFileSync(logoFile(accountId), png);
}

export function removeLogo(accountId) {
  if (hasLogo(accountId)) fs.unlinkSync(logoFile(accountId));
}

/** Normaliza o que vem da tela: motor, layout e cores. */
export function cleanArt(input, prev = {}) {
  const art = { ...prev };
  if (input.engine !== undefined) art.engine = ['etp', 'canva'].includes(input.engine) ? input.engine : 'etp';
  if (input.layout !== undefined) art.layout = LAYOUTS[input.layout] ? input.layout : 'vitrine';
  if (input.colors) {
    art.colors = { ...art.colors };
    for (const k of ['text', 'bar', 'barText']) if (input.colors[k] !== undefined) art.colors[k] = HEX.test(input.colors[k]) ? input.colors[k] : undefined;
  }
  return art;
}

/** Motor efetivo do cliente: o configurado, ou o que estiver disponível (Canva só com modelo e permissão). */
export function artEngine(client) {
  const canvaReady = Boolean(canvaPublic().canCreate && client?.canva?.templateId);
  const wanted = client?.art?.engine;
  if (wanted === 'canva') return canvaReady ? 'canva' : null;
  if (wanted === 'etp') return 'etp';
  return canvaReady ? 'canva' : null;
}

/**
 * Foto de capa, em camadas (como no padrão do cliente):
 * 1. a escolhida na revisão (preferId) — vale mesmo que o recorte não ache o carro inteiro;
 * 2. com o Claude configurado, a que ele escolhe na folha de contato numerada (3/4 de frente, carro inteiro,
 *    painel da loja ao fundo);
 * 3. a ordem das regras (rankPhotos), conferindo pelo recorte que o carro aparece inteiro.
 * Devolve { photo, buffer, mask, by } — mask = null quando o recorte não serve (enquadramento padrão).
 */
export async function pickCover(drivePhotos, { tries = 4, preferId = null } = {}) {
  let list = drivePhotos;
  let by = 'regras';
  if (preferId && list.some((p) => p.id === preferId)) {
    list = [...list.filter((p) => p.id === preferId), ...list.filter((p) => p.id !== preferId)];
    by = 'revisão';
  } else if (list.length > 1 && llmSettings().provider === 'claude' && llmEnabled()) {
    try {
      const cs = await contactSheet(list);
      const i = cs ? await pickCoverPhoto({ sheet: cs.sheet, count: cs.photos.length }) : null;
      if (i != null) {
        list = [cs.photos[i], ...list.filter((p) => p !== cs.photos[i])];
        by = 'claude';
      }
    } catch (err) {
      console.warn(`[arte] escolha da foto pelo Claude falhou, usando as regras: ${err.message}`);
    }
  }
  let first = null;
  for (const [k, photo] of list.slice(0, tries).entries()) {
    const buffer = await downloadFile(photo.id);
    const mask = await carMask(buffer);
    if (isFullCar(mask)) return { photo, buffer, mask, by: k === 0 ? by : 'regras' };
    if (k === 0 && by === 'revisão') return { photo, buffer, mask: null, by };
    first ||= { photo, buffer, mask: null, by };
    if (!mask) break; // recorte indisponível: não adianta baixar as outras
  }
  return first;
}

/** Nome do carro nos arquivos da arte: o da pasta do Drive (sem parênteses), como "[FEED] Argo Drive 2023.png". */
const artCarName = (vehicle, name) => cleanFolderName(vehicle.carName || vehicle.folderName || name || vehicle.title);

/**
 * Cria a arte do carro. Devolve { engine, images: [{ buffer, format, mime, fileName }], design? (Canva), photos }.
 * drivePhotos: fotos da pasta do carro no Drive ({ id, name }), já ordenadas pelas regras de capa.
 * overrides: textos ajustados na revisão (título, versão, detalhes, preço); photoId: foto escolhida na revisão.
 */
export async function makeArt({ client, vehicle, name, drivePhotos = [], overrides = {}, photoId = null }) {
  const engine = artEngine(client);
  if (!engine) throw Object.assign(new Error('Configure a arte do cliente em Fontes e padrões (gerador próprio ou modelo do Canva).'), { status: 400 });
  if (engine === 'canva') {
    const made = await createCanvaArt({ template: { id: client.canva.templateId, kind: client.canva.templateKind || 'design' }, vehicle, name, drivePhotos });
    return { engine, design: made.design, photos: made.photos, skipped: made.skipped };
  }
  if (!drivePhotos.length) throw Object.assign(new Error(`Sem fotos de ${name} na pasta do Drive do cliente — a arte usa só fotos do Drive.`), { status: 400 });
  const cover = await pickCover(drivePhotos, { preferId: photoId });
  const spec = { layout: client.art?.layout || 'vitrine', colors: client.art?.colors || {}, logo: readLogo(client.accountId) };
  const arts = await renderArts({ spec, vehicle, photo: cover.buffer, mask: cover.mask, overrides });
  const car = artCarName(vehicle, name);
  const images = arts.map((a) => ({ ...a, fileName: `[${a.format === 'story' ? 'STORIES' : 'FEED'}] ${car}.${a.ext}` }));
  return { engine, images, photos: [cover.photo.name], photoId: cover.photo.id, pickedBy: cover.by, ai: arts[0]?.ai ?? null };
}
