/**
 * Phase SG — the card „Sicht" of the dossier (`audit/seewetter-sicht-konvektion.md`, logic `seaSight.ts`).
 *
 * Four statements of different standing, kept apart in that order: what a station MEASURED, what the Seewetterdienst
 * WROTE (verbatim, complete), what the model values HINT at for the chosen hour, and the shower/thunderstorm HINT with
 * its reach. Measurement and hint stand left and right of a seam (as in the water temperature card) and are never
 * merged into one number. Each part names its source; a part without data says "Keine Daten" and why.
 *
 * The one drawn element is the veil: the denser it is, the less a hint expects to see — the same three steps as the row
 * „Sicht" of the hour band. It uses no class colour: nothing here changes passt / knapp / außerhalb.
 */
import { visClassOfCode } from './seaContract';
import { DMI_CREDIT } from './seaDmi';
import { ConvMark } from './SeaBand';
import {
  CONV_LABEL, CONV_RULE, CONV_SOURCE, GUST_CONV_LEGEND, OFFICIAL_SOURCE, POI_SOURCE, SIGHT_HINT_NOTE, VIS_CHECK_NOTE, VIS_LABEL, VIS_REASON, VIS_RULE,
  convReachText, obsTimeText, visText, type SightConv, type SightHint, type SightObs, type SightOfficial,
} from './seaSight';
import { dateTime, dayShort, hh } from './seaView';

export interface SeaSightView {
  /** The chosen hour. */
  tMs: number; nowMs: number;
  station: { name: string; km: number; net: 'DWD' | 'DMI' } | null;
  obs: SightObs | null | 'loading';
  official: SightOfficial;
  hint: SightHint;
  conv: SightConv;
  /** Who computed the values the hint reads ("buscosun Fusion 14"). */
  engine: string;
}

/** The veil of a hint class — the mark shared with the hour band. */
function Veil({ cls }: { cls: 'gut' | 'eingeschraenkt' | 'nebel' | null }) {
  return <span className={`sw-sg-veil sw-sg-cell${cls ? ` is-${cls}` : ' is-hatched'}`} aria-hidden="true" />;
}

export default function SeaSightPanel({ view: v }: { view: SeaSightView }) {
  const when = `${dayShort(v.tMs)} ${hh(v.tMs)} Uhr`;
  const o = v.obs;
  const hintCls = visClassOfCode(v.hint.code);
  const reach = convReachText(v.conv);
  return (
    <section className="sw-card is-cream is-wide sw-sg" aria-label="Sicht, Schauer und Gewitter am Spot">
      <div className="sw-sg-pair">
        <div className="sw-sg-half">
          <span className="sw-sg-kind">Gemessen</span>
          {o === 'loading' ? <strong className="sw-sg-val is-text">lädt …</strong>
            : o ? <strong className="sw-sg-val">{visText(o.visM)}</strong>
              : <strong className="sw-sg-val is-text">keine Daten</strong>}
          <span className="sw-sg-sub">
            {!v.station ? 'Diesem Spot ist keine Messstation zugeordnet.'
              : o && o !== 'loading'
                ? `${v.station.net}-Station ${v.station.name}, ${v.station.km.toLocaleString('de-DE')} km vom Spot, gemessen ${obsTimeText(o.t, v.nowMs)}${o.src === 'dmi' ? ' (Mittel der letzten 10 Minuten, Rohwert ohne Prüfung)' : ''}. Messung an Land, nicht auf dem Wasser.`
                : o === 'loading' ? `${v.station.net}-Station ${v.station.name}, ${v.station.km.toLocaleString('de-DE')} km vom Spot`
                  : `${v.station.net}-Station ${v.station.name} (${v.station.km.toLocaleString('de-DE')} km vom Spot) meldet derzeit keine Sichtweite${v.station.net === 'DWD' ? ' aus den letzten drei Stunden' : ' aus der letzten Stunde'}.`}
          </span>
          <span className="sw-sg-src">{v.station?.net === 'DMI' ? `Messung: ${DMI_CREDIT}.` : POI_SOURCE}</span>
        </div>
        <div className="sw-sg-half is-hint">
          <span className="sw-sg-kind">Hinweis für {when}</span>
          {v.hint.state === 'ok' && hintCls
            ? <strong className="sw-sg-val is-text is-hintval"><Veil cls={hintCls} />{VIS_LABEL[hintCls]}</strong>
            : <strong className="sw-sg-val is-text">keine Daten</strong>}
          <span className="sw-sg-sub">{v.hint.state === 'ok' && v.hint.code != null ? VIS_REASON[v.hint.code] : v.hint.why}</span>
          <span className="sw-sg-src">{SIGHT_HINT_NOTE} Werte: {v.engine}.</span>
        </div>
      </div>

      <div className="sw-sg-block" aria-label="Amtliche Zeile Sicht und Wetter">
        <span className="sw-sg-kind">Amtlich, wörtlich</span>
        {v.official.state === 'ok' ? (
          <>
            {v.official.days.map((d) => (
              <p key={d.label} className="sw-official sw-sg-official"><span className="sw-sg-day">{d.label}:</span>{'\n'}Sicht/Wetter: {d.text}</p>
            ))}
            <span className="sw-sg-src">
              {v.official.head} ({v.official.product}){v.official.issuedAt ? `, Ausgabe ${dateTime(Date.parse(v.official.issuedAt))}` : ''}{v.official.stale ? ', veraltet' : ''}. {OFFICIAL_SOURCE}.
            </span>
          </>
        ) : <p className="sw-sg-none"><strong>Keine Daten.</strong> {v.official.why}</p>}
      </div>

      <div className="sw-sg-block" aria-label="Hinweis auf Schauer und Gewitter">
        <span className="sw-sg-kind">Schauer und Gewitter, Hinweis für {when}</span>
        {v.conv.state === 'ok' && v.conv.cls != null ? (
          <p className="sw-sg-conv">
            {v.conv.cls > 0 && <ConvMark cls={v.conv.cls as 1 | 2} />}
            <strong>{CONV_LABEL[v.conv.cls]}</strong>
            {v.conv.cls > 0 && <span> {GUST_CONV_LEGEND}</span>}
            {v.conv.cls === 0 && v.conv.capeOnly && <span> Für diese Stunde prüft der Hinweis nur noch auf Schauer.</span>}
          </p>
        ) : <p className="sw-sg-none"><strong>Keine Daten.</strong> {v.conv.why}</p>}
        {reach && <span className="sw-sg-sub">{reach}</span>}
        <span className="sw-sg-src">{SIGHT_HINT_NOTE} {CONV_SOURCE}</span>
      </div>

      <details className="sw-sg-rules">
        <summary>Wie die beiden Hinweise entstehen</summary>
        <p>{VIS_RULE}</p>
        <p>{VIS_CHECK_NOTE}</p>
        <p>{CONV_RULE}</p>
      </details>
    </section>
  );
}
