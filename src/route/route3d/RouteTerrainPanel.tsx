/**
 * R3D · Die Gelände-Ansicht im **Ergebnis** (2D-Seite).
 *
 * Jans Entscheidung (R3D-8): das Ergebnis öffnet mit dem Relief statt mit der
 * flachen Karte. Die flache Karte bleibt daneben erreichbar — sie kann Dinge,
 * die diese hier nicht kann (Pausen-Marker, Wegpunkt-Vorschläge, „Pause hier",
 * Wetter-Marker mit Popup); sie zu ersetzen hieße, sie zu verlieren.
 *
 * Die Ansicht ist **kein zweiter Bau**: Szene, Schnitt, Bodenspuren und
 * Schalter kommen aus denselben Funktionen wie die Bühne „Gelände" in der
 * 3D-Ansicht (`routeSection.ts`). Verschieden ist nur das Layout — und das ist
 * Absicht: hier steht die Karte allein, dort neben Reglern und Punkt-Abfrage.
 */

import { useEffect, useMemo, useState } from 'react';
import type { SampleETA } from '../tourTiming';
import type { Terrain, TourPoint } from '../tourTrack';
import type { Country } from '../../types';
import { buildScene, resolutionChip, resolutionNote } from './model';
import { rainWindows } from './corridor';
import {
  buildGroundLayers, buildRouteSection, curtainNote, loadTLayers, saveTLayers, terrainChips,
  NO_INVERSION_NOTE, type TerrainLayerFlags,
} from './routeSection';
import RouteTerrainMap from './RouteTerrainMap';
import './route3d.css';

interface Props {
  samples: SampleETA[];
  points: TourPoint[];
  countries: Country[];
  coverage?: { snowLine: boolean };
  terrain: Terrain;
  /** Gekoppelte Position — dieselbe, die der Scrubber der Seite führt. */
  markerM: number;
  onPickDist: (m: number) => void;
  isMobile: boolean;
}

export default function RouteTerrainPanel({
  samples, points, countries, coverage, terrain, markerM, onPickDist, isMobile,
}: Props) {
  const [tLayers, setTLayers] = useState<TerrainLayerFlags>(() => loadTLayers());
  useEffect(() => { saveTLayers(tLayers); }, [tLayers]);

  const scene = useMemo(
    () => buildScene({ samples, points, countries, coverage }),
    [samples, points, countries, coverage],
  );
  const routeSection = useMemo(() => buildRouteSection(scene.columns, points), [scene.columns, points]);
  const windows = useMemo(() => rainWindows(scene.columns), [scene.columns]);
  const ground = useMemo(() => buildGroundLayers(scene, points, isMobile ? 5 : 11), [scene, points, isMobile]);
  const chips = useMemo(
    () => terrainChips(scene, {
      cloudsUsable: routeSection?.cloudsUsable !== false,
      arrowCount: ground.arrows.length,
    }),
    [scene, routeSection, ground.arrows.length],
  );

  const toggle = (k: keyof TerrainLayerFlags) => setTLayers((p) => ({ ...p, [k]: !p[k] }));
  const [lyrOpen, setLyrOpen] = useState(false);
  const activeCount = chips.filter((c) => tLayers[c.key]).length;

  if (!routeSection) {
    return (
      <div className="r3-tmap-fallback r3-tpanel-empty">
        <p><b>Für diese Tour lässt sich keine Wetterwand bauen.</b></p>
        <p>Kein Punkt der Strecke trägt Temperatur und Wind — ohne beides gibt es keine Vertikale.</p>
      </div>
    );
  }

  return (
    // Reihenfolge: erst die Karte, dann die Schalter. Im Ergebnis ist das
    // Relief die Aussage — mit den Chips obenauf begann die Karte unter dem
    // Falz (auf 1440 x 900 gemessen). In der 3D-Ansicht ist es umgekehrt: dort
    // steht die Buehne ohnehin oben.
    <div className="r3-tpanel">
      <div className="r3-tpanel-map">
        <RouteTerrainMap
          points={points}
          section={routeSection.section}
          layers={tLayers}
          wet={windows}
          tempSegments={ground.tempSegments}
          warnSegments={ground.warnSegments}
          arrows={ground.arrows}
          markerM={markerM}
          onPickDist={onPickDist}
          isMobile={isMobile}
        />
        {/* Ebenen als Layer-Panel wie in den anderen Ansichten: Desktop links am Kartenrand, mobil in der unteren Leiste. */}
        {isMobile && (
          <button type="button" className="r3-lyr-bar r3-lyr-glass" aria-expanded={lyrOpen} aria-controls="r3-lyr-sheet" onClick={() => setLyrOpen((v) => !v)}>
            <span className="r3-lyr-bar-t">Ebenen</span>
            <span className="r3-lyr-bar-n">{activeCount} an</span>
            <span className="r3-lyr-bar-c" aria-hidden="true">{lyrOpen ? '▾' : '▴'}</span>
          </button>
        )}
        {(!isMobile || lyrOpen) && (
          <div id="r3-lyr-sheet" className={`r3-lyr r3-lyr-glass${isMobile ? ' is-sheet' : ''}`} role="group" aria-label="Ebenen der Gelände-Ansicht">
            {(['ground', 'air'] as const).map((g) => (
              <div key={g} className="r3-lyr-group">
                <span className="r3-lyr-grp">{g === 'ground' ? 'Am Boden' : 'In der Luft'}</span>
                {chips.filter((c) => c.group === g).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`r3-lyr-item${tLayers[c.key] ? ' is-on' : ''}${c.ok ? '' : ' is-empty'}`}
                    aria-pressed={tLayers[c.key]}
                    title={c.ok ? undefined : c.note}
                    disabled={c.disabled === true}
                    onClick={() => toggle(c.key)}
                  >
                    <span className="r3-lyr-dot" style={{ background: c.dot }} />
                    <span className="r3-lyr-lab">{c.label}{!c.ok && <small>{c.empty ?? 'ohne Daten'}</small>}</span>
                  </button>
                ))}
              </div>
            ))}
            <span className="r3-lyr-res" title={resolutionNote(terrain)}>Auflösung {resolutionChip(terrain)}</span>
          </div>
        )}
      </div>

      <p className="r3-tpanel-note">
        {curtainNote({ useGust: tLayers.gust, temp: tLayers.wallTemp, clouds: tLayers.clouds })}{' '}
        {NO_INVERSION_NOTE}
      </p>
    </div>
  );
}
