// Leitura dos nomes de arquivo exportados do Canva para organizar a biblioteca por veículo e formato.
// Nome esperado: "<MODELO> _ <VEÍCULO> - <ANO> FEED|ST (n).png"

const NAME = /^(.*?)\s+_\s+(.*?)\s+-\s+(\d{4})\s+(FEED|ST|STORIES|STORY)(?:\s*\((\d+)\))?$/i;
const BASE_FRAME_BYTES = 300 * 1024; // arquivos muito leves são o quadro do modelo sem foto

export function parseCanvaName(originalName, { size, width, height, folder } = {}) {
  const stem = originalName.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
  const m = stem.match(NAME);
  const format = m ? (/^F/i.test(m[4]) ? 'feed' : 'story') : (height && width && height > width * 1.5 ? 'story' : 'feed');
  const vehicle = m ? m[2].trim() : stem;
  const year = m ? m[3] : '';
  const variant = m?.[5] ? Number(m[5]) : 1;
  return {
    template: m ? m[1].trim() : folder || 'Canva',
    vehicle,
    year,
    format,
    variant,
    isBase: Boolean(size && size < BASE_FRAME_BYTES),
    pairKey: `${vehicle}|${year}|${variant}`,
  };
}

export function readPngSize(buffer) {
  return buffer.toString('ascii', 12, 16) === 'IHDR' ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : {};
}
