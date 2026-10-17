// Estoque pelas pastas do Drive, para clientes sem site (ex.: Auto Prime): cada subpasta da pasta do cliente é um
// carro, com as fotos e um .docx com a descrição do anúncio (marca, modelo, versão, ano, câmbio, preço à vista e
// destaques). Pastas sem fotos nem descrição (ex.: "Vídeos Carros") ficam de fora. Carro com [FEED] e [STORIES]
// na pasta já tem arte pronta (não está pendente).
import { downloadFile, readFolder } from './drive.js';
import { docxText } from './docx.js';
import { parseDescription } from './vehicleText.js';

const FOLDER = 'application/vnd.google-apps.folder';
const isArt = (f) => /^\[(FEED|STORIES)\]/i.test(f.name);
const isPhoto = (f) => f.mimeType?.startsWith('image/') && !isArt(f);
const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true });

/** Nome legível do carro a partir da pasta: "Argo Drive 2023 ( PRATA )" → "Argo Drive 2023". */
export const cleanFolderName = (s) => String(s || '').replace(/\(.*?\)/g, ' ').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

async function eachLimit(items, limit, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

/** Sem .docx: só o nome da pasta ("Gol 2023" → modelo GOL, ano 2023). */
function fromFolderName(name) {
  const clean = cleanFolderName(name);
  const year = clean.match(/\b(19[89]\d|20[0-4]\d)\b/)?.[1] || '';
  const words = clean.replace(year, ' ').replace(/\s+/g, ' ').trim().toUpperCase().split(' ');
  return { brand: '', model: words[0] || '', version: words.slice(1).join(' '), year, transmission: '', price: null, highlights: [], title: clean.toUpperCase(), text: '' };
}

export async function listDriveStock(drive) {
  const root = await readFolder(drive.folderId, drive.resourceKey);
  const folders = root.files.filter((f) => f.mimeType === FOLDER);
  const items = [];
  await eachLimit(folders, 4, async (f) => {
    const inside = await readFolder(f.id).catch(() => null);
    if (!inside) return;
    const files = inside.files;
    const doc = files.find((x) => /\.docx$/i.test(x.name));
    const photos = files.filter(isPhoto).sort(byName);
    if (!doc && !photos.length) return;
    let d = null;
    if (doc) {
      try {
        d = parseDescription(docxText(await downloadFile(doc.id)), { folderName: f.name });
      } catch (err) {
        console.warn(`[estoque-drive] não li a descrição de "${f.name}": ${err.message}`);
      }
    }
    d ||= fromFolderName(f.name);
    items.push({
      id: f.id,
      source: 'drive',
      folderId: f.id,
      folderName: f.name,
      carName: cleanFolderName(f.name),
      title: d.title || cleanFolderName(f.name).toUpperCase(),
      brand: d.brand,
      model: d.model,
      version: d.version,
      year: d.year,
      transmission: d.transmission,
      price: d.price,
      highlights: d.highlights,
      description: d.text,
      km: '',
      options: [],
      photos: [],
      thumb: photos[0]?.thumbnailLink || null,
      url: `https://drive.google.com/drive/folders/${f.id}`,
      photoCount: photos.length,
      hasArts: files.filter(isArt).length >= 2,
      hasDescription: Boolean(doc),
    });
  });
  return items.sort((a, b) => a.folderName.localeCompare(b.folderName, 'pt-BR'));
}
