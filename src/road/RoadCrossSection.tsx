/**
 * AW-8.2 — „Was auf der Fahrbahn liegt“: the schematic cross-section of the boards (own SVG, no nivo — gefahren §nivo):
 * air with temperature, dew point and humidity above; the surface layer (Reif, Eis, Schnee, Wasserfilm, feucht, trocken,
 * unbekannt hatched, nicht gemessen dashed); the asphalt with its temperature. Layer thickness exaggerated, labelled so.
 */
import type { CrossSection } from './roadHzView';

export default function RoadCrossSection({ xs }: { xs: CrossSection }) {
  const film = Math.max(2, Math.min(9, xs.filmMm * 22));
  const k = xs.kind;
  const cold = xs.station?.rs != null && xs.station.rs <= 0;
  return (
    <svg viewBox="0 0 338 118" width="100%" role="img" aria-label={`Querschnitt der Fahrbahn: ${xs.label}, ${xs.roadText}`} className="aw-hz-xs">
      <defs>
        <linearGradient id="awSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#EEF3F8" /><stop offset="1" stopColor="#F7F4EC" /></linearGradient>
        <pattern id="awXsHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#EDE6D3" /><rect width="2.5" height="6" fill="#8B8474" /></pattern>
      </defs>
      <rect x="0" y="0" width="338" height="64" rx="8" fill="url(#awSky)" />
      <text x="10" y="17" fontSize="11" fontWeight="600" fill="#2C2A26">{xs.air}</text>
      <text x="10" y="31" fontSize="10.5" fill="#5C5447">{xs.dew} · {xs.rh}</text>
      <text x="328" y="17" fontSize="9.5" fill="#8B7355" textAnchor="end">{xs.src}</text>
      <rect x="0" y="64" width="338" height="34" fill={k === 'nichtgemessen' ? '#4A4740' : cold ? '#3B4A5C' : '#3A3833'} />
      <g fill="#6E6A60" opacity="0.6"><circle cx="30" cy="74" r="1.2" /><circle cx="64" cy="86" r="1.4" /><circle cx="102" cy="78" r="1.1" /><circle cx="141" cy="90" r="1.3" /><circle cx="180" cy="73" r="1.2" /><circle cx="221" cy="85" r="1.4" /><circle cx="262" cy="77" r="1.1" /><circle cx="300" cy="89" r="1.3" /></g>
      <rect x="0" y="98" width="338" height="20" fill="#7A6C55" />
      {k === 'nass' && <g><rect x="0" y={64 - film} width="338" height={film} fill="#5E97D1" opacity="0.85" /><path d="M20 61c8-2 14-2 22 0M120 60c8-2 14-2 22 0M230 61c8-2 14-2 22 0" stroke="#EAF1F7" strokeWidth="1.2" fill="none" /></g>}
      {k === 'feucht' && <rect x="0" y="62" width="338" height="2" fill="#5E97D1" opacity="0.7" />}
      {k === 'reif' && <g><rect x="0" y="60" width="338" height="4" fill="#E4EEF7" /><path d="M8 60l3-5 3 5M26 60l2-4 2 4M44 60l3-6 3 6M63 60l2-4 2 4M80 60l3-5 3 5M99 60l2-4 2 4M117 60l3-6 3 6M136 60l2-4 2 4M154 60l3-5 3 5M173 60l2-4 2 4M191 60l3-6 3 6M210 60l2-4 2 4M228 60l3-5 3 5M247 60l2-4 2 4M265 60l3-6 3 6M284 60l2-4 2 4M302 60l3-5 3 5M321 60l2-4 2 4" stroke="#9FBEDC" strokeWidth="1.2" fill="none" strokeLinejoin="round" /></g>}
      {k === 'eis' && <g><rect x="0" y="58" width="338" height="6" fill="#CFE2F3" /><path d="M14 60l40 0M90 61l60 0M200 60l50 0" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" /></g>}
      {k === 'schnee' && <path d="M0 64V55c12-4 24 2 36-1s24-4 36 0 24 3 36-1 24-3 36 1 24 2 36-1 24-3 36 0 24 3 36 0 24-2 36 0 24 2 34 0V64z" fill="#FFFFFF" stroke="#D9E3EE" strokeWidth="1" />}
      {k === 'unbekannt' && <g><rect x="0" y="58" width="338" height="6" fill="url(#awXsHatch)" /><text x="169" y="52" fontSize="10.5" fontWeight="700" fill="#5C5447" textAnchor="middle">?</text></g>}
      {k === 'nichtgemessen' && <rect x="0.6" y="58.6" width="336.8" height="5" fill="none" stroke="#9A5A2A" strokeWidth="1.2" strokeDasharray="4 3" />}
      {k === 'trocken' && <rect x="282" y="76" width="16" height="6" rx="1.5" fill="#E9E4D6" />}
      <text x="10" y="54" fontSize="10.5" fontWeight="700" fill="#1F3F6E">{xs.label}</text>
      <text x="10" y="86" fontSize="13" fontWeight="700" fill="#FAF6EA">{xs.roadText}</text>
      <text x="328" y="112" fontSize="9" fill="#EDE6D3" textAnchor="end">Querschnitt schematisch, Schichtdicke überhöht</text>
    </svg>
  );
}
