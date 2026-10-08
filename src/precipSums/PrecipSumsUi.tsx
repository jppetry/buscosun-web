/**
 * Phase NS — Oberfläche der Niederschlagssummen im Regenradar (`audit/niederschlagssummen.md` §9.6):
 *   · `SumControls`  Dock „Darstellung": Intensität | Summe, darunter bei „Summe" Richtung und Fenster (Desktop-Dock und
 *                    Mobil-Reiter „Layer" — dieselbe Komponente, Klassen je Hülle).
 *   · `SumLegend`    Legende unten auf der Karte: mm-Stufen, Quelle und Stand, die Naht, Lücke und „mindestens".
 *   · `PointSumCard` Readout (mobil: „Schnellblick"): Gefallen | Erwartet für das gewählte Fenster + Balkenstreifen.
 * Command-Deck (Sand/Ink, League Spartan); Mobil nur über den Mobil-Breakpoint in `precipSums.css`.
 */
import type { ReactNode } from 'react';
import {
  SUM_WINDOWS_H, SUM_DIR_LABEL, SUM_LEGEND_MM, sumCss, fmtMeasuredMm, fmtExpectedMm, fmtHour, fmtRunUtc,
  type SumSelection, type SumWindowH,
} from './sumModel';
import type { SumMapInfo } from './useSumMap';
import type { PastSide, FutureSide } from './usePointSums';
import { kindsText } from './fusionWindowSum';
import './precipSums.css';

const H = 3_600_000;

// --- Dock -----------------------------------------------------------------------------------------

export function SumControls({ sel, onChange, variant }: { sel: SumSelection; onChange: (s: SumSelection) => void; variant: 'dock' | 'mobile' }) {
  const seg = variant === 'dock' ? 'rr-seg' : 'rm-seg';
  const btn = (active: boolean) => (variant === 'dock' ? `rr-seg-btn${active ? ' is-active' : ''}` : active ? 'is-active' : '');
  const eyebrow = variant === 'dock' ? 'rr-eyebrow' : 'rm-seclabel';
  return (
    <div className={`ns-controls ns-controls--${variant}`}>
      <span className={eyebrow}>Darstellung</span>
      <div className={seg} role="tablist" aria-label="Darstellung">
        <button type="button" role="tab" aria-selected={sel.mode === 'intensity'} className={btn(sel.mode === 'intensity')} onClick={() => onChange({ ...sel, mode: 'intensity' })} title="Momentane Intensität in mm/h">Intensität</button>
        <button type="button" role="tab" aria-selected={sel.mode === 'sum'} className={btn(sel.mode === 'sum')} onClick={() => onChange({ ...sel, mode: 'sum' })} title="Niederschlagssumme in mm über ein Fenster">Summe</button>
      </div>
      {sel.mode === 'sum' && (
        <div className="ns-subsegs">
          <div className="ns-miniseg" role="tablist" aria-label="Richtung">
            {(['past', 'future'] as const).map((d) => (
              <button key={d} type="button" role="tab" aria-selected={sel.dir === d} className={sel.dir === d ? 'is-active' : ''} onClick={() => onChange({ ...sel, dir: d })}
                title={d === 'past' ? 'Gemessen — nur Messwerte' : 'Erwartet — buscosun Fusion, Erwartungswert'}>{SUM_DIR_LABEL[d]}</button>
            ))}
          </div>
          <div className="ns-miniseg ns-miniseg--win" role="tablist" aria-label="Fenster">
            {SUM_WINDOWS_H.map((w) => (
              <button key={w} type="button" role="tab" aria-selected={sel.windowH === w} className={sel.windowH === w ? 'is-active' : ''} onClick={() => onChange({ ...sel, windowH: w as SumWindowH })}>{w} h</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Legende --------------------------------------------------------------------------------------

function legendSource(info: SumMapInfo): ReactNode[] {
  const lines: ReactNode[] = [];
  if (info.dir === 'past') {
    if (info.stationNote) lines.push(<span key="n">{info.stationNote}</span>);
    else lines.push(<span key="st">Punkte: {info.stations} Stationen DWD · GeoSphere · MeteoSchweiz{info.stationsEndMs ? <> · Stand {fmtHour(info.stationsEndMs)}</> : null}</span>);
    lines.push(<span key="area">Fläche: amtliche Radar-Summen (DWD RW, CombiPrecip, INCA) noch nicht angebunden</span>);
    return lines;
  }
  const hOf = (ms: number) => String(Math.round(((ms - info.nowMs) / H) * 2) / 2).replace('.', ',');
  // Je Quelle ihre eigene Spanne (RADOLAN-RV 2 h, INCA 3 h) — nie zu einer Zahl zusammengezogen.
  const radarTxt = info.radar.map((r) => `${r.label} 0–${hOf(r.toMs)} h`).join(' · ');
  const f = info.field[0];
  const fusion = f ? `${f.fusionName ?? 'buscosun Fusion'} · Modell · Cube · ${fmtRunUtc(f.runAtMs)}` : null;
  const winEnd = info.nowMs + info.windowH * H;
  const radarCovers = info.radar.length > 0 && info.radar.every((r) => r.toMs >= winEnd - 60_000);
  if (radarCovers) {
    lines.push(<span key="r">Radar-Nowcast {info.radar.map((r) => (r.runAtMs != null ? `${r.label} · Lauf ${fmtHour(r.runAtMs)}` : r.label)).join(' · ')}</span>);
    lines.push(<span key="ch">CH ohne Radar-Nowcast: {fusion ?? 'Kartenfeld mit Erwartungssumme fehlt'}</span>);
  } else if (fusion) {
    lines.push(<span key="seam">{radarTxt ? <>{radarTxt} · danach </> : null}{fusion}</span>);
  } else {
    lines.push(<span key="r">{radarTxt ? <>{radarTxt} · </> : null}danach fehlt das Kartenfeld mit Erwartungssumme ⇒ Lücke</span>);
  }
  for (const n of info.fieldNotes) lines.push(<span key={n} className="ns-legend-note">{n}</span>);
  lines.push(<span key="exp" className="ns-legend-note">Erwartungswert, ohne Spanne · Radar unter 0,08 mm/h nicht erfasst</span>);
  return lines;
}

export function SumLegend({ info, sel }: { info: SumMapInfo; sel: SumSelection }) {
  // Titel aus der Auswahl (nicht aus dem letzten Ergebnis) — vor der ersten Rechnung steht „wird berechnet".
  const title = `${sel.dir === 'past' ? 'Gefallen · letzte' : 'Erwartet · nächste'} ${sel.windowH} h`;
  const current = info.status === 'ready' && info.dir === sel.dir && info.windowH === sel.windowH;
  return (
    <div className="ns-legend" role="note" aria-label={`Legende Niederschlagssumme, ${title}`}>
      <div className="ns-legend-head"><b>Niederschlagssumme</b> · {title}</div>
      <div className="ns-legend-scale">
        {SUM_LEGEND_MM.map((mm) => (
          <span key={mm} className="ns-legend-step"><i style={{ background: sumCss(mm) }} />{String(mm).replace('.', ',')}</span>
        ))}
        <span className="ns-legend-unit">mm</span>
      </div>
      <div className="ns-legend-keys">
        <span className="ns-legend-key"><i className="ns-hatch" /> keine Daten</span>
        {current && info.stats && info.stats.saturated > 0 && <span className="ns-legend-key"><i className="ns-dots" /> mindestens (Radar gesättigt)</span>}
        {sel.dir === 'past' && <span className="ns-legend-key"><i className="ns-stdot" /> Station, 0 mm = weiß</span>}
      </div>
      <div className="ns-legend-src">
        {info.status === 'error' ? <span>⚠ {info.error}</span> : current ? legendSource(info) : <span>wird berechnet …</span>}
      </div>
    </div>
  );
}

// --- Karte am Ort -----------------------------------------------------------------------------------

/** „etwa 3 mm" / „Teilsumme 1,6 mm" — das Wort klein vor der Zahl, die Zahl bricht nie um. */
function Val({ text, partial }: { text: string; partial?: boolean }) {
  const m = /^(etwa|kaum) (.*)$/.exec(text);
  const pre = [partial ? 'Teilsumme' : null, m ? m[1] : null].filter(Boolean).join(' ');
  return <>{pre && <span className="ns-card-pre">{pre} </span>}<span className="ns-card-num">{m ? m[2] : text}</span></>;
}

function Strip({ past, future, windowH }: { past: PastSide; future: FutureSide; windowH: number }) {
  const pb = past.bars, fb = future.bars;
  const vals = [...pb.map((b) => b.mm ?? 0), ...fb.map((b) => Math.max(b.mm ?? 0, b.range?.[1] ?? 0))];
  const top = Math.max(0.5, ...vals);
  const W = 300, Hh = 46, mid = W / 2, gap = 4;
  const half = mid - gap;
  const nP = Math.max(1, pb.length), nF = Math.max(1, fb.length);
  const wP = half / nP, wF = half / nF;
  const y = (mm: number) => Hh - 2 - (Hh - 8) * Math.min(1, mm / top);
  return (
    <svg className="ns-strip" viewBox={`0 0 ${W} ${Hh + 14}`} role="img"
      aria-label={`Balken: gemessen letzte ${windowH} h links, erwartet nächste ${windowH} h rechts`}>
      <line x1="0" x2={W} y1={Hh - 1.5} y2={Hh - 1.5} className="ns-strip-base" />
      {pb.map((b, i) => b.mm == null
        ? <rect key={`p${i}`} x={i * wP + 0.5} y={Hh - 5} width={Math.max(1, wP - 1)} height={3} className="ns-strip-gap" />
        : <rect key={`p${i}`} x={i * wP + 0.5} y={y(b.mm)} width={Math.max(1, wP - 1)} height={Math.max(0, Hh - 1.5 - y(b.mm))} className="ns-strip-meas" />)}
      {past.status === 'gap' && <rect x={0} y={Hh - 5} width={half} height={3} className="ns-strip-gap" />}
      {fb.map((b, i) => {
        const x = mid + gap + i * wF;
        if (b.mm == null) return <rect key={`f${i}`} x={x + 0.5} y={Hh - 5} width={Math.max(1, wF - 1)} height={3} className="ns-strip-gap" />;
        return (
          <g key={`f${i}`}>
            <rect x={x + 0.5} y={y(b.mm)} width={Math.max(1, wF - 1)} height={Math.max(0, Hh - 1.5 - y(b.mm))} className={`ns-strip-exp${b.kinds.includes('radar') ? ' is-radar' : ''}`} />
            {b.range && b.range[1] > b.range[0] && <line x1={x + wF / 2} x2={x + wF / 2} y1={y(b.range[1])} y2={y(b.range[0])} className="ns-strip-range" />}
          </g>
        );
      })}
      <line x1={mid} x2={mid} y1={2} y2={Hh} className="ns-strip-now" />
      <text x={mid} y={Hh + 11} textAnchor="middle" className="ns-strip-lbl ns-strip-lbl--now">Jetzt</text>
      <text x={1} y={Hh + 11} className="ns-strip-lbl">−{windowH} h</text>
      <text x={W - 1} y={Hh + 11} textAnchor="end" className="ns-strip-lbl">+{windowH} h</text>
    </svg>
  );
}

export function PointSumCard({ past, future, windowH }: { past: PastSide; future: FutureSide; windowH: number }) {
  // Gefallen
  let pastVal: ReactNode, pastSub: ReactNode;
  if (past.status === 'loading') { pastVal = '…'; pastSub = 'Stationen werden gelesen'; }
  else if (past.status === 'ready' && past.sum) {
    pastVal = <Val text={fmtMeasuredMm(past.sum.mm)} partial={!past.sum.complete} />;
    pastSub = <>{past.station?.station.name} · {past.station ? `${past.station.distKm.toFixed(1).replace('.', ',')} km` : ''} · Stand {fmtHour(past.sum.endMs)}{past.reason ? <><br />{past.reason}</> : null}</>;
  } else { pastVal = 'Lücke'; pastSub = past.reason ?? 'keine Messung'; }
  // Erwartet
  let futVal: ReactNode, futSub: ReactNode;
  if (future.status === 'loading') { futVal = '…'; futSub = 'buscosun Fusion rechnet'; }
  else if (future.origin === 'fusion' && future.sum) {
    futVal = <Val text={fmtExpectedMm(future.sum.mm)} partial={!future.sum.complete} />;
    const how = kindsText(future.sum);
    futSub = <><b>{future.fusionName}</b>{how ? <> · {how}</> : null}{future.reason ? <><br />{future.reason}</> : null}</>;
  } else if (future.origin === 'radar' && future.radar) {
    futVal = <Val text={fmtExpectedMm(future.radar.mm)} partial={!future.radar.complete} />;
    futSub = <><b>nur Radar-Nowcast</b> · {future.reason}</>;
  } else { futVal = 'Lücke'; futSub = future.reason ?? 'keine Vorhersage'; }
  return (
    <div className="rt-card ns-card" aria-label={`Niederschlagssumme ${windowH} Stunden`}>
      <div className="ns-card-cols">
        <div className="ns-card-col">
          <div className="ns-card-label">Gefallen · letzte {windowH} h</div>
          <div className={`ns-card-val${past.status === 'ready' ? '' : ' is-muted'}`}>{pastVal}</div>
          <div className="ns-card-sub">{pastSub}</div>
        </div>
        <div className="ns-card-col ns-card-col--exp">
          <div className="ns-card-label">Erwartet · nächste {windowH} h</div>
          <div className={`ns-card-val${future.status === 'ready' ? '' : ' is-muted'}`} title="Erwartungswert; eine Spanne der Summe folgt erst, wenn die Abhängigkeit der Stunden gemessen ist">{futVal}</div>
          <div className="ns-card-sub">{futSub}</div>
        </div>
      </div>
      <Strip past={past} future={future} windowH={windowH} />
      <div className="ns-card-foot">gemessen gefüllt · erwartet hell{future.bars.some((b) => b.range) ? ' · Strich = Spanne der Stunde (p10–p90)' : ''}</div>
    </div>
  );
}
