/**
 * Intro illustration set — one custom, STATIC line-art SVG per feature.
 *
 * Shared spec (so the set reads as one family, not different styles):
 *   · canvas      viewBox 0 0 320 200, ~24px visual padding
 *   · stroke      width 2, round caps + joins, fill: none by default
 *   · color       primary lines use currentColor (= the step's accent token);
 *                 neutral structure uses sand/ink/stone tokens
 *   · no motion   illustrations are static; movement lives only in step transitions
 *   · decorative  marked aria-hidden (the step text carries the meaning)
 *
 * Each art component takes the step's `accent` (a design-system token name) and
 * paints currentColor with it, so the whole set inherits the palette.
 */

import type { FC } from 'react';

export type IntroArt = FC<{ accent: string }>;

/** Enforces the shared canvas/stroke/color spec for every illustration. */
const Frame: FC<{ accent: string; children: React.ReactNode }> = ({ accent, children }) => (
  <svg
    className="intro-art-svg"
    viewBox="0 0 320 200"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ color: `var(${accent})` }}
  >
    {children}
  </svg>
);

const SAND = 'var(--sand-100)';
const SAND2 = 'var(--sand-200)';
const INK = 'var(--ink-900)';
const STONE = 'var(--stone-400)';

/* 0 · So nutzt du buscosun — Ablauf: Suche → Karte+Layer+Pin → Detail-Karte */
export const FlowArt: IntroArt = ({ accent }) => (
  <Frame accent={accent}>
    {/* search pill */}
    <g>
      <rect x="66" y="22" width="188" height="26" rx="13" fill="#fff" stroke={SAND2} strokeWidth="1.6" />
      <circle cx="82" cy="35" r="5" stroke="currentColor" strokeWidth="1.8" />
      <line x1="86" y1="39" x2="90" y2="43" stroke="currentColor" strokeWidth="1.8" />
      <line x1="100" y1="35" x2="180" y2="35" stroke={SAND2} strokeWidth="3" />
    </g>
    {/* connector down */}
    <g stroke={STONE} strokeWidth="1.6">
      <line x1="120" y1="48" x2="120" y2="66" />
      <polyline points="116,61 120,66 124,61" fill="none" />
    </g>
    {/* map */}
    <rect x="40" y="68" width="156" height="108" rx="14" fill={SAND} stroke={SAND2} />
    <g stroke="currentColor" opacity="0.4">
      <path d="M 50 100 Q 95 88 140 100 T 188 92" />
      <path d="M 50 126 Q 95 114 140 126 T 188 118" />
    </g>
    <g>
      <path d="M 110 138 C 102 126 99 120 99 114 a 11 11 0 1 1 22 0 c 0 6 -3 12 -11 24 Z" fill="currentColor" stroke="none" />
      <circle cx="110" cy="114" r="4" fill={SAND} stroke="none" />
    </g>
    <g strokeWidth="1.4">
      <rect x="50" y="158" width="30" height="11" rx="5.5" fill="#fff" stroke={SAND2} />
      <rect x="84" y="158" width="30" height="11" rx="5.5" fill="currentColor" stroke="none" />
    </g>
    {/* connector right to detail card */}
    <g stroke={STONE} strokeWidth="1.6">
      <line x1="196" y1="120" x2="214" y2="120" />
      <polyline points="209,116 214,120 209,124" fill="none" />
    </g>
    {/* detail card */}
    <g>
      <rect x="216" y="86" width="64" height="70" rx="12" fill="#fff" stroke={SAND2} />
      <line x1="228" y1="100" x2="268" y2="100" stroke={SAND2} strokeWidth="3" />
      <text x="228" y="126" fill="currentColor" stroke="none" fontSize="20" fontWeight="600" fontFamily="var(--font-base)">18°</text>
      <line x1="228" y1="140" x2="260" y2="140" stroke={SAND2} strokeWidth="2.4" />
    </g>
  </Frame>
);

/* 1 · Wetterkarte — gerahmte Karte mit Höhenlinien, Pin, Layer-Chips */
export const MapArt: IntroArt = ({ accent }) => (
  <Frame accent={accent}>
    <rect x="40" y="30" width="240" height="124" rx="16" fill={SAND} stroke={SAND2} />
    <g stroke="currentColor" opacity="0.45">
      <path d="M 52 70 Q 120 52 196 68 T 268 58" />
      <path d="M 52 98 Q 120 82 196 96 T 268 86" />
      <path d="M 52 126 Q 120 110 196 124 T 268 114" />
    </g>
    {/* pin */}
    <g>
      <path d="M 160 110 C 150 96 146 88 146 80 a 14 14 0 1 1 28 0 c 0 8 -4 16 -14 30 Z" fill="currentColor" stroke="none" />
      <circle cx="160" cy="80" r="5.5" fill={SAND} stroke="none" />
    </g>
    {/* layer chips */}
    <g strokeWidth="1.5">
      <rect x="52" y="134" width="40" height="14" rx="7" fill="#fff" stroke={SAND2} />
      <rect x="98" y="134" width="40" height="14" rx="7" fill="currentColor" stroke="none" />
      <rect x="144" y="134" width="40" height="14" rx="7" fill="#fff" stroke={SAND2} />
    </g>
  </Frame>
);

/* 2 · Regenradar — Reichweiten-Ringe, Sweep-Keil, Regenwolke */
export const RadarArt: IntroArt = ({ accent }) => (
  <Frame accent={accent}>
    <g opacity="0.9">
      <circle cx="120" cy="104" r="58" stroke={SAND2} />
      <circle cx="120" cy="104" r="38" stroke={SAND2} />
      <circle cx="120" cy="104" r="18" stroke={SAND2} />
    </g>
    <path d="M 120 104 L 120 46 A 58 58 0 0 1 171 76 Z" fill="currentColor" opacity="0.16" stroke="none" />
    <line x1="120" y1="104" x2="171" y2="76" stroke="currentColor" />
    <circle cx="120" cy="104" r="4" fill="currentColor" stroke="none" />
    {/* rain cloud upper-right */}
    <g transform="translate(214 56)">
      <path d="M -22 8 C -30 8 -32 -2 -24 -6 C -24 -16 -10 -20 -3 -13 C 3 -20 18 -16 18 -4 C 28 -4 28 8 18 8 Z" fill="#fff" stroke="currentColor" />
      <g stroke="currentColor" strokeWidth="2">
        <line x1="-12" y1="14" x2="-15" y2="24" />
        <line x1="0" y1="14" x2="-3" y2="24" />
        <line x1="12" y1="14" x2="9" y2="24" />
      </g>
    </g>
  </Frame>
);

/* 3 · Tourenplanung — Höhenprofil mit Start/Ziel, Sonne, Wolke */
export const RouteArt: IntroArt = ({ accent }) => (
  <Frame accent={accent}>
    <path d="M 40 150 Q 100 56 156 60 T 280 122 L 280 156 L 40 156 Z" fill={SAND} stroke="none" />
    <path d="M 40 150 Q 100 56 156 60 T 280 122" stroke="currentColor" />
    <circle cx="40" cy="150" r="6" fill={INK} stroke="none" />
    <circle cx="280" cy="122" r="6" fill="currentColor" stroke="none" />
    {/* sun over the climb */}
    <g transform="translate(92 48)" stroke="currentColor">
      <circle r="9" fill="#fff" />
      <g strokeWidth="2">
        <line x1="0" y1="-16" x2="0" y2="-12" /><line x1="0" y1="12" x2="0" y2="16" />
        <line x1="-16" y1="0" x2="-12" y2="0" /><line x1="12" y1="0" x2="16" y2="0" />
        <line x1="-11" y1="-11" x2="-8.5" y2="-8.5" /><line x1="8.5" y1="8.5" x2="11" y2="11" />
      </g>
    </g>
    {/* cloud near the descent */}
    <g transform="translate(232 70)">
      <path d="M -18 6 C -25 6 -26 -3 -19 -6 C -19 -14 -7 -17 -1 -11 C 4 -17 17 -14 17 -3 C 25 -3 25 6 17 6 Z" fill="#fff" stroke={STONE} />
    </g>
  </Frame>
);

/* 4 · Event-Planung — Score-Donut + 7 Tage-Balken, bester Tag markiert */
export const EventArt: IntroArt = ({ accent }) => {
  const C = 2 * Math.PI * 26;
  const filled = C * 0.78;
  return (
    <Frame accent={accent}>
      <g transform="translate(86 100)">
        <circle r="26" stroke={SAND2} strokeWidth="7" />
        <circle r="26" stroke="currentColor" strokeWidth="7" strokeDasharray={`${filled} ${C}`} transform="rotate(-90)" />
        <circle r="3.5" cx="0" cy="-26" fill="currentColor" stroke="none" transform="rotate(-90)" />
      </g>
      {/* 7 day bars */}
      <g transform="translate(150 64)" strokeWidth="1.5">
        {[26, 34, 40, 56, 44, 30, 24].map((h, i) => {
          const best = i === 3;
          return (
            <g key={i} transform={`translate(${i * 22} ${64 - h})`}>
              <rect width="15" height={h} rx="3.5" fill={best ? 'currentColor' : '#fff'} stroke={best ? 'none' : SAND2} />
              {best && <path d="M 4 8 L 7 11 L 12 4" stroke="#fff" strokeWidth="2" fill="none" />}
            </g>
          );
        })}
      </g>
    </Frame>
  );
};

/* 5 · Vorhersage — Mehrmodell-Spread-Fächer mit Caliper */
export const ForecastArt: IntroArt = ({ accent }) => (
  <Frame accent={accent}>
    <line x1="44" y1="150" x2="280" y2="150" stroke={SAND2} strokeDasharray="3 5" />
    <path d="M 56 110 L 256 54 L 256 150 L 56 110 Z" fill="currentColor" opacity="0.12" stroke="none" />
    <path d="M 56 110 L 256 54" stroke="currentColor" opacity="0.6" />
    <path d="M 56 110 L 256 150" stroke="currentColor" opacity="0.6" />
    <path d="M 56 110 L 256 104" stroke={INK} />
    <circle cx="56" cy="110" r="5" fill={INK} stroke="none" />
    <g stroke={INK} strokeWidth="1.5">
      <line x1="270" y1="54" x2="270" y2="150" />
      <line x1="265" y1="54" x2="275" y2="54" />
      <line x1="265" y1="150" x2="275" y2="150" />
    </g>
  </Frame>
);

/* 6 · 3D-Globus — Kugel mit Gitter, Atmosphäre, Jetstream-Bändern */
export const GlobeArt: IntroArt = ({ accent }) => (
  <Frame accent={accent}>
    <circle cx="160" cy="100" r="74" stroke="currentColor" opacity="0.25" strokeWidth="6" />
    <circle cx="160" cy="100" r="62" fill={SAND} stroke={SAND2} />
    <g stroke={STONE} opacity="0.6" strokeWidth="1.4" fill="none">
      <line x1="98" y1="100" x2="222" y2="100" />
      <ellipse cx="160" cy="100" rx="62" ry="26" />
      <ellipse cx="160" cy="100" rx="26" ry="62" />
      <line x1="160" y1="38" x2="160" y2="162" />
    </g>
    <g fill="none" strokeWidth="2.4">
      <path d="M 104 78 Q 160 66 214 82" stroke="currentColor" />
      <path d="M 100 122 Q 160 136 218 120" stroke="currentColor" opacity="0.55" />
    </g>
    <ellipse cx="138" cy="78" rx="14" ry="9" fill="#fff" opacity="0.5" stroke="none" />
  </Frame>
);

/* 7 · Atmosphäre — Vertikalschnitt: Höhenprofil mit Inversion (rechter Knick =
 * wärmere Schicht über kälterer), Föhn-Bergsilhouette, Höhenwind-Pfeile */
export const AtmosphereArt: IntroArt = ({ accent }) => (
  <Frame accent={accent}>
    {/* profile panel */}
    <rect x="44" y="30" width="232" height="140" rx="14" fill={SAND} stroke={SAND2} />
    {/* height gridlines */}
    <g stroke={SAND2} strokeWidth="1.3">
      <line x1="62" y1="58" x2="258" y2="58" />
      <line x1="62" y1="92" x2="258" y2="92" />
      <line x1="62" y1="126" x2="258" y2="126" />
    </g>
    {/* inversion band — warm over cold, highlighted */}
    <rect x="62" y="84" width="196" height="18" fill="currentColor" opacity="0.12" stroke="none" />
    {/* terrain / Föhn mountain */}
    <path d="M 62 158 L 104 158 L 150 116 L 196 150 L 258 134 L 258 158 Z" fill={STONE} opacity="0.3" stroke="none" />
    <path d="M 104 158 L 150 116 L 196 150" stroke={STONE} strokeWidth="1.6" fill="none" />
    {/* temperature profile with inversion kink */}
    <path d="M 150 156 L 120 102 L 150 84 L 116 50" stroke="currentColor" fill="none" />
    <g fill="currentColor" stroke="none">
      <circle cx="150" cy="156" r="3.4" /><circle cx="120" cy="102" r="3.4" />
      <circle cx="150" cy="84" r="3.4" /><circle cx="116" cy="50" r="3.4" />
    </g>
    {/* height-wind arrows (stronger aloft) */}
    <g stroke="currentColor" strokeWidth="1.8" opacity="0.7">
      <g transform="translate(214 62)"><line x1="-12" y1="0" x2="12" y2="0" /><polyline points="6,-5 12,0 6,5" fill="none" /></g>
      <g transform="translate(220 120)"><line x1="-8" y1="0" x2="8" y2="0" /><polyline points="3,-4 8,0 3,4" fill="none" /></g>
    </g>
  </Frame>
);

/* ===========================================================================
 * Detail vignettes — a second, smaller "real UI snippet" per feature. Same spec
 * (currentColor = accent, stroke 2, sand/ink neutrals), wider/shorter canvas
 * (320×96). Short German labels make the snippet concrete; text inherits the
 * font token + is decorative (parent SVG is aria-hidden).
 * =========================================================================== */
const DetailFrame: FC<{ accent: string; children: React.ReactNode }> = ({ accent, children }) => (
  <svg className="intro-art-svg" viewBox="0 0 320 96" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: `var(${accent})` }}>
    {children}
  </svg>
);
const T_STONE = 'var(--stone-500)';
const T_INK = 'var(--ink-900)';

/* map · Layer-Pills + Zeit-Slider */
export const MapDetail: IntroArt = ({ accent }) => (
  <DetailFrame accent={accent}>
    <g strokeWidth="1.5">
      <rect x="20" y="14" width="66" height="22" rx="11" fill="#fff" stroke={SAND2} />
      <text x="53" y="29" fontSize="10" fill={T_STONE} textAnchor="middle" stroke="none">Wind</text>
      <rect x="92" y="14" width="104" height="22" rx="11" fill={T_INK} stroke="none" />
      <text x="144" y="29" fontSize="10" fill="#fff" textAnchor="middle" stroke="none">Niederschlag</text>
      <rect x="202" y="14" width="62" height="22" rx="11" fill="#fff" stroke={SAND2} />
      <text x="233" y="29" fontSize="10" fill={T_STONE} textAnchor="middle" stroke="none">Temp</text>
    </g>
    {/* time slider — aktive Auswahl in ink-900 (Design-System) */}
    <line x1="20" y1="66" x2="300" y2="66" stroke={SAND2} strokeWidth="3" />
    <line x1="20" y1="66" x2="150" y2="66" stroke={T_INK} strokeWidth="3" />
    <circle cx="150" cy="66" r="6" fill="#fff" stroke={T_INK} strokeWidth="2" />
    <text x="20" y="86" fontSize="9" fill={T_STONE} stroke="none">jetzt</text>
    <text x="300" y="86" fontSize="9" fill={T_STONE} textAnchor="end" stroke="none">+24 h</text>
  </DetailFrame>
);

/* radar · Punkt-Streifen „Regen in 12 Min" — echte CLASSIC-Niederschlagspalette
 * (gespiegelt aus radar/radarModel.ts: leicht→mäßig→stark→Starkregen). */
const RAIN_RAMP = ['rgba(150,200,245,0.92)', 'rgba(70,150,230,0.95)', 'rgba(60,200,120,1)', 'rgba(225,190,55,1)', 'rgba(238,120,40,1)'];
const rainColor = (t: number) => RAIN_RAMP[t < 0.2 ? 0 : t < 0.42 ? 1 : t < 0.66 ? 2 : t < 0.85 ? 3 : 4];
export const RadarDetail: IntroArt = ({ accent }) => (
  <DetailFrame accent={accent}>
    <g stroke="none">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const x = 70 + i * 22; const h = Math.max(4, 26 * Math.exp(-Math.pow((i - 3) / 2.4, 2)));
        return <rect key={i} x={x} y={60 - h} width="13" height={h} rx="2" fill={rainColor(h / 26)} />;
      })}
    </g>
    <line x1="20" y1="60" x2="300" y2="60" stroke={SAND2} strokeWidth="2" />
    {/* callout pill (ink, wie der Punkt-Streifen-Header) */}
    <g>
      <rect x="60" y="12" width="120" height="22" rx="11" fill={T_INK} stroke="none" />
      <text x="120" y="27" fontSize="10" fill="#fff" textAnchor="middle" stroke="none" fontWeight="600">Regen in 12 Min</text>
    </g>
    <text x="20" y="80" fontSize="9" fill={T_STONE} stroke="none">jetzt</text>
    <text x="300" y="80" fontSize="9" fill={T_STONE} textAnchor="end" stroke="none">+2 h</text>
  </DetailFrame>
);

/* route · Wegpunkt-Readout */
export const RouteDetail: IntroArt = ({ accent }) => (
  <DetailFrame accent={accent}>
    <rect x="20" y="20" width="280" height="56" rx="12" fill="#fff" stroke={SAND2} strokeWidth="1.5" />
    <text x="36" y="44" fontSize="11" fill={T_INK} stroke="none" fontWeight="600">km 24</text>
    <text x="36" y="62" fontSize="9" fill={T_STONE} stroke="none">10:30 Uhr</text>
    {/* wind arrow */}
    <g transform="translate(150 48)" stroke="currentColor">
      <line x1="-12" y1="0" x2="12" y2="0" /><polyline points="6,-6 12,0 6,6" fill="none" />
    </g>
    <text x="150" y="68" fontSize="9" fill={T_STONE} textAnchor="middle" stroke="none">14 km/h</text>
    <text x="232" y="52" fontSize="15" fill="var(--terracotta-500)" stroke="none" fontWeight="600">12°</text>
    {/* rain */}
    <g transform="translate(280 40)" stroke="var(--steel-600)" strokeWidth="1.6">
      <line x1="-4" y1="0" x2="-6" y2="8" /><line x1="2" y1="0" x2="0" y2="8" />
    </g>
  </DetailFrame>
);

/* event · Ranking-Zeile mit Score */
export const EventDetail: IntroArt = ({ accent }) => (
  <DetailFrame accent={accent}>
    <rect x="20" y="20" width="280" height="56" rx="12" fill="#fff" stroke={SAND2} strokeWidth="1.5" />
    <circle cx="44" cy="48" r="12" fill="var(--sage-600)" stroke="none" />
    <text x="44" y="52" fontSize="11" fill="#fff" textAnchor="middle" stroke="none" fontWeight="700">1</text>
    <text x="66" y="44" fontSize="11" fill={T_INK} stroke="none" fontWeight="600">So, 14. Juni</text>
    <text x="66" y="61" fontSize="9" fill={T_STONE} stroke="none">trocken &amp; mild</text>
    <rect x="176" y="43" width="80" height="8" rx="4" fill={SAND2} stroke="none" />
    {/* Score ≥ 70 = „gut" → terracotta (wie scoreColor im Event-Ergebnis) */}
    <rect x="176" y="43" width="64" height="8" rx="4" fill="var(--terracotta-500)" stroke="none" />
    <text x="284" y="52" fontSize="14" fill="var(--terracotta-500)" textAnchor="end" stroke="none" fontWeight="600">82</text>
  </DetailFrame>
);

/* forecast · Wert mit Unsicherheitsband */
export const ForecastDetail: IntroArt = ({ accent }) => (
  <DetailFrame accent={accent}>
    <text x="20" y="50" fontSize="26" fill={T_INK} stroke="none" fontWeight="600">18°</text>
    <text x="74" y="50" fontSize="13" fill={T_STONE} stroke="none">± 1,2°</text>
    {/* spread band — Konsens/Konfidenz in sage (wie das Unsicherheitsband) */}
    <line x1="150" y1="40" x2="296" y2="40" stroke={SAND2} strokeWidth="6" strokeLinecap="round" />
    <line x1="196" y1="40" x2="250" y2="40" stroke="var(--sage-600)" strokeWidth="6" strokeLinecap="round" />
    <circle cx="223" cy="40" r="5" fill="#fff" stroke="var(--sage-600)" strokeWidth="2" />
    <text x="150" y="66" fontSize="9" fill={T_STONE} stroke="none">5 Modelle</text>
    <text x="296" y="66" fontSize="9" fill="var(--sage-600)" textAnchor="end" stroke="none" fontWeight="600">hohe Sicherheit</text>
  </DetailFrame>
);

/* globe · Dreh-Hinweis + Koordinaten */
export const GlobeDetail: IntroArt = ({ accent }) => (
  <DetailFrame accent={accent}>
    <g transform="translate(52 48)" stroke="currentColor">
      <path d="M -16 4 A 18 18 0 1 1 16 4" fill="none" />
      <polyline points="-19,-2 -16,5 -10,1" fill="none" />
    </g>
    <text x="92" y="44" fontSize="11" fill={T_INK} stroke="none" fontWeight="600">Ziehen zum Drehen</text>
    <g strokeWidth="1.5">
      <rect x="92" y="54" width="150" height="20" rx="10" fill="#fff" stroke={SAND2} />
      <text x="167" y="68" fontSize="10" fill={T_STONE} textAnchor="middle" stroke="none">47,3° N · 11,4° O</text>
    </g>
  </DetailFrame>
);

/* atmosphere · Linsen-Switcher (Föhn aktiv, wie LensSwitcher) + Inversionsmarke
 * + Höhen-Cap-Hinweis */
export const AtmosphereDetail: IntroArt = ({ accent }) => (
  <DetailFrame accent={accent}>
    <g strokeWidth="1.5">
      <rect x="18" y="12" width="58" height="22" rx="11" fill={T_INK} stroke="none" />
      <text x="47" y="27" fontSize="10" fill="#fff" textAnchor="middle" stroke="none">Föhn</text>
      <rect x="82" y="12" width="74" height="22" rx="11" fill="#fff" stroke={SAND2} />
      <text x="119" y="27" fontSize="10" fill={T_STONE} textAnchor="middle" stroke="none">Thermik</text>
      <rect x="162" y="12" width="92" height="22" rx="11" fill="#fff" stroke={SAND2} />
      <text x="208" y="27" fontSize="10" fill={T_STONE} textAnchor="middle" stroke="none">Querschnitt</text>
    </g>
    {/* height axis + mini temperature profile with inversion kink */}
    <line x1="24" y1="48" x2="24" y2="84" stroke={SAND2} strokeWidth="2" />
    <path d="M 44 82 L 32 68 L 50 58 L 36 48" stroke="currentColor" strokeWidth="2" fill="none" />
    <line x1="60" y1="60" x2="244" y2="60" stroke="currentColor" strokeDasharray="3 4" opacity="0.55" />
    <text x="244" y="56" fontSize="9" fill={T_STONE} textAnchor="end" stroke="none">Inversion 900 m</text>
    <text x="300" y="84" fontSize="9" fill={T_STONE} textAnchor="end" stroke="none">Cap 0–4000 m</text>
  </DetailFrame>
);

/* 8 · CTA — buscosun-Sonnenmarke + Vorwärtspfeil */
export const StartArt: IntroArt = ({ accent }) => (
  <Frame accent={accent}>
    <g transform="translate(132 100)" stroke="currentColor">
      <circle r="26" fill="#fff" />
      <g strokeWidth="2.4">
        <line x1="0" y1="-44" x2="0" y2="-34" /><line x1="0" y1="34" x2="0" y2="44" />
        <line x1="-44" y1="0" x2="-34" y2="0" /><line x1="34" y1="0" x2="44" y2="0" />
        <line x1="-31" y1="-31" x2="-24" y2="-24" /><line x1="24" y1="24" x2="31" y2="31" />
        <line x1="-31" y1="31" x2="-24" y2="24" /><line x1="24" y1="-24" x2="31" y2="-31" />
      </g>
    </g>
    <g transform="translate(196 100)" stroke="currentColor" strokeWidth="2.6">
      <line x1="-6" y1="0" x2="24" y2="0" />
      <polyline points="14,-10 24,0 14,10" fill="none" />
    </g>
  </Frame>
);
