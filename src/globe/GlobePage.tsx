/**
 * 3D-Globus · Seite (LIVE GFS) im Command-Deck (Jan 06.11.): helle Hülle wie die
 * anderen Features (Rail, Topbar, Dock links, mobil Kopf-Kacheln + Fußleiste),
 * die Kugel selbst bleibt vor dunklem Hintergrund — Kartenstil, Partikel und
 * Farbskalen sind unverändert.
 *
 * Erdkugel mit geschwindigkeitsgefärbten Wind-Partikeln und umschaltbarer Ebene
 * (Temperatur / Wind / Feuchte / Druck) auf wählbarer Höhe (Boden / 850 / 500 /
 * 250 hPa). Vorlaufstunden-Navigation + Animation. Klick auf die Kugel pinnt
 * einen Ort (Readout aktualisiert sich mit Zeit/Höhe). Der gesamte Zustand steht
 * in der Query (`globeUrl.ts`).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import GlobeMap, { type PickInfo, type Projection, type RunInfo } from './GlobeMap';
import { GLOBE_DEFAULTS, fhourForValidAt, validAtForFhour, type GlobeUrlState } from './globeUrl';
// SH4: Teilen-Knopf (laedt Adapter und Sheet erst beim Klick).
import ShareButton from '../share/ShareButton';
import type { Height, OverlayKind } from './gfs';
import { prefetch } from './gfsClient';
import AppLoader from '../router/AppLoader';
import { usePageCover } from '../router/usePageCover';
import { MapSourcesTile, type MapSourceGroup } from '../map/MapSourcesTile';
import { useAppNav } from '../router/useAppNav';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
import { useMediaQuery } from '../mobile/useIsMobile';
import './globe.css';

const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
const dirName = (deg: number) => COMPASS[Math.round((deg % 360) / 45) % 8];
const fmtCoord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;

// Vorlauf: 3-stündliche GFS-Frames bis +120 h (fein genug für flüssige Animation).
const FH_STEP = 3, FH_MAX = 120;
function fhLabel(h: number): string { return h === 0 ? 'jetzt' : h % 24 === 0 ? `+${h / 24} T` : `+${h} h`; }
const OVERLAYS: Array<{ k: OverlayKind; label: string }> = [
  { k: 'temp', label: 'Temperatur' }, { k: 'wind', label: 'Wind' }, { k: 'rh', label: 'Feuchte' }, { k: 'mslp', label: 'Luftdruck' }, { k: 'none', label: 'Ohne Ebene' },
];
const HEIGHTS: Array<{ k: Height; label: string }> = [
  { k: 'sfc', label: 'Boden' }, { k: '850', label: '850' }, { k: '500', label: '500' }, { k: '250', label: '250' },
];
const FH_TICKS = [0, 24, 48, 72, 96, 120];

/** Schalter-Zeile des Docks (An/Aus mit Unterzeile). */
function SwitchRow({ label, sub, on, onClick, disabled }: { label: string; sub: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`glb-switchrow${on ? ' is-on' : ''}`} onClick={onClick} disabled={disabled}>
      <span className="glb-switchrow-tx"><b>{label}</b><span>{sub}</span></span>
      <span className="glb-switch" aria-hidden="true"><span /></span>
    </button>
  );
}
const BAR_ICONS: Record<'map' | 'layers', ReactNode> = {
  map: <g><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" /></g>,
  layers: <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" />,
};

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function fmtValid(ms: number): string {
  const d = new Date(ms);
  return `${WD[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}. ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`;
}
function fmtRun(r: RunInfo): string { return `GFS-Lauf ${r.run.date.slice(6, 8)}.${r.run.date.slice(4, 6)}. ${r.run.hour} UTC`; }

// Legenden-Konfiguration je Overlay.
interface Legend { title: string; stops: Array<{ v: number; rgb: string }>; ticks: number[]; fmt?: (t: number) => string; }
const LEGENDS: Partial<Record<OverlayKind, Legend>> = {
  temp: { title: 'Temperatur · °C', ticks: [-40, -20, 0, 20, 40], fmt: (t) => (t > 0 ? `+${t}` : `${t}`), stops: [
    { v: -50, rgb: '40,55,118' }, { v: -30, rgb: '48,108,172' }, { v: -10, rgb: '80,164,178' }, { v: 6, rgb: '118,182,122' }, { v: 22, rgb: '196,174,72' }, { v: 34, rgb: '196,92,54' }, { v: 50, rgb: '128,26,36' } ] },
  wind: { title: 'Windgeschwindigkeit · m/s', ticks: [0, 10, 20, 40, 60], stops: [
    { v: 0, rgb: '42,48,74' }, { v: 6, rgb: '44,142,120' }, { v: 15, rgb: '184,200,72' }, { v: 28, rgb: '236,112,56' }, { v: 50, rgb: '184,60,134' }, { v: 70, rgb: '222,162,220' } ] },
  rh: { title: 'Rel. Feuchte · %', ticks: [0, 40, 70, 100], stops: [
    { v: 0, rgb: '120,96,64' }, { v: 45, rgb: '150,160,100' }, { v: 78, rgb: '70,144,152' }, { v: 100, rgb: '60,70,150' } ] },
  mslp: { title: 'Luftdruck (NN) · hPa', ticks: [970, 1000, 1013, 1030], stops: [
    { v: 955, rgb: '78,42,120' }, { v: 1000, rgb: '90,150,168' }, { v: 1013, rgb: '150,168,140' }, { v: 1024, rgb: '206,176,92' }, { v: 1060, rgb: '150,56,52' } ] },
};
function gradient(stops: { v: number; rgb: string }[]) {
  const min = stops[0].v, max = stops[stops.length - 1].v;
  return `linear-gradient(to right, ${stops.map((s) => `rgb(${s.rgb}) ${Math.round(((s.v - min) / (max - min)) * 100)}%`).join(', ')})`;
}
const tickPos = (t: number, stops: { v: number }[]) => ((t - stops[0].v) / (stops[stops.length - 1].v - stops[0].v)) * 100;

interface Props {
  onBack: () => void;
  /** SH4: Anfangszustand aus der Query (Alt-Links hat der Wrapper übersetzt). */
  initialUrl?: GlobeUrlState | null;
  /** Vorhersagestunde eines Alt-Links (`#g=` trug `fh`, keine absolute Zeit). */
  initialFhour?: number;
  /** SH4: Zustandsänderung ⇒ der Wrapper schreibt die URL (einziger Schreiber). */
  onUrlState?: (s: GlobeUrlState) => void;
}

/**
 * SH4: Der Permalink `#g=` ist entfallen — der Zustand steht in der QUERY
 * (`globeUrl.ts`), und der Router-Wrapper ist der einzige Schreiber. Zwei
 * Änderungen sind dabei mehr als ein Umzug:
 *
 *  - **Die Zeit ist absolut.** `fh` zählte Stunden ab dem GFS-Lauf, und der Lauf
 *    wechselt alle sechs Stunden — ein geteilter Link zeigte danach etwas
 *    anderes. Der Lauf ist beim Mount noch unbekannt (er kommt mit dem ersten
 *    Frame), deshalb merkt sich die Seite den gewünschten Zeitpunkt und rechnet
 *    ihn in eine Vorhersagestunde um, sobald `RunInfo` da ist.
 *  - **Die Achsen stehen wie überall sonst** (`lat, lon`). Der alte Permalink
 *    speicherte `[lon, lat]`; die Übersetzung macht `decodeGlobeHash` (V-SH-3).
 */
/** „Quellen" on the globe (shared source line of the map pages, Brandradar concept, Jan 07.11.). */
const GLOBE_SOURCES: MapSourceGroup[] = [
  { title: 'Wetterdaten', items: [{ name: 'NOAA GFS · AWS Open Data (noaa-gfs-bdp-pds)', url: 'https://registry.opendata.aws/noaa-gfs-bdp-pds/', what: 'Wind, Temperatur, Feuchte und Luftdruck, 1°, global, im Browser dekodiert', licence: 'Public Domain', changed: 'eigene Farbskalen', on: true }] },
  { title: 'Karte', items: [{ name: 'Natural Earth', url: 'https://www.naturalearthdata.com/', what: 'Küstenlinien und Grenzen (1:50 Mio.)', licence: 'Public Domain', on: true }] },
];

export default function GlobePage({ onBack, initialUrl, initialFhour, onUrlState }: Props) {
  const init = initialUrl ?? null;
  const [overlay, setOverlay] = useState<OverlayKind>(init?.overlay ?? GLOBE_DEFAULTS.overlay);
  const [height, setHeight] = useState<Height>(init?.height ?? 'sfc');
  const [projection, setProjection] = useState<Projection>(init?.projection ?? 'globe');
  const [showParticles, setShowParticles] = useState(init?.particles ?? true);
  const [hd, setHd] = useState(init?.hd ?? false);
  const [spinning, setSpinning] = useState(false);
  const [fhour, setFhour] = useState(initialFhour ?? 0);
  const [hover, setHover] = useState<PickInfo | null>(null);
  const [pin, setPin] = useState<PickInfo | null>(init?.pin ? { lat: init.pin.lat, lng: init.pin.lon, tempC: null, wind: null } : null);
  const [runInfo, setRunInfo] = useState<RunInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Start cover (buscosun mark + ring) until the first GFS field is in; later field changes keep the small status line.
  const pageShown = usePageCover(null, !loading || !!error, false);
  const [playing, setPlaying] = useState(false);
  const viewRef = useRef<{ center: [number, number]; zoom: number } | null>(
    init?.center ? { center: [init.center.lon, init.center.lat], zoom: init.zoom ?? 2.2 } : null,
  );

  const readout = pin ?? hover;
  const legend = overlay !== 'none' ? LEGENDS[overlay] : undefined;

  /**
   * Gewünschte Gültigkeitszeit aus der URL → Vorhersagestunde, sobald der Lauf
   * bekannt ist. Genau EINMAL: danach gehört die Stunde dem Nutzer.
   */
  const wantedValidAtRef = useRef<number | null>(init?.validAtMs ?? null);
  useEffect(() => {
    const wanted = wantedValidAtRef.current;
    if (wanted == null || !runInfo) return;
    wantedValidAtRef.current = null;
    const runStart = runInfo.validMs - runInfo.fhour * 3_600_000;
    const fh = fhourForValidAt(wanted, runStart);
    setFhour((cur) => (cur === fh ? cur : fh));
  }, [runInfo]);

  // SH4: Zustand ⇒ Wrapper (der schreibt die URL). Kein zweiter Schreiber.
  const onUrlStateRef = useRef(onUrlState);
  onUrlStateRef.current = onUrlState;
  useEffect(() => {
    const runStart = runInfo ? runInfo.validMs - runInfo.fhour * 3_600_000 : null;
    onUrlStateRef.current?.({
      overlay, height,
      // Ohne bekannten Lauf lässt sich keine ehrliche Gültigkeitszeit angeben —
      // dann bleibt `t` aus der URL weg, statt eine zu erfinden.
      validAtMs: runStart != null && fhour > 0 ? validAtForFhour(fhour, runStart) : null,
      center: viewRef.current ? { lat: viewRef.current.center[1], lon: viewRef.current.center[0] } : null,
      zoom: viewRef.current ? viewRef.current.zoom : null,
      pin: pin ? { lat: pin.lat, lon: pin.lng } : null,
      projection, particles: showParticles, hd,
    });
  }, [overlay, height, fhour, projection, showParticles, hd, pin, runInfo]);

  // Animation: alle ~0,65 s einen 3-h-Frame weiter (zyklisch 0 → +120 h → 0).
  useEffect(() => {
    if (!playing) return;
    const iv = window.setInterval(() => {
      setFhour((cur) => (cur + FH_STEP > FH_MAX ? 0 : cur + FH_STEP));
    }, 650);
    return () => window.clearInterval(iv);
  }, [playing]);

  // Frame-Preload: die nächsten Frames in den Worker-Cache laden, damit das
  // Abspielen (und Scrubben) flüssig aus dem Cache rendert statt zu fetchen.
  useEffect(() => {
    const run = runInfo?.run;
    if (!run) return;
    const sel = { height, overlay };
    // three steps ahead (playback) and one back (slider to and fro)
    for (const ahead of [FH_STEP, FH_STEP * 2, FH_STEP * 3, -FH_STEP]) {
      const next = fhour + ahead > FH_MAX ? (fhour + ahead) - FH_MAX - FH_STEP : fhour + ahead;
      if (next >= 0 && next <= FH_MAX) prefetch(run, next, sel);
    }
  }, [fhour, overlay, height, runInfo]);

  // --- Command-Deck shell ------------------------------------------------------------------------------
  const nav = useAppNav();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [mobTab, setMobTab] = useState<'map' | 'layers'>('map');
  const liveTone = error ? 'none' : loading ? 'loading' : 'live';

  const dock = (
    <div className="glb-dock-body">
      <div className="glb-sec">Ebene</div>
      <div className="glb-tiles" role="radiogroup" aria-label="Ebene">
        {OVERLAYS.map((o) => {
          const lg = o.k !== 'none' ? LEGENDS[o.k] : undefined;
          return (
            <button key={o.k} type="button" role="radio" aria-checked={overlay === o.k} className={`glb-tile${overlay === o.k ? ' is-active' : ''}`} onClick={() => setOverlay(o.k)}>
              <span className="glb-tile-top">{o.label}</span>
              <span className={`glb-tile-ramp${lg ? '' : ' is-none'}`} style={lg ? { background: gradient(lg.stops) } : undefined} />
            </button>
          );
        })}
      </div>

      <div className="glb-sec">Höhe</div>
      <div className="glb-seg" role="radiogroup" aria-label="Höhe">
        {HEIGHTS.map((hh) => (
          <button key={hh.k} type="button" role="radio" aria-checked={height === hh.k} className={height === hh.k ? 'is-active' : ''} onClick={() => setHeight(hh.k)} title={hh.k === 'sfc' ? 'Bodennah (10 m Wind / 2 m Temp)' : `${hh.k} hPa`}>{hh.label}</button>
        ))}
      </div>
      <p className="glb-note">{height === 'sfc' ? 'Bodennah: Wind in 10 m, Temperatur in 2 m.' : `Druckfläche ${height} hPa.`}</p>

      <div className="glb-sec">Windpartikel</div>
      <div className="glb-rows">
        <SwitchRow label="Partikel" sub="Strömung als bewegte Linien" on={showParticles} onClick={() => setShowParticles((v) => !v)} />
        <SwitchRow label="HD" sub="dichteres Partikelfeld" on={hd} onClick={() => setHd((v) => !v)} disabled={!showParticles} />
      </div>

      <div className="glb-sec">Ansicht</div>
      <div className="glb-seg" role="radiogroup" aria-label="Projektion">
        {(['globe', 'flat'] as Projection[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={projection === p} className={projection === p ? 'is-active' : ''} onClick={() => setProjection(p)}>{p === 'globe' ? 'Globus' : 'Flach'}</button>
        ))}
      </div>
      <div className="glb-rows glb-gap">
        <SwitchRow label="Auto-Rotation" sub="die Kugel dreht sich von selbst" on={spinning} onClick={() => setSpinning((v) => !v)} />
      </div>

      <div className="glb-sec">Daten</div>
      <p className="glb-note glb-foot">
        Live {runInfo ? fmtRun(runInfo) : 'NOAA GFS'} (1°, global, Public Domain) · clientseitig dekodiert (Worker) · Umriss Natural Earth.
      </p>
    </div>
  );

  return (
    <div className={`glb-root${isMobile ? ' is-mobile' : ''}`}>
      <AppLoader cover done={pageShown} />
      {!isMobile && (
        <FeatureRail active={'globe' as RailFeature} onOpenFeature={(id) => nav.openFeature(id)} onHome={onBack}
          navClass="glb-rail" btnClass="glb-rail-btn" activeClass="is-active" spacerClass="glb-rail-spacer" />
      )}
      <div className="glb-deck">
        {!isMobile && (
          <header className="glb-topbar">
            <a className="glb-brand" href="/" onClick={(e) => { e.preventDefault(); onBack(); }} aria-label="Zur Startseite">
              <img src="/buscosun-mark.svg" width={22} height={22} alt="" /><span>buscosun</span>
            </a>
            <span className="glb-topdiv" aria-hidden="true" />
            <span className="glb-topbar-sub">3D-Globus · Wetter der ganzen Erde</span>
            <div className="glb-topbar-right">
              <span className={`glb-live is-${liveTone}`} role="status">
                <span className="glb-live-dot" aria-hidden="true"><span /><span /></span>
                {liveTone === 'live' ? 'Live' : liveTone === 'loading' ? 'Lädt' : 'Keine Daten'}
              </span>
              <span className="glb-topbar-stand">{runInfo ? fmtRun(runInfo) : 'NOAA GFS'}</span>
              <ShareButton className="glb-share" text="Teilen" />
            </div>
          </header>
        )}
        <div className="glb-body">
          {!isMobile && <aside className="glb-dock" aria-label="Ebenen und Ansicht">{dock}</aside>}
          <main className="glb-stage msl-host" aria-label="Globus">
            <MapSourcesTile title="Quellen des 3D-Globus" groups={GLOBE_SOURCES} ready={pageShown} />
            <GlobeMap
              overlay={overlay} height={height} projection={projection} showParticles={showParticles}
              hd={hd} spinning={spinning} fhour={fhour} pinActive={pin !== null}
              initialView={viewRef.current ?? undefined}
              initialPin={init?.pin ? { lat: init.pin.lat, lng: init.pin.lon } : undefined}
              onHover={setHover} onPin={setPin} onRunInfo={setRunInfo}
              onLoading={setLoading} onError={setError}
              onView={(v) => { viewRef.current = v; }}
            />
            {isMobile && (
              <div className="glb-m-top">
                <button type="button" className="glb-m-brand" aria-label="Zur Startseite" onClick={onBack}><img src="/buscosun-mark.svg" width={22} height={22} alt="" /></button>
                {/* Jan 11.11.: the place readout (and the legend under it) sits between the logo and the share button. */}
                <div className="glb-m-mid" />
                <ShareButton className="glb-m-share" compact />
              </div>
            )}
            {loading && <div className="glb-loading"><span className="glb-spinner" /> GFS-Daten werden geladen …</div>}
            {error && <div className="glb-error" role="alert">{error}</div>}

            <div className={`glb-ov-tl${isMobile ? ' is-mid' : ''}`}>
              <div className="glb-card glb-readout">
                <div className="glb-eyebrow">Ort</div>
                {readout ? (
                  <>
                    <div className="glb-readout-head">
                      <span className="glb-readout-loc">{fmtCoord(readout.lat, 'N', 'S')}, {fmtCoord(readout.lng, 'O', 'W')}</span>
                      {pin && <button type="button" className="glb-readout-clear" onClick={() => setPin(null)} aria-label="Pin entfernen">×</button>}
                    </div>
                    <div className="glb-readout-rows">
                      <div className="glb-readout-row"><span className="glb-dot glb-dot-temp" /> {readout.tempC != null ? `${Math.round(readout.tempC)} °C` : '—'}</div>
                      <div className="glb-readout-row"><span className="glb-dot glb-dot-wind" /> {readout.wind ? `${Math.round(readout.wind.speedMs * 3.6)} km/h · ${dirName(readout.wind.dirFromDeg)} (${Math.round(readout.wind.speedMs)} m/s)` : '—'}</div>
                    </div>
                  </>
                ) : (
                  <div className="glb-readout-hint">{isMobile ? 'Auf die Kugel tippen, um einen Ort zu pinnen.' : 'Auf die Kugel klicken, um einen Ort zu pinnen.'}</div>
                )}
              </div>
              {legend && (
                <div className="glb-card glb-legend">
                  <span className="glb-eyebrow">{legend.title}{height !== 'sfc' && overlay !== 'mslp' ? ` · ${height} hPa` : ''}</span>
                  <div className="glb-legend-bar" style={{ background: gradient(legend.stops) }}>
                    {legend.ticks.map((t) => (
                      <span key={t} className="glb-legend-tick" style={{ left: `${tickPos(t, legend.stops)}%` }}>{legend.fmt ? legend.fmt(t) : t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="glb-time" role="group" aria-label="Vorhersagezeit">
              <button type="button" className={`glb-play${playing ? ' is-on' : ''}`} aria-pressed={playing} onClick={() => setPlaying((v) => !v)}
                aria-label={playing ? 'Animation anhalten' : 'Animation abspielen'} title="Animation abspielen/pausieren">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5v14l11-7z" />}
                </svg>
              </button>
              <div className="glb-time-main">
                <div className="glb-time-head">
                  <span className="glb-time-valid">{runInfo ? <>Gültig <strong>{fmtValid(runInfo.validMs)}</strong></> : 'Zeit wird geladen …'}</span>
                  <span className="glb-time-lead">{fhLabel(fhour)}</span>
                </div>
                <input type="range" className="glb-slider" min={0} max={FH_MAX} step={FH_STEP} value={fhour}
                  onChange={(e) => { setPlaying(false); setFhour(+e.target.value); }} aria-label="Vorlaufstunde" />
                <div className="glb-time-ticks" aria-hidden="true">{FH_TICKS.map((h) => <span key={h}>{fhLabel(h)}</span>)}</div>
              </div>
            </div>
          </main>
          {isMobile && mobTab === 'layers' && (
            <div className="glb-m-dock" role="dialog" aria-label="Ebenen">
              <div className="glb-m-dock-head"><strong>Ebenen</strong></div>
              <div className="glb-dock">{dock}</div>
            </div>
          )}
        </div>
        {isMobile && (
          <nav className="glb-bar" aria-label="Globus-Bereiche">
            {([['map', 'Globus'], ['layers', 'Ebenen']] as const).map(([id, label]) => (
              <button key={id} type="button" className={`glb-bar-btn${mobTab === id ? ' is-active' : ''}`} aria-current={mobTab === id ? 'page' : undefined} onClick={() => setMobTab(id)}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{BAR_ICONS[id]}</svg>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
