// Biblioteca de criativos: arquivos enviados pela Esteira (data/uploads) + imagens/vídeos já existentes na conta da Meta.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { collection, uploadsDir } from '../store.js';
import { graph, graphUpload } from '../meta/client.js';
import { parseCanvaName, readPngSize } from './canva.js';

export const mediaStore = collection('media');

const ALLOWED = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
};

export const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || ''}`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(Object.assign(new Error('Formato não suportado. Use JPG, PNG, MP4 ou MOV.'), { status: 400 }));
  },
}).single('file');

/** Registra um upload. Com scope "canva", o nome do arquivo é lido para agrupar por veículo e formato. */
export function registerUpload(file, { accountId, user, scope }) {
  const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
  let extra = {};
  if (scope === 'canva' && ALLOWED[file.mimetype] === 'image') {
    const header = Buffer.alloc(24);
    const fd = fs.openSync(file.path, 'r');
    fs.readSync(fd, header, 0, 24, 0);
    fs.closeSync(fd);
    const dims = file.mimetype === 'image/png' ? readPngSize(header) : {};
    extra = { scope: 'canva', width: dims.width || null, height: dims.height || null, canva: parseCanvaName(originalName, { size: file.size, ...dims }) };
  }
  return mediaStore.insert({
    accountId,
    kind: ALLOWED[file.mimetype],
    mime: file.mimetype,
    size: file.size,
    filename: file.filename,
    originalName,
    ...extra,
    meta: {},
    createdBy: user?.username || null,
  });
}

/**
 * Guarda na biblioteca uma imagem baixada (Drive, Canva, site). WebP e outros formatos viram JPG, que a Meta aceita.
 * `scope` identifica a origem ('drive' | 'canva' | 'site'); `extra` vai junto no registro (ex.: canva, vehicle).
 */
export async function importBuffer({ accountId, buffer, mime, originalName, scope, extra = {}, user }) {
  const { default: sharp } = await import('sharp');
  let data = buffer;
  let type = mime;
  const meta = await sharp(buffer).metadata().catch(() => null);
  if (!ALLOWED[type] || type === 'image/webp' || (meta && !['jpeg', 'png'].includes(meta.format))) {
    data = await sharp(buffer).rotate().jpeg({ quality: 90 }).toBuffer();
    type = 'image/jpeg';
  }
  const ext = type === 'image/png' ? '.png' : '.jpg';
  const filename = `${crypto.randomUUID()}${ext}`;
  await fs.promises.writeFile(path.join(uploadsDir, filename), data);
  return mediaStore.insert({
    accountId,
    kind: 'image',
    mime: type,
    size: data.length,
    filename,
    originalName: originalName.replace(/\.(webp|heic|avif|gif)$/i, ext),
    scope,
    width: meta?.width || null,
    height: meta?.height || null,
    ...extra,
    meta: {},
    createdBy: user?.username || null,
  });
}

export function filePathOf(item) {
  return path.join(uploadsDir, item.filename);
}

export function removeUpload(id) {
  const item = mediaStore.get(id);
  if (!item) return false;
  fs.rm(filePathOf(item), { force: true }, () => {});
  return mediaStore.remove(id);
}

export async function listMedia(accountId, { fresh } = {}) {
  const local = mediaStore.list()
    .filter((m) => m.accountId === accountId && m.scope !== 'canva')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((m) => ({ ...m, url: `/api/builder/media/${m.id}/file` }));
  const [images, videos] = await Promise.all([
    graph(`${accountId}/adimages`, { fields: 'hash,name,permalink_url,url,width,height,created_time', limit: 60 }, { fresh }).catch(() => ({ data: [] })),
    graph(`${accountId}/advideos`, { fields: 'id,title,picture,length,created_time', limit: 40 }, { fresh }).catch(() => ({ data: [] })),
  ]);
  const canva = mediaStore.list()
    .filter((m) => m.scope === 'canva' && m.accountId === accountId)
    .map((m) => ({ ...m, url: `/api/builder/media/${m.id}/file` }));
  return {
    local,
    canva,
    meta: {
      images: (images.data || []).map((i) => ({ hash: i.hash, name: i.name, url: i.permalink_url || i.url, width: i.width, height: i.height, createdAt: i.created_time })),
      videos: (videos.data || []).map((v) => ({ id: v.id, title: v.title || 'Vídeo', picture: v.picture, length: v.length, createdAt: v.created_time })),
    },
  };
}

async function fileBlob(item) {
  const file = filePathOf(item);
  if (typeof fs.openAsBlob === 'function') return fs.openAsBlob(file, { type: item.mime });
  return new Blob([await fs.promises.readFile(file)], { type: item.mime });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitVideoReady(videoId, onWait) {
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const v = await graph(videoId, { fields: 'status' }, { fresh: true });
    const status = v.status?.video_status;
    if (status === 'ready') return;
    if (status === 'error') throw new Error('A Meta não conseguiu processar o vídeo.');
    onWait?.(v.status?.processing_progress);
    await sleep(5000);
  }
  throw new Error('O vídeo demorou demais para ser processado pela Meta. Tente publicar de novo em alguns minutos.');
}

export async function videoThumbnail(videoId) {
  const v = await graph(videoId, { fields: 'thumbnails{uri,is_preferred},picture' }, { fresh: true });
  const thumbs = v.thumbnails?.data || [];
  return (thumbs.find((t) => t.is_preferred) || thumbs[0])?.uri || v.picture;
}

/**
 * Garante que a mídia do anúncio existe na conta da Meta e devolve a referência para o criativo.
 * Uploads ficam memorizados por conta para não reenviar o mesmo arquivo.
 */
export async function ensureOnMeta(accountId, media, { onProgress } = {}) {
  if (media.source === 'meta') {
    if (media.kind === 'video') return { videoId: media.videoId, thumbnailUrl: await videoThumbnail(media.videoId) };
    return { imageHash: media.hash };
  }
  const item = mediaStore.get(media.mediaId);
  if (!item) throw new Error(`O arquivo "${media.name || 'mídia'}" não está mais na biblioteca.`);
  const cached = item.meta?.[accountId];
  if (cached?.imageHash) return { imageHash: cached.imageHash };
  if (cached?.videoId) return { videoId: cached.videoId, thumbnailUrl: await videoThumbnail(cached.videoId) };

  const blob = await fileBlob(item);
  if (item.kind === 'image') {
    const body = await graphUpload(`${accountId}/adimages`, {}, [{ field: 'filename', blob, filename: item.originalName }]);
    const imageHash = Object.values(body.images || {})[0]?.hash;
    if (!imageHash) throw new Error('A Meta não retornou o identificador da imagem.');
    mediaStore.update(item.id, (m) => ({ meta: { ...m.meta, [accountId]: { imageHash } } }));
    return { imageHash };
  }
  onProgress?.('Enviando vídeo para a Meta…');
  const body = await graphUpload(`${accountId}/advideos`, { name: item.originalName }, [{ field: 'source', blob, filename: item.originalName }]);
  const videoId = body.id;
  mediaStore.update(item.id, (m) => ({ meta: { ...m.meta, [accountId]: { videoId } } }));
  await waitVideoReady(videoId, (pct) => onProgress?.(`Meta processando o vídeo${pct ? ` (${pct}%)` : ''}…`));
  return { videoId, thumbnailUrl: await videoThumbnail(videoId) };
}

