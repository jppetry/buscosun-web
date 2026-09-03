/**
 * SAT1 — die Dossier-Karte „Satellitenbild" (`audit/brandradar-satellitenbilder.md` §4/§7).
 *
 * EINE Komponente für beide Dossiers (Live-Brand UND Historie-Ereignis) — deshalb strukturelle
 * Props statt `FireRecord` (Muster `MiniMapTarget`, BD2f). Darstellung nach Jans Entscheidung:
 * Umschalter „Vorher | Während | Nachher" + Tagesleiste aller Aufnahmetage mit Wolken-%.
 *
 * Der Bildabruf läuft über `fetch` → Blob → ObjectURL statt über ein nacktes `<img src>`, weil
 * nur so der Header `Data-Present: false` lesbar ist („an diesem Tag kein Bild" — benannter
 * Leerzustand statt Leerbild). Die gewählte Szene ist dossier-interner Zustand, nie Permalink
 * (Präzedenz: die markierte Brand-Kennung, `fireState.ts`).
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  cloudLabel, copernicusBrowserUrl, fetchSatImagery, PHASE_LABEL, SAT_ATTRIBUTION,
  SAT_SOURCE_LABEL, sat10Enabled, satLabel, snapshotUrl, type SatImagery, type SatPhase, type SatScene,
} from './detail/fireSatImagery';

/** SAT2a: der 10-m-Viewer ist ein eigener Lazy-Chunk — er lädt erst mit dem Klick (NerdPanel-Muster). */
const FireCogViewer = lazy(() => import('./FireCogViewer'));

export interface SatTarget {
  lat: number;
  lon: number;
  /** Brand-BBox [W, S, O, N] oder `null` (Historie-Ereignis: Punkt-Herleitung im Modul). */
  bbox: readonly [number, number, number, number] | null;
  firstMs: number | null;
  lastMs: number | null;
}

// Sitzungs-Cache der geladenen Bilder: kein Doppelabruf beim Hin- und Herschalten (V-SAT-1:
// strikt on-demand, nie ein Vorladen); Verdrängung gibt die ObjectURL wieder frei.
type SnapState = { kind: 'img'; url: string } | { kind: 'nodata' } | { kind: 'error' };
const _snaps = new Map<string, Promise<SnapState>>();
const SNAP_CACHE_MAX = 48;

function loadSnapshot(url: string): Promise<SnapState> {
  const hit = _snaps.get(url);
  if (hit) return hit;
  const p = (async (): Promise<SnapState> => {
    try {
      const r = await fetch(url);
      if (!r.ok) return { kind: 'error' };
      if (r.headers.get('Data-Present') === 'false') return { kind: 'nodata' };
      return { kind: 'img', url: URL.createObjectURL(await r.blob()) };
    } catch {
      return { kind: 'error' };
    }
  })();
  p.then((s) => { if (s.kind === 'error') _snaps.delete(url); }); // Ausfall nicht merken
  if (_snaps.size >= SNAP_CACHE_MAX) {
    const [oldKey, oldP] = _snaps.entries().next().value as [string, Promise<SnapState>];
    _snaps.delete(oldKey);
    void oldP.then((s) => { if (s.kind === 'img') URL.revokeObjectURL(s.url); });
  }
  _snaps.set(url, p);
  return p;
}

const fmtDay = (dayIso: string): string => {
  const [y, m, d] = dayIso.split('-');
  return `${d}.${m}.${y}`;
};
const fmtDayShort = (dayIso: string): string => `${dayIso.slice(8, 10)}.${dayIso.slice(5, 7)}.`;

export function SatImageryBlock({ t, nowMs }: { t: SatTarget; nowMs: number }) {
  const [im, setIm] = useState<{ kind: 'loading' } | { kind: 'ok'; data: SatImagery }>({ kind: 'loading' });
  const [selDay, setSelDay] = useState<string | null>(null);
  const [snap, setSnap] = useState<SnapState | { kind: 'loading' } | null>(null);
  /** SAT2a: 10-m-Ansicht offen? Sitzungszustand, nie Permalink (Präzedenz Szenenwahl). */
  const [cog10, setCog10] = useState(false);

  useEffect(() => {
    let alive = true;
    setIm({ kind: 'loading' }); setSelDay(null); setSnap(null);
    void fetchSatImagery(t.lat, t.lon, t.bbox, t.firstMs, t.lastMs, nowMs)
      .then((data) => { if (alive) setIm({ kind: 'ok', data }); });
    return () => { alive = false; };
    // nowMs bewusst NICHT in den Deps — ein Ticken lädt nicht neu (Muster WeatherBlock).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.lat, t.lon, t.firstMs, t.lastMs]);

  const data = im.kind === 'ok' ? im.data : null;
  // Startbild: das Nachher-Bild dokumentiert die Narbe — sonst „während", sonst „vorher".
  const scene: SatScene | null = useMemo(() => {
    if (!data) return null;
    if (selDay) return data.scenes.find((s) => s.dayIso === selDay) ?? null;
    return data.pick.after ?? data.pick.during ?? data.pick.before ?? data.scenes.at(-1) ?? null;
  }, [data, selDay]);

  useEffect(() => {
    if (!data || !scene) { setSnap(null); return; }
    let alive = true;
    setSnap({ kind: 'loading' });
    void loadSnapshot(snapshotUrl(data.bbox, scene.dayIso, scene.sat))
      .then((s) => { if (alive) setSnap(s); });
    return () => { alive = false; };
  }, [data, scene]);

  // Die 10-m-Ansicht gibt es nur für Sentinel-2-Szenen (Landsat: kein anonymer COG-Pfad, 30 m).
  useEffect(() => {
    if (scene?.sat !== 's2') setCog10(false);
  }, [scene]);

  if (im.kind === 'loading') {
    return <p className="br-muted br-wx-loading">Aufnahmetage für den Brandort werden gesucht …</p>;
  }
  if (!data || !scene) {
    return (
      <>
        <ul className="fire-fp-reasons br-muted">{data?.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        <p className="br-note">{SAT_SOURCE_LABEL}. {SAT_ATTRIBUTION}.</p>
      </>
    );
  }

  const phases = (['before', 'during', 'after'] as SatPhase[]);
  return (
    <>
      {t.firstMs != null && (
        <div className="br-sat-seg" role="group" aria-label="Phase wählen">
          {phases.map((p) => {
            const pick = data.pick[p];
            return (
              <button
                key={p} type="button" disabled={!pick}
                className={scene.phase === p ? 'is-on' : undefined}
                title={pick ? `${fmtDay(pick.dayIso)} · ${cloudLabel(pick.cloudPct)}` : 'keine Szene — Grund unter dem Bild'}
                onClick={() => pick && setSelDay(pick.dayIso)}
              >{PHASE_LABEL[p]}</button>
            );
          })}
        </div>
      )}

      <div className="br-sat-frame">
        {cog10 && (
          <Suspense fallback={<p className="br-sat-wait br-muted">10-m-Ansicht wird geladen …</p>}>
            <FireCogViewer
              key={scene.dayIso}
              lat={t.lat} lon={t.lon} dayIso={scene.dayIso}
              fireStartIso={t.firstMs != null ? new Date(t.firstMs).toISOString().slice(0, 10) : null}
              fallbackUrl={copernicusBrowserUrl(t.lat, t.lon, scene.dayIso)}
              onClose={() => setCog10(false)}
            />
          </Suspense>
        )}
        {!cog10 && snap?.kind === 'img' && (
          <img src={snap.url} alt={`Satellitenbild vom ${fmtDay(scene.dayIso)} (${satLabel(scene.sat)}, Echtfarbe, 30 m)`} />
        )}
        {!cog10 && snap?.kind === 'loading' && <p className="br-sat-wait br-muted">Bild wird geladen …</p>}
        {!cog10 && snap?.kind === 'nodata' && (
          <p className="br-sat-wait br-muted">Für den {fmtDay(scene.dayIso)} liegt noch kein Bild auf dem Bilddienst —
            frische Aufnahmen brauchen 2–3 Tage Verarbeitung. Anderen Tag wählen.</p>
        )}
        {!cog10 && snap?.kind === 'error' && (
          <p className="br-sat-wait br-muted">Der Bilddienst ist gerade nicht erreichbar — später erneut öffnen.</p>
        )}
      </div>
      <p className="br-sat-caption">
        <strong>{fmtDay(scene.dayIso)}</strong> · {cog10 ? 'Sentinel-2, Original 10 m' : `${satLabel(scene.sat)} · ${cloudLabel(scene.cloudPct)}`}
        {!cog10 && scene.phase && <> · {PHASE_LABEL[scene.phase]}</>}
        {cog10 && <> · {cloudLabel(scene.cloudPct)}</>}
      </p>
      {!cog10 && scene.sat === 's2' && sat10Enabled() && (
        <p className="br-cog-open">
          <button type="button" onClick={() => setCog10(true)}>
            In 10 m ansehen — lädt je nach Zoom ~1–10 MB
          </button>
        </p>
      )}

      <div className="br-sat-days" role="group" aria-label="Aufnahmetag wählen">
        {data.scenes.map((s) => (
          <button
            key={s.dayIso} type="button"
            className={`br-sat-day${s.dayIso === scene.dayIso ? ' is-on' : ''}${s.phase ? ` is-${s.phase}` : ''}`}
            onClick={() => setSelDay(s.dayIso)}
          >
            <span>{fmtDayShort(s.dayIso)}</span>
            <span className="br-sat-day-cloud">{s.cloudPct != null ? `${Math.round(s.cloudPct)} %` : '– %'}</span>
          </button>
        ))}
      </div>

      {data.notes.length > 0 && (
        <ul className="fire-fp-reasons br-muted">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
      <p className="br-note">
        {SAT_SOURCE_LABEL} — bei kleinen Bränden (unter ~10–20 ha) zeigt das 30-m-Bild oft keine sichtbare Narbe.
        Der Wolkenanteil gilt je Szene, nicht am Brandort.
        {sat10Enabled() && scene.sat === 'landsat'
          && ' Die 10-m-Ansicht in der App gibt es nur an Sentinel-2-Tagen (Landsat misst 30 m).'}
        {' '}{SAT_ATTRIBUTION}.{' '}
        <a href={copernicusBrowserUrl(t.lat, t.lon, scene.dayIso)} target="_blank" rel="noopener">
          In 10 m im Copernicus Browser öffnen
        </a>
      </p>
    </>
  );
}
