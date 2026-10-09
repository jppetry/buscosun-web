/**
 * Phase SK: legend of the snow cap on the map, the place card with the 48-h bar and the 3D tap card. Command-Deck look
 * (Sand/Ink, League Spartan), classes `sk-*` in `snowCap.css`. Imports the computing part only as types.
 */
import type { SnowCapInfo, SnowCapPoint } from './snowCapEngine';
import { PHASE_WORD_SK, SK_LINE_COLOR, fmtMeters, fmtSnowLine } from './snowCapModel';
import './snowCap.css';

const fmtRun = (ms: number) => `${String(new Date(ms).getUTCHours()).padStart(2, '0')} UTC`;
const FMT_T = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtT = (ms: number) => FMT_T.format(ms).replace('.', '');

/** One status sentence of the cap: source, run, validity, wet source — or why there is no tint. */
function capStatus(info: SnowCapInfo): { text: string; warn: boolean } | null {
  const wetText = info.wet === 'radar' ? 'Radar' : info.wet === 'mixed' ? 'Radar, sonst Regenchance des Felds' : info.wet === 'field' ? 'Regenchance des Felds' : 'ohne Niederschlagsangabe';
  if (info.status === 'loading') return { text: 'Schneefallgrenze lädt …', warn: false };
  if (info.status === 'error') return { text: `Schneefallgrenze nicht verfügbar (${info.error})`, warn: true };
  if (info.status !== 'ready') return null;
  if (!info.field) return { text: `Keine Tönung: ${info.notes[info.notes.length - 1] ?? 'keine Daten'}`, warn: true };
  const gap = info.gapShare != null && info.gapShare > 0.02 ? ` · ohne Tönung, wo das Feld keine Grenze führt (${Math.round(info.gapShare * 100)} % der Zellen)` : '';
  return {
    text: `${info.field.fusionName ?? 'buscosun Fusion'} · Modell · Cube · Lauf ${fmtRun(info.field.runAtMs)}${info.validMs != null ? ` · gültig ${fmtT(info.validMs)}` : ''} · kräftig, wo es niederschlägt (${wetText}) · Spanne der Modelle, unkalibriert${gap}`,
    warn: false,
  };
}

/**
 * Legend of the cap. Desktop: items inside the radar legend at the bottom (`inline`, no extra box over the notes at the
 * top); mobile (map legends hidden there): only the status sentence as a compact note (`note`), so "no data" is said.
 */
export function SnowCapLegend({ info, variant }: { info: SnowCapInfo; variant: 'inline' | 'note' }) {
  const st = capStatus(info);
  if (variant === 'note') {
    return st ? <div className={`nc-radar-snownote sk-legend-m${st.warn ? ' sk-warn' : ''}`} role="note">❄ {st.text}</div> : null;
  }
  return (
    <>
      <span className="nc-radar-leg-item sk-leg"><i className="sk-sw sk-sw-cap" /> Schneefall oberhalb der Grenze</span>
      <span className="nc-radar-leg-item sk-leg"><i className="sk-sw sk-sw-band" /> Spanne p10–p90</span>
      <span className="nc-radar-leg-item sk-leg"><i className="sk-sw sk-sw-line" style={{ background: SK_LINE_COLOR }} /> Schneefallgrenze</span>
      {st && <span className={`nc-radar-leg-item sk-leg sk-leg-status${st.warn ? ' sk-warn' : ''}`}>{st.text}</span>}
    </>
  );
}

/** The 3D tap card: height, snowline with span, phase at that height. */
export function snowTapHtml(at: SnowCapPoint | null): string | null {
  if (!at) return null;
  const h = at.h != null ? `Höhe ${fmtMeters(at.h)} m` : 'Höhe unbekannt';
  return `<div class="sk-tap"><b>${h}</b><br>${fmtSnowLine(at.mid, at.half)}<br>${at.phase ? PHASE_WORD_SK[at.phase] : '—'}<br><span>buscosun Fusion · Modell · Cube</span></div>`;
}
