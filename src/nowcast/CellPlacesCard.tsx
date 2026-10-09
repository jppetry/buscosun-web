/**
 * Phase ZO (`audit/zell-orte.md`): Zell-Steckbrief im Readout (Desktop) und im Schnellblick (mobil) — oben der Satz für
 * den gewählten Ort, dann die Zellwahl und die Liste „Zieht über" (Ort links, Fenster rechts, schmales Band für Lage und
 * Breite der Spanne auf der Stunde ab Messzeit), darunter getrennt die Einschätzung von buscosun Fusion am Ort. Antippen
 * eines Orts zentriert die Karte darauf. Reine Darstellung — gerechnet wird in `radar/cellPlaces.ts`.
 */
import { useMemo } from 'react';
import { buildCellFeatures, cellHeadline, type CellFeatureProperties } from '../radar/cellPolygons';
import { renderCellPopup } from '../radar/cellLayers';
import { cellPlaceSentence, clockHm, windowBand, windowText, type CellPass } from '../radar/cellPlaces';
import { fmtChancePct, fmtHourSpan } from '../precipChance/chanceModel';
import { CELL_FUSION_GUST_KMH, CELL_FUSION_HEAVY_MM } from './cellFusionHint';
import type { CellPlacesState } from './useCellPlaces';
import type { CellFusionState } from './useCellFusionHint';
import './cellPlaces.css';

const KIND_WORD: Record<CellPass['kind'], string> = { now: 'gerade über', core: 'zieht über', edge: 'streift' };
/** Zellwahl: so viele Chips höchstens — die übrigen Zellen sind über die Karte wählbar. */
const CHIPS_MAX = 5;

export default function CellPlacesCard({ zo, fusion, onPickPlace, variant }: {
  zo: CellPlacesState;
  fusion: CellFusionState;
  onPickPlace: (lat: number, lon: number) => void;
  variant: 'desktop' | 'mobile';
}) {
  const run = zo.run;
  const cell = run && zo.selectedId != null ? run.cells.find((c) => c.id === zo.selectedId) ?? null : null;
  const brief = useMemo(() => {
    if (!run || !cell) return null;
    const fc = buildCellFeatures({ ...run, cells: [cell] });
    const dot = fc.features.find((f) => (f.properties as CellFeatureProperties | null)?.kind === 'dot');
    return dot ? renderCellPopup(dot.properties as CellFeatureProperties) : null;
  }, [run, cell]);
  if (zo.status === 'off' || !run || !zo.verdict) return null;
  const sentence = cellPlaceSentence(zo.verdict, zo.nowMs);
  const empty = run.cells.length === 0;
  if (empty && !sentence) {
    // Leerer Lauf im Radarbereich: dasselbe, was die Leiste auf der Karte sagt — kein leerer Kasten.
    return (
      <section className={`zo-card zo-card--${variant} is-quiet`} aria-label="Gewitterzellen">
        <div className="zo-head"><span className="zo-eyebrow">Gewitterzellen · KONRAD3D</span></div>
        <p className="zo-sentence zo-sentence--quiet">Zurzeit erkennt der DWD keine Gewitterzellen.</p>
      </section>
    );
  }
  // Außerhalb der Reichweite der deutschen Radare nur der Satz — die Orte einer fernen Zelle wären Rauschen. Wer eine Zelle
  // auf der Karte antippt, bekommt ihre Liste trotzdem.
  if (zo.verdict.kind === 'no-coverage' && !zo.picked) {
    return (
      <section className={`zo-card zo-card--${variant} is-quiet`} aria-label="Gewitterzellen">
        <div className="zo-head"><span className="zo-eyebrow">Gewitterzellen · KONRAD3D</span></div>
        <p className="zo-sentence zo-sentence--quiet">{sentence}</p>
        <p className="zo-foot">Zellen auf der Karte lassen sich antippen · Hinweis aus dem Radar, keine Warnung · maßgeblich sind die DWD-Warnungen</p>
      </section>
    );
  }
  const list = zo.list;
  const chips = zo.order.slice(0, CHIPS_MAX);
  const affected = zo.verdict.kind === 'pass';
  return (
    <section className={`zo-card zo-card--${variant}`} aria-label="Betroffene Orte und Ankunftsfenster">
      <div className="zo-head">
        <span className="zo-eyebrow">{cell ? `Zelle ${cell.id} · KONRAD3D` : 'Gewitterzellen · KONRAD3D'}</span>
        <span className="zo-stamp">Messzeit {clockHm(run.refMs)}</span>
      </div>
      {sentence && <p className={`zo-sentence${affected ? '' : ' zo-sentence--quiet'}`}>{sentence}</p>}

      {chips.length > 1 && (
        <div className="zo-chips" role="group" aria-label="Zelle wählen">
          {chips.map((id) => (
            <button key={id} type="button" className={`zo-chip${id === zo.selectedId ? ' is-on' : ''}`} aria-pressed={id === zo.selectedId}
              onClick={() => zo.select(id)}>Zelle {id}</button>
          ))}
          {zo.order.length > CHIPS_MAX && <span className="zo-chip-more">+ {zo.order.length - CHIPS_MAX} auf der Karte</span>}
        </div>
      )}

      {cell && (
        <>
          <p className="zo-cellline">{cellHeadline(cell)}</p>
          <div className="zo-label">Zieht über · nächste 60 min</div>
          {zo.status === 'loading' && <p className="zo-note"><span className="ev-spinner" /> Orte werden geladen …</p>}
          {zo.status === 'error' && <p className="zo-note">Ortsliste nicht erreichbar{zo.reason ? ` (${zo.reason})` : ''}.</p>}
          {list?.noEllipse && <p className="zo-note">Für diese Zelle liefert der DWD keine Unsicherheit der Bahn — deshalb keine Orte und Zeitfenster.</p>}
          {list && !list.noEllipse && list.rows.length === 0 && (
            <p className="zo-note">Auf der Bahn liegt in den nächsten 60 Minuten kein Ort ab 5 000 Einwohnern (Verzeichnis DE · AT · CH).</p>
          )}
          {list && list.rows.length > 0 && (
            <ul className="zo-list">
              {list.rows.map((r) => {
                const b = windowBand(r);
                return (
                  <li key={`${r.place.name}|${r.place.lat}|${r.place.lon}`}>
                    <button type="button" className={`zo-row is-${r.kind}${r.chosen ? ' is-chosen' : ''}`}
                      onClick={() => onPickPlace(r.place.lat, r.place.lon)}
                      title={`${r.place.name}: ${KIND_WORD[r.kind]} · ${windowText(r.fromMs, r.toMs, zo.nowMs)} — Karte hierhin`}>
                      <span className="zo-name">{r.place.name}{r.chosen && <em> · dein Ort</em>}</span>
                      <span className="zo-win">{windowText(r.fromMs, r.toMs, zo.nowMs)}</span>
                      <span className="zo-band" aria-hidden="true"><i style={{ left: `${(b.x0 * 100).toFixed(1)}%`, width: `${(Math.max(0.02, b.x1 - b.x0) * 100).toFixed(1)}%` }} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {list && (list.hiddenCore + list.hiddenEdge) > 0 && (
            <p className="zo-more">
              + {list.hiddenCore + list.hiddenEdge} weitere {list.hiddenCore > 0 ? `Orte (${list.hiddenCore} im Kern)` : 'Orte am Rand'}
            </p>
          )}
          {list && list.rows.length > 0 && (
            <p className="zo-legend"><b>kräftig</b> = im Kern der amtlichen Bahn (zieht über) · <span>hell</span> = am Rand (streift) · Band = Zeitfenster in der Stunde ab Messzeit</p>
          )}
          {brief && (
            <details className="zo-brief">
              <summary>Steckbrief der Zelle</summary>
              <div dangerouslySetInnerHTML={{ __html: brief }} />
            </details>
          )}
        </>
      )}

      {affected && fusion.status !== 'off' && (
        <div className="zo-fusion" data-origin="fusion">
          <div className="zo-fusion-head">
            {fusion.fusionName} · am Ort{fusion.hour ? `, ${fmtHourSpan(fusion.hint?.heavy?.fromMs ?? fusion.hour.fromMs, fusion.hint?.heavy?.toMs ?? fusion.hour.toMs)}` : ''}
          </div>
          {fusion.status === 'loading' && <p className="zo-note"><span className="ev-spinner" /> wird gerechnet …</p>}
          {fusion.status === 'gap' && <p className="zo-note">Keine Einschätzung{fusion.reason ? ` (${fusion.reason})` : ''}.</p>}
          {fusion.status === 'ready' && fusion.hint && (
            <p className="zo-fusion-vals">
              Starkregen (≥ {CELL_FUSION_HEAVY_MM} mm in der Stunde) <b>{fusion.hint.heavy ? fmtChancePct(fusion.hint.heavy.p) : '–'}</b>
              {' · '}Böen ≥ {CELL_FUSION_GUST_KMH} km/h <b>{fusion.hint.gust ? fmtChancePct(fusion.hint.gust.p) : '–'}</b>
            </p>
          )}
          <p className="zo-fusion-note">Modell am Ort, unabhängig von den Zelldaten · kein Gewitterwert in buscosun Fusion</p>
        </div>
      )}

      <p className="zo-foot">Hinweis aus dem Radar, keine Warnung · maßgeblich sind die DWD-Warnungen · Zellen DWD KONRAD3D · Orte GeoNames (CC BY 4.0)</p>
    </section>
  );
}
