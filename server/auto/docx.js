// Texto de um .docx (Word) sem dependências: o arquivo é um ZIP; lemos word/document.xml e juntamos os parágrafos.
import zlib from 'node:zlib';

/** Conteúdo de um arquivo dentro do ZIP (ou null). */
function unzipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('arquivo .docx inválido');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(data) : method === 0 ? Buffer.from(data) : null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const entity = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

/** Parágrafos do documento, na ordem (texto puro). */
export function docxParagraphs(buf) {
  const xml = unzipEntry(buf, 'word/document.xml')?.toString('utf8');
  if (!xml) throw new Error('o .docx não tem texto (word/document.xml)');
  const body = xml.replace(/<w:tab\/>/g, '\t').replace(/<w:(br|cr)\/>/g, '\n');
  const paras = [];
  for (const m of body.matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    const text = [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|(\t)|(\n)/g)].map((t) => (t[1] != null ? entity(t[1]) : t[2] || t[3])).join('');
    paras.push(text);
  }
  return paras;
}

/** Texto do documento com uma linha por parágrafo. */
export function docxText(buf) {
  return docxParagraphs(buf).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
