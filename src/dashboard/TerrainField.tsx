/**
 * Terrain-Feld (Phase DB): die 3D-Bühne um den Ort (Relief, Temperatur, Wind, Schneefallgrenze — `TerrainStage3D.tsx`), dazu
 * die Kästen „Gelände am Punkt" (P97: Lage, Neigung und Exposition, Himmelssicht, Kaltluftmulde, Oberfläche, Gewässernähe)
 * und „Schichtung" (P16/P98: Temperatur und Feuchte je Druckfläche). Der frühere 2D-Geländeschnitt ist entfallen (Jan 21.10.).
 */
import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from 'react';
import { Val } from './tiles';
import { originTitle } from './origin';
import type { SiteVM, TerrainVM } from './model/types';

/** 3D-Bühne: eigener Lazy-Chunk (MapLibre), erst geladen, wenn das Feld sichtbar wird. */
const TerrainStage3D = lazy(() => import('./TerrainStage3D'));

/** Wird einmal `true`, sobald das Element im Bild ist (im verborgenen Reiter „Details" bleibt es `false`). */
function useShownOnce<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

export function TerrainField({ vm, onHalfKm, rootRef, nowMs }: { vm: TerrainVM; onHalfKm: (km: 10 | 20 | 50) => void; rootRef?: RefObject<HTMLElement | null>; nowMs: number }) {
  const [stageRef, stageSeen] = useShownOnce<HTMLDivElement>();
  return (
    <section ref={rootRef} className="dbd-terrain dbd-dark" aria-label="Terrain und Wetter um den Ort">
      <div className="dbd-terrain-head">
        <span className="dbd-eyebrow">TERRAIN · TEMPERATUR · WIND</span>
        <div className="dbd-seg-dark" role="group" aria-label="Reichweite">
          {([10, 20, 50] as const).map((km) => (
            <button key={km} type="button" className={vm.halfKm === km ? 'is-active' : undefined} aria-pressed={vm.halfKm === km} onClick={() => { if (vm.halfKm !== km) onHalfKm(km); }}>± {km} km</button>
          ))}
        </div>
        <span className={`dbd-terrain-chip${vm.chipTone === 'warn' ? ' is-warn' : ''}`}><i /><Val v={vm.chip} long /></span>
      </div>
      <div className="dbd-terrain-grid">
        <div ref={stageRef} className="dbd-stage" data-origin="P68">
          {stageSeen ? (
            <Suspense fallback={<div className="dbd-stage-wait"><span className="ev-spinner" /> 3D-Bühne lädt …</div>}>
              <TerrainStage3D vm={vm} nowMs={nowMs} />
            </Suspense>
          ) : <div className="dbd-stage-wait">3D-Bühne</div>}
        </div>
      </div>
      {/* Jan 17.10.: Gelände am Punkt (P97) und Schichtung je Druckfläche (P16/P98) */}
      <div className="dbd-terrain-row">
        <SiteBox site={vm.site} />
        <LevelsBox vm={vm} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Gelände am Punkt (P97)
// ---------------------------------------------------------------------------

/** Kompass mit Expositionspfeil und Neigungskeil (meteorologisch: 0° = Nord oben). */
function AspectDial({ slopeDeg, aspectDeg }: { slopeDeg: number | null; aspectDeg: number | null }) {
  const r = 26, c = 32;
  const a = aspectDeg == null ? null : ((aspectDeg - 90) * Math.PI) / 180;
  const tip = a == null ? null : [c + (r - 4) * Math.cos(a), c + (r - 4) * Math.sin(a)];
  const flat = slopeDeg == null || slopeDeg < 1;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className="dbd-site-dial">
      <circle cx={c} cy={c} r={r} fill="#2C2A26" stroke="#3A3833" />
      <circle cx={c} cy={c} r={r / 2} fill="none" stroke="#3A3833" />
      <g fill="#8B8474" fontSize="7.5" textAnchor="middle" fontFamily="League Spartan">
        <text x={c} y={9}>N</text><text x={c + r + 4} y={c + 2.5}>O</text><text x={c} y={c + r + 7}>S</text><text x={c - r - 4} y={c + 2.5}>W</text>
      </g>
      {tip && !flat ? (
        <g>
          <line x1={c} y1={c} x2={tip[0]} y2={tip[1]} stroke="#FAF6EA" strokeWidth="2" strokeLinecap="round" />
          <circle cx={tip[0]} cy={tip[1]} r="3" fill="#FAF6EA" />
        </g>
      ) : <circle cx={c} cy={c} r="3" fill="#FAF6EA" />}
    </svg>
  );
}

/** Himmelssicht als Bogen (Sky-View-Factor). */
function SkyArc({ svf }: { svf: number | null }) {
  const r = 22, c = 30;
  const f = svf == null ? 0 : Math.max(0, Math.min(1, svf));
  const end = Math.PI - Math.PI * f;
  const arc = (from: number, to: number) => {
    const p = (t: number) => `${(c + r * Math.cos(t)).toFixed(1)} ${(c - r * Math.sin(t)).toFixed(1)}`;
    return `M${p(from)} A${r} ${r} 0 ${from - to > Math.PI ? 1 : 0} 1 ${p(to)}`;
  };
  return (
    <svg width="60" height="34" viewBox="0 0 60 34" aria-hidden="true" className="dbd-site-arc">
      <path d={arc(Math.PI, 0)} fill="none" stroke="#3A3833" strokeWidth="6" strokeLinecap="round" />
      {svf != null && <path d={arc(Math.PI, end)} fill="none" stroke="#FAF6EA" strokeWidth="6" strokeLinecap="round" />}
      <text x={c} y={31} fontSize="9" fill="#F5F1E8" textAnchor="middle" fontFamily="League Spartan" fontWeight="600">{svf != null ? `${Math.round(f * 100)} %` : '—'}</text>
    </svg>
  );
}

function SiteBox({ site }: { site: SiteVM }) {
  const row = (l: string, v: SiteVM['position']) => (
    <div className="dbd-site-row"><span className="dbd-site-l">{l}</span><span className="dbd-site-v"><Val v={v} long /></span></div>
  );
  return (
    <div className="dbd-dbox dbd-site" data-origin="P97" title={originTitle('P97')}>
      <span className="dbd-dbox-l">GELÄNDE AM PUNKT · TERRARIUM · WORLDCOVER</span>
      {site.state === 'loading' ? <div className="dbd-empty dbd-loading" aria-busy="true">lädt …</div>
        : site.state === 'error' ? <div className="dbd-empty">nicht verfügbar — buscosun Fusion nicht erreichbar</div> : (
          <div className="dbd-site-grid">
            <div className="dbd-site-vis">
              <AspectDial slopeDeg={site.slopeDeg} aspectDeg={site.aspectDeg} />
              <span className="dbd-site-cap">Exposition · Neigung</span>
              <SkyArc svf={site.svf} />
              <span className="dbd-site-cap">Himmelssicht</span>
            </div>
            <div className="dbd-site-rows">
              {row('Lage', site.position)}
              {row('Neigung', site.slope)}
              {row('Horizont', site.sky)}
              {row('Kaltluft', site.sink)}
              {row('Oberfläche', site.surface)}
              {row('Wasser', site.water)}
            </div>
          </div>
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schichtung je Druckfläche (P16 Temperatur, P98 Feuchte)
// ---------------------------------------------------------------------------

function LevelsBox({ vm }: { vm: TerrainVM }) {
  const ts = vm.levels.map((l) => l.tVal).filter((x): x is number => x != null);
  const tMin = ts.length ? Math.min(...ts) : 0, tMax = ts.length ? Math.max(...ts) : 1;
  const pos = (t: number) => (tMax === tMin ? 50 : ((t - tMin) / (tMax - tMin)) * 100);
  const warmerAbove = vm.levels.length === 3 && vm.levels[0].tVal != null && vm.levels[2].tVal != null && (vm.levels[0].tVal as number) > (vm.levels[2].tVal as number);
  return (
    <div className="dbd-dbox dbd-strata">
      <span className="dbd-dbox-l">SCHICHTUNG · 700 / 850 / 925 HPA · PUNKT-CUBE</span>
      {vm.levels.length === 0 ? <div className="dbd-empty dbd-loading" aria-busy="true">lädt …</div> : (
        <div className="dbd-strata-rows">
          {vm.levels.map((l) => (
            <div key={l.hPa} className="dbd-strata-row">
              <span className="dbd-strata-h">{l.hPa} hPa</span>
              <span className="dbd-strata-track" aria-hidden="true">
                {l.tVal != null && <i className="dbd-strata-dot" style={{ left: `${pos(l.tVal)}%` }} />}
                {l.rhVal != null && <i className="dbd-strata-rh" style={{ width: `${Math.max(0, Math.min(100, l.rhVal))}%` }} />}
              </span>
              <span className="dbd-strata-t"><Val v={l.t} /></span>
              <span className="dbd-strata-rhv"><Val v={l.rh} /></span>
            </div>
          ))}
          <div className="dbd-strata-foot">
            <span><i className="dbd-strata-dot is-leg" /> Temperatur (kalt links → warm rechts)</span>
            <span><i className="dbd-strata-rh is-leg" /> rel. Feuchte</span>
            {warmerAbove && <span className="dbd-strata-warn">700 hPa wärmer als 925 hPa — Inversion in der Höhe</span>}
          </div>
        </div>
      )}
    </div>
  );
}
