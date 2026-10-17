// Logos oficiais das plataformas (glifos do Simple Icons, CC0) nas cores de marca de cada uma.
// Regra das diretrizes da Meta: não recolorir nem distorcer — usamos a cor oficial ou monocromático.
import { useId } from 'react';
import { siFacebook, siGoogledrive, siInstagram, siMessenger, siMeta, siThreads, siWhatsapp } from 'simple-icons';

export const PLATFORMS = {
  facebook: { label: 'Facebook', icon: siFacebook, color: '#0866FF' },
  instagram: { label: 'Instagram', icon: siInstagram, color: '#FF0069', gradient: true },
  whatsapp: { label: 'WhatsApp', icon: siWhatsapp, color: '#25D366' },
  messenger: { label: 'Messenger', icon: siMessenger, color: '#0866FF', gradient: true },
  audience_network: { label: 'Audience Network', icon: siMeta, color: '#0467DF' },
  threads: { label: 'Threads', icon: siThreads, color: 'currentColor' },
  meta: { label: 'Meta', icon: siMeta, color: '#0467DF' },
  drive: { label: 'Google Drive', icon: siGoogledrive, color: '#4285F4' },
};

export const platformLabel = (key) => PLATFORMS[key]?.label || key;

/** Nome da plataforma como posicionamento de anúncio (no WhatsApp o anúncio aparece no Status). */
export const publisherLabel = (key) => (key === 'whatsapp' ? 'Status do WhatsApp' : platformLabel(key));

/** Glifo de marca. mono = herda a cor do texto (para fundos coloridos). */
export function BrandLogo({ name, size = 18, mono = false, className = '', title }) {
  const gid = useId().replace(/:/g, '');
  const p = PLATFORMS[name] || PLATFORMS.meta;
  let fill = mono ? 'currentColor' : p.color;
  let defs = null;
  if (!mono && name === 'instagram') {
    defs = (
      <radialGradient id={`ig-${gid}`} cx="0.3" cy="1.07" r="1.15">
        <stop offset="0" stopColor="#FFDD55" />
        <stop offset="0.1" stopColor="#FFDD55" />
        <stop offset="0.5" stopColor="#FF543E" />
        <stop offset="1" stopColor="#C837AB" />
      </radialGradient>
    );
    fill = `url(#ig-${gid})`;
  } else if (!mono && name === 'messenger') {
    defs = (
      <radialGradient id={`ms-${gid}`} cx="0.19" cy="0.99" r="1.09">
        <stop offset="0" stopColor="#0099FF" />
        <stop offset="0.6" stopColor="#A033FF" />
        <stop offset="0.9" stopColor="#FF5280" />
        <stop offset="1" stopColor="#FF7061" />
      </radialGradient>
    );
    fill = `url(#ms-${gid})`;
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`brand-logo ${className}`} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {defs && <defs>{defs}</defs>}
      <path d={p.icon.path} fill={fill} />
    </svg>
  );
}

/** Logo dentro de um "selo" circular com halo da cor da marca. */
export function BrandBadge({ name, size = 34, className = '' }) {
  const p = PLATFORMS[name] || PLATFORMS.meta;
  return (
    <span className={`brand-badge ${className}`} style={{ width: size, height: size, '--brand': p.color === 'currentColor' ? 'var(--text)' : p.color }} title={p.label}>
      <BrandLogo name={name} size={Math.round(size * 0.52)} />
    </span>
  );
}

const POSITION_LABELS = {
  feed: 'Feed',
  instagram_stories: 'Stories',
  facebook_stories: 'Stories',
  instagram_reels: 'Reels',
  facebook_reels: 'Reels',
  facebook_reels_overlay: 'Anúncios sobre Reels',
  instagram_explore: 'Explorar',
  instagram_explore_grid_home: 'Explorar (grade)',
  instagram_profile_feed: 'Feed do perfil',
  instagram_search: 'Resultados da busca',
  facebook_profile_feed: 'Feed do perfil',
  marketplace: 'Marketplace',
  video_feeds: 'Vídeos no feed',
  right_hand_column: 'Coluna da direita',
  search: 'Resultados da busca',
  facebook_notification: 'Notificações',
  instream_video: 'Vídeos in-stream',
  an_classic: 'Nativo, banner e intersticial',
  rewarded_video: 'Vídeo com recompensa',
  status: 'Status',
  messenger_inbox: 'Caixa de entrada',
  messenger_stories: 'Stories',
  threads_feed: 'Feed',
};

export const positionLabel = (position) => POSITION_LABELS[position] || String(position || '').replace(/_/g, ' ');
