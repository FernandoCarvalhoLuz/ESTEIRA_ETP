import { useId } from 'react';

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

function Svg({ children, size, ...rest }) {
  return <svg viewBox="0 0 24 24" width={size ?? '1em'} height={size ?? '1em'} {...base} {...rest}>{children}</svg>;
}

/**
 * Símbolo ETP: um "E" cuja barra do meio sai em segmentos de esteira e vira seta (tráfego que avança).
 * Os segmentos andam quando o símbolo está "vivo" (hover na marca ou prop live).
 */
export function Logo({ className = 'brand-mark', tile = true, live = false }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 48 48" className={`logo ${live ? 'live' : ''} ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={`lg-${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="8" x2="48" y2="40">
          <stop offset="0" stopColor="#FFE7A0" />
          <stop offset="0.45" stopColor="#F7C21B" />
          <stop offset="1" stopColor="#C98800" />
        </linearGradient>
        <linearGradient id={`lb-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1C1913" />
          <stop offset="1" stopColor="#070605" />
        </linearGradient>
        <clipPath id={`lc-${id}`}><rect x="0" y="0" width="28.4" height="48" /></clipPath>
      </defs>
      {tile && (
        <>
          <rect width="48" height="48" rx="13" fill={`url(#lb-${id})`} />
          <rect x="0.5" y="0.5" width="47" height="47" rx="12.5" fill="none" stroke="#F7C21B" strokeOpacity="0.3" />
        </>
      )}
      <g stroke={`url(#lg-${id})`} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M28 12H12.5V36H28" />
        <path className="logo-belt" d="M12.5 24H27" strokeDasharray="4 5.5" clipPath={`url(#lc-${id})`} />
        <path d="M30.5 24H37.5M31.5 18l6 6-6 6" />
      </g>
    </svg>
  );
}

/** Assinatura completa: símbolo + "ETP" + nome por extenso. */
export function BrandLockup({ sub = 'Esteira de Tráfego Pago', live = false }) {
  return (
    <>
      <Logo live={live} />
      <span className="brand-text">
        <span className="brand-word">ETP</span>
        <small>{sub}</small>
      </span>
    </>
  );
}

export const RefreshIcon = ({ spinning }) => <Svg className={spinning ? 'spin' : undefined}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></Svg>;
export const DownloadIcon = () => <Svg><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Svg>;
export const SortIcon = ({ dir }) => (
  <Svg size={12} style={{ opacity: dir ? 1 : 0.35 }}>
    {dir === 'asc' ? <path d="M6 15l6-6 6 6" /> : dir === 'desc' ? <path d="M6 9l6 6 6-6" /> : <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />}
  </Svg>
);
export const ArrowIcon = ({ dir }) => (
  <Svg size={11} strokeWidth={2.6}>{dir === 'up' ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}</Svg>
);
export const ThemeIcon = () => <Svg size={16}><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" /></Svg>;
export const HomeIcon = () => <Svg><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></Svg>;
export const ConveyorIcon = () => <Svg><rect x="2" y="14" width="20" height="6" rx="3" /><circle cx="6.5" cy="17" r="1" /><circle cx="12" cy="17" r="1" /><circle cx="17.5" cy="17" r="1" /><rect x="5" y="5" width="6" height="6" rx="1.5" /><rect x="13" y="7" width="5" height="4" rx="1.2" /></Svg>;
export const SettingsIcon = () => <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>;
export const SearchIcon = () => <Svg><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>;
export const PanelIcon = () => <Svg size={16}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></Svg>;
export const LogoutIcon = () => <Svg size={16}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></Svg>;
export const WalletIcon = () => <Svg><path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v14H5a2 2 0 0 1-2-2V5" /><circle cx="16" cy="14" r="1.2" fill="currentColor" /></Svg>;
export const ChatIcon = () => <Svg><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Svg>;
export const TargetIcon = () => <Svg><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /></Svg>;
export const UserPlusIcon = () => <Svg><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></Svg>;
export const TrendUpIcon = () => <Svg><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></Svg>;
export const TrendDownIcon = () => <Svg><path d="m3 7 6 6 4-4 8 8" /><path d="M14 17h7v-7" /></Svg>;
export const TrophyIcon = () => <Svg><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4" /></Svg>;
export const AlertIcon = () => <Svg><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></Svg>;
export const SparkIcon = () => <Svg><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></Svg>;
export const StarIcon = ({ filled = true }) => <Svg><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" fill={filled ? 'currentColor' : 'none'} /></Svg>;
export const PlusIcon = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const TrashIcon = () => <Svg><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></Svg>;
export const CopyIcon = () => <Svg><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Svg>;
export const CheckIcon = () => <Svg><path d="M20 6 9 17l-5-5" /></Svg>;
export const XIcon = () => <Svg><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const ChevronRight = () => <Svg><path d="m9 6 6 6-6 6" /></Svg>;
export const ChevronLeft = () => <Svg><path d="m15 6-6 6 6 6" /></Svg>;
export const UploadIcon = () => <Svg><path d="M12 15V3M7 8l5-5 5 5M5 21h14" /></Svg>;
export const ImageIcon = () => <Svg><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></Svg>;
export const VideoIcon = () => <Svg><rect x="2" y="5" width="14" height="14" rx="3" /><path d="m22 8-6 4 6 4z" /></Svg>;
export const PinIcon = () => <Svg><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></Svg>;
export const UsersIcon = () => <Svg><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7" /></Svg>;
export const LayersIcon = () => <Svg><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></Svg>;
export const ExternalIcon = () => <Svg><path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></Svg>;
export const PauseIcon = () => <Svg><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></Svg>;
export const PlayIcon = () => <Svg><path d="M6 4l14 8-14 8z" /></Svg>;
export const MoreIcon = () => <Svg><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></Svg>;
export const WandIcon = () => <Svg><path d="m15 4 5 5L9 20H4v-5z" /><path d="M13 6l5 5" /></Svg>;
export const RocketIcon = () => <Svg><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" /><path d="M9 15 6 12l4-8c3-1 7-1 10-1 0 3 0 7-1 10l-8 4z" /><circle cx="15" cy="9" r="1.6" /></Svg>;
export const WhatsappIcon = () => <Svg><path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 7.8 19.6z" /><path d="M9 9.5c.3 1.6 1.9 3.6 3.6 4.3l1.2-1.1 2 1-.4 1.6c-3.5.4-7.4-3.4-7-7l1.6-.4 1 2z" /></Svg>;
export const CalendarIcon = () => <Svg><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></Svg>;
export const EyeIcon = () => <Svg><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const CodeIcon = () => <Svg><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></Svg>;
export const BoltIcon = () => <Svg><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Svg>;
export const DriveIcon = () => <Svg><path d="M8 3h8l6 10-4 7H6l-4-7z" /><path d="M8 3l6 10H2M16 3l-6 10 4 7" /></Svg>;
export const GlobeIcon = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Svg>;
export const BrainIcon = () => <Svg><path d="M9 4a3 3 0 0 0-3 3v.5A3 3 0 0 0 4 13a3 3 0 0 0 2 5 3 3 0 0 0 6 0V7a3 3 0 0 0-3-3z" /><path d="M15 4a3 3 0 0 1 3 3v.5a3 3 0 0 1 2 5.5 3 3 0 0 1-2 5 3 3 0 0 1-6 0" /></Svg>;
export const CanvaIcon = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M15.5 9.5a4 4 0 1 0 0 5" /></Svg>;
