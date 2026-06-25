/**
 * Atmosphäre · Vertikalprofil-Loader (Datenanbindung).
 *
 * Holt für die aktive Marker-Position und die aktive Stunde (Time-Scrubber) das
 * ICON-EU-Sounding (bestehende Pipeline) plus die Terrainhöhe (Terrarium-DEM),
 * leitet die Profilmerkmale ab (profile-derivations) und rendert das SVG-Profil.
 *
 * Das ICON-EU-Sounding lädt je Abruf viele Druckflächen-Dateien (Profi-Feature,
 * on-demand) — daher wird auf Marker-/Stunden-Wechsel DEBOUNCED und die letzte
 * gültige Darstellung bleibt während des Nachladens sichtbar. Erstabruf kann
 * ~20 s dauern, danach greift der Decompressed-Cache.
 */

import { useEffect, useRef, useState } from 'react';
import { useAtmosphere } from './atmosphereStore';
import { fetchSoundingAtPoint } from '../sources/iconEuSounding';
import { computeSounding } from '../threed/soundingMath';
import { loadElevationLookup } from '../fusion/elevation';
import { deriveProfile, type DerivedProfile } from './profile-derivations';
import VerticalProfile from './VerticalProfile';

const DEBOUNCE_MS = 500;

interface Ready { data: DerivedProfile; runAt: Date; validAt: Date }

export default function AtmosphereProfile() {
  const { marker, hour, setModelRunAt } = useAtmosphere();
  const [ready, setReady] = useState<Ready | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const acRef = useRef<AbortController | null>(null);

  const lat = marker?.lat ?? null;
  const lon = marker?.lon ?? null;

  useEffect(() => {
    if (lat == null || lon == null) { acRef.current?.abort(); setReady(null); setError(null); setLoading(false); return; }
    setLoading(true); setError(null);
    const timer = window.setTimeout(() => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      (async () => {
        try {
          // Terrainhöhe am Punkt (kleiner Ausschnitt, alpin-genauer Zoom).
          let surfaceM = 0;
          try {
            const grid = await loadElevationLookup(
              { lngMin: lon - 0.05, lngMax: lon + 0.05, latMin: lat - 0.05, latMax: lat + 0.05 }, 9, ac.signal,
            );
            const m = grid.sample(lon, lat);
            if (Number.isFinite(m)) surfaceM = m;
          } catch { /* DEM optional → 0 (Meeresniveau-Anker) */ }
          if (ac.signal.aborted) return;

          const profile = await fetchSoundingAtPoint(lat, lon, surfaceM, hour, ac.signal);
          if (ac.signal.aborted) return;
          const data = deriveProfile(profile, computeSounding(profile));
          setReady({ data, runAt: profile.runAt, validAt: profile.validAt });
          setModelRunAt(profile.runAt);
          setLoading(false);
        } catch (err) {
          if (ac.signal.aborted) return;
          setError(err instanceof Error ? err.message : 'Sounding nicht erreichbar');
          setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [lat, lon, hour]);

  useEffect(() => () => acRef.current?.abort(), []);

  const capM = expanded && ready ? ready.data.topM : 4000;

  return (
    <section className="rt-card atm-profile-box" aria-label="Vertikalprofil" aria-busy={loading}>
      {!ready && !error && !loading && (
        <>
          <span className="rt-eyebrow">Vertikalprofil</span>
          <div className="atm-ph" style={{ marginTop: '0.6rem' }}>
            Such oben einen Ort — dann zeigen wir das Emagramm (Meter · km/h · °C) aus dem ICON-EU-Sounding.
          </div>
        </>
      )}

      {error && !ready && (
        <>
          <span className="rt-eyebrow">Vertikalprofil</span>
          <div className="atm-ph" style={{ marginTop: '0.6rem' }}>⚠ {error}</div>
        </>
      )}

      {ready && (
        <div className={loading ? 'atm-prof-wrap is-loading' : 'atm-prof-wrap'}>
          <VerticalProfile
            data={ready.data} capM={capM} expanded={expanded}
            onToggleCap={() => setExpanded((v) => !v)}
            runAt={ready.runAt} validAt={ready.validAt}
          />
          {loading && <div className="atm-prof-overlay"><span className="ev-spinner" /> aktualisiere …</div>}
        </div>
      )}

      {!ready && loading && (
        <>
          <span className="rt-eyebrow">Vertikalprofil</span>
          <div className="atm-prof-loading">
            <span className="ev-spinner" />
            <p>Sounding wird geladen … <em>der erste Abruf lädt die ICON-EU-Druckflächen (kann ~20 s dauern), danach aus dem Cache.</em></p>
          </div>
        </>
      )}
    </section>
  );
}
