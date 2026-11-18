/**
 * Phase ST — the surface current at the spot (`audit/seewetter-stroemung.md`, contract `seaCurrent.ts`).
 *
 * One mark carries the feature: the DRIFT ARROW — a float (dot) and where it goes. Currents are named by the direction
 * they set TOWARDS, wind and waves on this page by where they come FROM; the dot at the tail keeps the two apart in the
 * hour band, in the dial and on the map without a third colour.
 *
 * The dial draws the hour's two real vectors: the wind arriving at the centre from its bearing, the current leaving the
 * centre towards its own. Head against head is "Wind gegen Strom" — a neutral note with its thresholds, never a warning:
 * it changes no wave value and no class (CWAM already computes with the current).
 */
import { compass16, dayShort, f1, hh, hm } from './seaView';
import {
  BSH_CURRENT_CHANGED, BSH_CURRENT_CREDIT, BSH_CURRENT_LICENCE, BSH_CURRENT_LICENCE_URL, BSH_CURRENT_PACKAGES, BSH_CURRENT_PAGE,
  SEA_CURRENT_MODEL_NOTE, SEA_CURRENT_WATT_NOTE, WAC_NEUTRAL_NOTE, WAC_RULE_NOTE, WAC_TITLE, wacSentence, type SeaCurrentView,
} from './seaCurrent';

/** Below this the direction of a current is not read out (`set`: 0.1 kn — the arrow would point at noise). */
export const CURRENT_DIR_MIN_KN = 0.1;
export const SLACK_NOTE = 'Stauwasser: der schwächste Strom, um den er kentert — aus den 15-Minuten-Schritten des Modells gelesen (eigene Regel).';

/** Float and heading. `to` = the bearing the current sets towards; `null` draws nothing but a dash. */
export function DriftArrow({ to, size = 14, className }: { to: number | null; size?: number; className?: string }) {
  if (to == null) return <span className="sw-band-none">–</span>;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <g transform={`rotate(${to} 7 7)`}><path d="M7 9V2M3.8 5.2 7 2l3.2 3.2" /><circle cx="7" cy="11.6" r="1.5" fill="currentColor" stroke="none" /></g>
    </svg>
  );
}

/** The hour's wind (arrives at the centre) and current (leaves it), true to bearing; north is up. */
function CurrentDial({ windFrom, curTo, against, label }: { windFrom: number | null; curTo: number | null; against: boolean; label: string }) {
  return (
    <svg className={`sw-st-dial${against ? ' is-against' : ''}`} viewBox="-50 -50 100 100" role="img" aria-label={label}>
      <circle r="44" className="sw-st-dial-ring" />
      {[0, 90, 180, 270].map((a) => <path key={a} className="sw-st-dial-tick" transform={`rotate(${a})`} d="M0 -44v6" />)}
      <text className="sw-st-dial-n" y="-28" textAnchor="middle">N</text>
      {windFrom != null && (
        <g className="sw-st-dial-wind" transform={`rotate(${windFrom})`}>
          <path d="M0 -40V-9M-5.5 -15.5 0 -9l5.5 -6.5" />
        </g>
      )}
      {curTo != null && (
        <g className="sw-st-dial-cur" transform={`rotate(${curTo})`}>
          <path d="M0 -2V-33M-5.5 -26.5 0 -33l5.5 6.5" />
        </g>
      )}
      <circle r="4" className="sw-st-dial-float" />
    </svg>
  );
}

const runText = (run: string) => `${run.slice(6, 8)}.${run.slice(4, 6)}., ${run.slice(8, 10)} UTC`;

interface PanelProps {
  view: SeaCurrentView;
  /** The chosen hour (ms) and its wind — the dial and the hint read them. */
  tMs: number;
  windFrom: number | null; windKn: number | null;
  /** Wadden-sea spot: tidal channels are not resolved. */
  tidal: boolean;
}

/** The card of the section „Strömung“: value, direction, next slack water, cell — and the note „Wind gegen Strom“. */
export default function SeaCurrentPanel({ view: v, tMs, windFrom, windKn, tidal }: PanelProps) {
  const source = (
    <p className="sw-disclaimer sw-st-src">
      {BSH_CURRENT_CREDIT}, <a href={BSH_CURRENT_LICENCE_URL} target="_blank" rel="noreferrer">{BSH_CURRENT_LICENCE}</a>, verändert: {BSH_CURRENT_CHANGED}.{' '}
      <a href={BSH_CURRENT_PAGE} target="_blank" rel="noreferrer">Strömungsvorhersage beim BSH</a>
    </p>
  );
  const note = <p className="sw-note sw-st-note">{SEA_CURRENT_MODEL_NOTE}.{tidal ? ` ${SEA_CURRENT_WATT_NOTE}` : ''}</p>;
  if (v.state !== 'ok') {
    return (
      <section className="sw-card is-cream is-wide sw-st" aria-label="Strömung am Spot">
        <div className="sw-st-empty">
          <strong>{v.state === 'loading' ? 'Strömung lädt …' : 'Keine Daten.'}</strong>
          {v.state === 'none' && <span>{v.why}</span>}
        </div>
        {note}
        {source}
      </section>
    );
  }
  const hasDir = v.kn != null && v.kn >= CURRENT_DIR_MIN_KN && v.to != null;
  const when = `${dayShort(tMs)} ${hh(tMs)} Uhr`;
  const gapText = v.gap === 'dry' ? 'In dieser Stunde führt die Modellzelle keinen Strom (im Modell ohne Wasser oder ohne Durchfluss).'
    : v.gap === 'beyond' && v.until != null ? `Die Vorhersage des BSH reicht bis ${dayShort(v.until)} ${hh(v.until)} Uhr — für die gewählte Stunde gibt es keinen Wert.`
      : v.gap === 'before' && v.from != null ? `Die Vorhersage des BSH beginnt ${dayShort(v.from)} ${hh(v.from)} Uhr — für die gewählte Stunde gibt es keinen Wert.` : null;
  const dialLabel = v.kn == null ? `Kein Strömungswert für ${when}`
    : `Strom ${f1(v.kn)} Knoten${hasDir ? `, setzt nach ${compass16(v.to)}` : ''}${windFrom != null ? `; Wind aus ${compass16(windFrom)}` : ''}`;
  return (
    <section className="sw-card is-cream is-wide sw-st" aria-label="Strömung am Spot">
      <div className="sw-st-main">
        <CurrentDial windFrom={windFrom} curTo={hasDir ? v.to : null} against={v.wac.against} label={dialLabel} />
        <div className="sw-st-now">
          <span className="sw-st-when">Strom {when}</span>
          {v.kn == null
            ? <strong className="sw-st-val is-text">{v.gap === 'dry' ? 'kein Strom' : 'keine Daten'}</strong>
            : <strong className="sw-st-val">{f1(v.kn)}<span>kn</span></strong>}
          <span className="sw-st-dir">
            {v.kn == null ? gapText : hasDir ? `setzt nach ${compass16(v.to)} (${Math.round(v.to as number)}°)` : 'so schwach, dass die Richtung nichts aussagt'}
          </span>
          <span className="sw-st-key"><i className="is-cur" />Strom: wohin er setzt<i className="is-wind" />Wind: woher er kommt</span>
        </div>
        <dl className="sw-st-facts">
          <div><dt>Nächstes Stauwasser</dt><dd>{v.nextSlack != null ? `${dayShort(v.nextSlack)} ${hm(v.nextSlack)} Uhr` : 'im Rest des Laufs keines erkannt'}</dd></div>
          <div><dt>Modellzelle</dt><dd>{v.km != null ? `${f1(v.km)} km vom Spot` : '–'}{v.pkg ? `, Gebiet ${BSH_CURRENT_PACKAGES[v.pkg].label}` : ''}</dd></div>
          <div><dt>Lauf des BSH</dt><dd>{v.run ? runText(v.run) : '–'}{v.until != null ? `, reicht bis ${dayShort(v.until)} ${hh(v.until)} Uhr` : ''}</dd></div>
          {v.dry != null && v.dry >= 0.05 && <div><dt>Ohne Strom</dt><dd>in {Math.round(v.dry * 100)} % der Zeit dieses Laufs (Zelle fällt im Modell trocken)</dd></div>}
        </dl>
      </div>
      {v.wac.against && v.kn != null && v.to != null && windFrom != null && windKn != null && v.wac.angle != null && (
        <div className="sw-st-wac" role="note" aria-label={WAC_TITLE}>
          <strong>{WAC_TITLE}</strong>
          <p>{wacSentence(compass16(windFrom), windKn, compass16(v.to), v.kn, v.wac.angle)}</p>
          <p className="sw-st-wac-quiet">{WAC_NEUTRAL_NOTE} {WAC_RULE_NOTE}</p>
        </div>
      )}
      {note}
      <p className="sw-note sw-st-note">{SLACK_NOTE}</p>
      {source}
    </section>
  );
}
