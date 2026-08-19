/**
 * Layer-Info-Panel — erklärt einen Wetter-Layer in der buscosun-Designsprache
 * (Eyebrow → leichter Titel → Beschreibung, cream-Karte, Akzent je Layer; vgl.
 * Intro/00-design-system.svg) und zeigt eine passende Legende (Farbskala, Linie
 * oder Symbol).
 *
 * Seit Phase KD-R (2026-08-01, audit/karten-readout.md) rendert das Panel auf
 * Desktop/Tablet in der Readout-Spalte am rechten Rand statt als Hover-Overlay
 * über der Karte. Die Positionierung kommt vom Aufrufer (`style`) bzw. aus dem
 * Readout-CSS — das Markup ist unverändert, damit die Inhalte identisch bleiben.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { LayerKey } from '../MapView';

interface Info {
  eyebrow: string;
  title: string;
  accent: string;
  desc: string;
  source?: string;
  legend: ReactNode;
  /** ML-Layer: kurzer Güte-Hinweis + Verweis auf die Live-Validierungs-Seite (P2-1). */
  trust?: string;
}

function Bar({ css }: { css: string }) {
  return <div className="li-bar" style={{ background: css }} />;
}
function Scale({ from, to }: { from: string; to: string }) {
  return <div className="li-scale"><span>{from}</span><span>{to}</span></div>;
}
function Row({ swatch, label }: { swatch: ReactNode; label: string }) {
  return <div className="li-row">{swatch}<span>{label}</span></div>;
}

/* Repräsentative Skalen (gespiegelt aus den Karten-Paletten / Intro). */
const PRECIP = 'linear-gradient(90deg, rgba(150,200,245,.95), rgba(70,150,230,1), rgba(60,200,120,1), rgba(225,190,55,1), rgba(238,120,40,1))';
const WIND = 'linear-gradient(90deg,#e8f0fa,#9ec5e5,#7A9466,#e0c85c,#d77a3b,#b5483d)';
const TEMP = 'linear-gradient(90deg,#3a6fa8,#6da3d3,#7A9466,#e6cf6a,#D4A373,#C97B47,#b5483d)';
const CLOUD = 'linear-gradient(90deg,#f5f1e8,#cdd2d8,#8a93a0,#4f5560)';
const PROB = 'linear-gradient(90deg, rgb(190,214,255), rgb(122,170,250), rgb(74,120,228), rgb(112,70,198), rgb(86,28,138))';
const SAT = 'linear-gradient(90deg,#2c2a26,#7d7a72,#efe9dd)';
const THUNDER = 'linear-gradient(90deg, rgb(247,224,88), rgb(245,182,66), rgb(238,124,44), rgb(206,52,52), rgb(150,30,110))';
const LPI = 'linear-gradient(90deg, rgb(255,238,120), rgb(255,176,48), rgb(240,86,60), rgb(214,40,120), rgb(150,40,200))';
const SNOW = 'linear-gradient(90deg, rgb(224,238,253), rgb(172,207,244), rgb(120,166,230), rgb(92,120,210), rgb(70,96,190))';
const ROTATION = 'linear-gradient(90deg, rgb(158,148,180), rgb(130,112,168), rgb(104,80,148), rgb(78,52,116), rgb(52,32,80))';
const CELLS = 'linear-gradient(90deg, rgb(201,162,39), rgb(224,138,46), rgb(201,82,46), rgb(143,33,64))';
const HAIL = 'linear-gradient(90deg, rgb(150,205,235), rgb(90,190,190), rgb(235,175,60), rgb(205,75,55), rgb(140,45,120))';
/** Die vier DWD-Warnstufen. Gelb und Orange sind die an der echten CAP-Meldung
 *  gemessenen amtlichen `AREA_COLOR`-Werte (`audit/wetterwarnungen.md` §5.1);
 *  Rot und Dunkelrot stammen aus der im Repo dokumentierten Staffelung
 *  (`sources/dwdAlerts.ts:146`) und sind nicht an Daten gemessen. Auf der KARTE
 *  spielt das keine Rolle — dort gilt immer die Farbe aus der Meldung selbst. */
const WARNINGS = 'linear-gradient(90deg, rgb(255,235,59), rgb(251,140,0), rgb(204,0,0), rgb(126,0,40))';

const LAYER_INFO: Record<LayerKey, Info> = {
  wind: {
    eyebrow: 'Wind', title: 'Wind', accent: '--steel-600',
    desc: 'Windrichtung und -geschwindigkeit in 10 m Höhe als animierte Partikel über einer Geschwindigkeits-Heatmap.',
    source: 'DWD ICON-D2 · 2,2 km',
    legend: <><Bar css={WIND} /><Scale from="schwach" to="Sturm" /></>,
  },
  gust: {
    eyebrow: 'Wind', title: 'Böen', accent: '--steel-600',
    desc: 'Spitzenböen der nächsten 24 Stunden — sicherheitsrelevant für Drohne, Kran und Höhenarbeit.',
    source: 'DWD ICON-D2 · vmax_10m',
    legend: <><Bar css={WIND} /><Scale from="ruhig" to="orkanartig" /></>,
  },
  nowcast: {
    eyebrow: 'Niederschlag', title: 'Niederschlag · jetzt–2 h', accent: '--steel-600',
    desc: 'Gemessenes Radar/Nowcast über den Zeit-Slider, per Land bis zum Nowcast-Horizont: DE RADOLAN-RV (bis 2 h), AT GeoSphere INCA (bis 3 h), CH MeteoSchweiz. Bewusst kurz & ehrlich — nur die gemessene Nahbereichs-Vorhersage, keine Modell-Extrapolation darüber hinaus.',
    source: 'RADOLAN-RV · INCA · MeteoSchweiz',
    legend: <><Bar css={PRECIP} /><Scale from="leicht" to="Starkregen" /></>,
  },
  temp: {
    eyebrow: 'Temperatur', title: 'Temperatur', accent: '--terracotta-500',
    desc: '2-m-Lufttemperatur, höhenkorrigiert auf das echte Gelände.',
    source: 'DWD ICON-D2 · t_2m · 2,2 km',
    legend: <><Bar css={TEMP} /><Scale from="kalt" to="heiß" /></>,
  },
  clouds: {
    eyebrow: 'Bewölkung', title: 'Wolken', accent: '--slate-500',
    desc: 'Bewölkungsgrad, geschichtet aus tiefen, mittleren und hohen Wolken.',
    source: 'DWD ICON-D2 · 0–12 h',
    legend: <><Bar css={CLOUD} /><Scale from="klar" to="bedeckt" /></>,
  },
  sat: {
    eyebrow: 'Satellit', title: 'Satellit', accent: '--slate-500',
    desc: 'Meteosat-Satellitenbild — Wolken aus dem All, alle 3 Stunden aktualisiert.',
    source: 'DWD OpenData',
    legend: <><Bar css={SAT} /><Scale from="klar" to="Wolken" /></>,
  },
  thunder: {
    eyebrow: 'Gewitter', title: 'Gewitterpotenzial', accent: '--amber-500',
    desc: 'Fusion aus CAPE (Energie) × CIN (Deckel) × LPI (Blitzbereitschaft): flächige Vorwarnung 0–12 h vor dem ersten Radarecho. Ehrlich: nur naher Horizont, am Modellrand ohne Wert, Potenzial ≠ Auslösung.',
    source: 'DWD ICON-D2 · cape_ml·cin_ml·lpi · 2,2 km',
    legend: <><Bar css={THUNDER} /><Scale from="gering" to="extrem" /></>,
  },
  lightning: {
    eyebrow: 'Gewitter', title: 'Blitze', accent: '--amber-500',
    desc: 'Blitzortung der letzten 60 Minuten aus dem DWD-Sferics-Netz.',
    source: 'DWD Sferics',
    legend: <Row swatch={<i className="li-bolt" />} label="Blitz der letzten 60 Min" />,
  },
  lightningfc: {
    eyebrow: 'Gewitter', title: 'Blitzprognose', accent: '--violet-600',
    desc: 'Prognostiziertes Blitzrisiko aus dem ICON-D2 Lightning Potential Index (lpi_max), über den Slider 0–12 h in die Zukunft. Prognose ≠ Messung — die gemessenen Einschläge der letzten Stunde zeigt „Blitze". Ehrlich: nur naher Horizont, am Modellrand ohne Wert.',
    source: 'DWD ICON-D2 · lpi_max · 2,2 km',
    legend: <><Bar css={LPI} /><Scale from="gering" to="extrem" /></>,
  },
  snow: {
    eyebrow: 'Niederschlag', title: 'Schnee', accent: '--steel-600',
    desc: 'Schneemenge als Fläche (cm): „Schneedecke" = aktuelle Höhe (ICON-D2 h_snow), „Neuschnee" = Zuwachs über das Vorhersagefenster (snow_gsp+snow_con → cm). Modus im Layer umschaltbar. Die Menge — NICHT die Schneegrenzen-Linie (das ist „Schneegrenze"). Modell, keine Messung; am Modellrand ohne Wert; Schnee-Wasser-Verhältnis ist eine Näherung.',
    source: 'DWD ICON-D2 · h_snow · snow_gsp · 2,2 km',
    legend: <><Bar css={SNOW} /><Scale from="~1 cm" to="viel" /></>,
  },
  rotation: {
    eyebrow: 'Gewitter · Experten', title: 'Rotationspotenzial', accent: '--violet-600',
    desc: 'Geglättete Modell-VERDACHTSflächen für rotierende Aufwinde/Superzellen aus ICON-D2 Updraft-Helicity (uh_max + uh_max_low) und Supercell-Index (sdi_2), 0–12 h. KEIN amtliches Warnprodukt, kein Warnersatz — maßgeblich sind die DWD-Warnungen. Verdacht ≠ Ereignis, hohe Fehlalarmrate. Experten-/Nischensignal; am Modellrand ohne Wert.',
    source: 'DWD ICON-D2 · uh_max · uh_max_low · sdi_2 · 2,2 km',
    legend: <><Bar css={ROTATION} /><Scale from="gering" to="hoch" /></>,
  },
  hail: {
    eyebrow: 'Gewitter', title: 'Hagel', accent: '--violet-600',
    desc: 'Zwei amtliche Radarprodukte, bewusst nicht vermischt. FLÄCHE: MeteoSchweiz MESHS (maximal erwartete Korngröße) bzw. POH (Hagelwahrscheinlichkeit), 1 km / 5 Min, nur 1. April–30. September — aus dem Schweizer Radarverbund, dessen Reichweite über die Grenze nach Süddeutschland und Vorarlberg geht und dort ausdünnt. ZELLEN: DWD KONRAD3D — Zellen, in denen das Radar Hagel erkennt, mit Hagelfläche und Hinweis auf Großhagel; Zelle antippen für Details. Österreich hat keine eigene offene Hagelquelle — im Osten Österreichs gibt es daher keine Abdeckung; das heißt nicht, dass es dort nicht hagelt. Radarerkennung, keine Bodenmeldung; gilt für jetzt. KEIN amtliches Warnprodukt, kein Warnersatz — maßgeblich sind die Warnungen von DWD und MeteoSchweiz.',
    source: 'MeteoSchweiz MESHS/POH · DWD KONRAD3D',
    legend: <><Bar css={HAIL} /><Scale from="klein" to="Großhagel" /></>,
  },
  warnings: {
    eyebrow: 'Amtlich', title: 'Warnungen', accent: '--terracotta-500',
    desc: 'Die amtlichen Wetterwarnungen von DWD (Deutschland, CAP, landkreisgenau) und MeteoSchweiz (Schweiz, Warnregionen, über den MeteoAlarm-Feed), alle 5 Minuten — das amtliche Warnprodukt, auf das alle anderen Layer dieser Karte verweisen. Überschrift, Beschreibung und Handlungshinweis werden wortwörtlich übernommen. Die Flächenfarbe ist in Deutschland die amtliche Warnfarbe aus der Meldung selbst; der Schweizer Feed führt keine Farbe mit — dort ist sie aus der amtlichen Gefahrenstufe ABGELEITET und in der Legende so gekennzeichnet. Die Stufenskalen bleiben getrennt, weil die Nummern Verschiedenes bedeuten (DWD-Stufe 1 = gelb, Schweizer Stufe 1 = grün). Fläche antippen zeigt ALLE Warnungen dieses Ortes. Der Zeitregler wählt, was zur eingestellten Stunde gilt; Warnungen ohne festes Ende sind gekennzeichnet. Höhenbeschränkungen stehen bei deutschen Warnungen im Steckbrief („gilt nur unterhalb 600 m"), bei Schweizer Warnungen im amtlichen Text selbst. ÖSTERREICH fehlt weiterhin — dort warnt GeoSphere Austria; eine leere Fläche über Österreich heißt NICHT „keine Warnung". Fällt eine der beiden Quellen aus, benennt die Karte ausdrücklich, welches Land fehlt. Kein Ersatz für die amtliche Bekanntmachung: maßgeblich bleiben dwd.de/warnungen und meteoschweiz.admin.ch.',
    source: 'DWD CAP (DE) · MeteoSchweiz über MeteoAlarm (CH) · 5 min',
    // Die Balken-Skala zeigt die STEIGERUNG, nicht die Stufennamen eines
    // Dienstes: DWD und MeteoSchweiz benennen ihre Stufen verschieden, und die
    // Nummern sind nicht kompatibel. Die stufengenaue, je Land getrennte Skala
    // steht in der Kartenlegende — nur dort ist bekannt, welche Stufen
    // tatsächlich auf der Karte liegen.
    legend: <><Bar css={WARNINGS} /><Scale from="schwächste Stufe" to="höchste Stufe" /></>,
  },
  cells: {
    eyebrow: 'Gewitter', title: 'Zellbahnen', accent: '--terracotta-500',
    desc: 'Erkannte konvektive Zellen mit AMTLICHER Zugspur: Umriss (gemessen) + prognostizierte Spur und Unsicherheits-Trichter bis +60 Min, alle 5 Minuten neu. Der Trichter ist die amtliche Unsicherheitsellipse des DWD, keine eigene Schätzung. Zelle antippen für Zuggeschwindigkeit, Echotop und Hinweise auf Hagel/Böen/Starkregen. KEIN amtliches Warnprodukt, kein Warnersatz — maßgeblich sind die DWD-Warnungen. Abdeckung = Reichweite des deutschen Radarverbunds (reicht über die Grenze, dünnt dort aus).',
    source: 'DWD KONRAD3D · 5 min',
    legend: <><Bar css={CELLS} /><Scale from="schwach" to="kräftig" /></>,
  },
  stations: {
    eyebrow: 'Messnetz', title: 'Stationen', accent: '--sage-600',
    desc: 'Live-Messwerte echter Wetterstationen — antippen für die Detailwerte.',
    source: 'DWD · TAWES · SMN',
    legend: <Row swatch={<i className="li-pin" />} label="Wetterstation (Live)" />,
  },
  confidence: {
    eyebrow: 'KI · Modell', title: 'Sicherheit', accent: '--slate-500',
    desc: 'Vertrauens-Schleier: je dichter die Schraffur, desto unsicherer die Vorhersage.',
    source: 'Klima-MOS · 30 J. DWD-Klimatologie',
    legend: <><div className="li-bar li-hatch" /><Scale from="sicher" to="unsicher" /></>,
    trust: 'Reliability/Brier headless kalibriert · Seite „Validierung"',
  },
  snowline: {
    eyebrow: 'KI · Modell', title: 'Schneegrenze', accent: '--steel-600',
    desc: 'Schneefallgrenze: oberhalb der Linie fällt Niederschlag als Schnee.',
    source: 'ML #2 · höhenkorrigiert',
    legend: <Row swatch={<i className="li-snowline" />} label="Übergang Regen ↔ Schnee" />,
    trust: 'Höhenkalibriert; Frostgrenze ↔ Gelände · Seite „Validierung"',
  },
  flownowcast: {
    eyebrow: 'Niederschlag', title: 'Flow-Nowcast', accent: '--steel-600',
    desc: 'Extrapoliert das Radar per Bewegungsfeld 0–60 min in die Zukunft (nur DE).',
    source: 'RADOLAN-RV · Optical Flow',
    legend: <><Bar css={PRECIP} /><Scale from="leicht" to="Starkregen" /></>,
    trust: 'Live gegen späteres Radar geprüft: Brier · CSI · Reliability · Seite „Validierung"',
  },
  poprob: {
    eyebrow: 'Niederschlag', title: 'Regen-Chance', accent: '--steel-600',
    desc: 'Regenwahrscheinlichkeit aus einem 15-Member-Flow-Ensemble (nur DE, 0–60 min).',
    source: 'Flow-Ensemble',
    legend: <><Bar css={PROB} /><Scale from="0 %" to="100 %" /></>,
    trust: 'Live gegen späteres Radar geprüft: Brier · CSI · Reliability · Seite „Validierung"',
  },
};

export function LayerInfoPanel({ layer, style, suffix }: {
  layer: LayerKey;
  style?: CSSProperties;
  /** Dynamischer Titel-Zusatz (z. B. Schnee-Modus, „Sicherheit · Regen"). */
  suffix?: ReactNode;
}) {
  const info = LAYER_INFO[layer];
  if (!info) return null;
  return (
    <div className="layer-info" style={{ ['--li-accent']: `var(${info.accent})`, ...style } as CSSProperties} role="note">
      <span className="layer-info-eyebrow">{info.eyebrow}</span>
      <h3 className="layer-info-title">{info.title}{suffix && <span className="layer-info-suffix"> {suffix}</span>}</h3>
      <p className="layer-info-desc">{info.desc}</p>
      <div className="layer-info-legend">{info.legend}</div>
      {info.source && <span className="layer-info-src">{info.source}</span>}
      {info.trust && <span className="layer-info-trust">✓ {info.trust}</span>}
    </div>
  );
}
