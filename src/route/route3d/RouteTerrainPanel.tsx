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
import { TerrainChipButton } from './Route3DView';
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
      </div>

      <div className="r3-chiprow r3-tpanel-chips">
        <div className="r3-chips" role="group" aria-label="Ebenen der Gelände-Ansicht">
          <span className="r3-chipgrp">Am Boden</span>
          {chips.filter((c) => c.group === 'ground').map((c) => (
            <TerrainChipButton key={c.key} chip={c} on={tLayers[c.key]} onToggle={toggle} />
          ))}
          <span className="r3-chipgrp">In der Luft</span>
          {chips.filter((c) => c.group === 'air').map((c) => (
            <TerrainChipButton key={c.key} chip={c} on={tLayers[c.key]} onToggle={toggle} />
          ))}
        </div>
        <span className="r3-res" title={resolutionNote(terrain)}>Auflösung {resolutionChip(terrain)}</span>
      </div>

      <p className="r3-tpanel-note">
        {curtainNote({ useGust: tLayers.gust, temp: tLayers.wallTemp, clouds: tLayers.clouds })}{' '}
        {NO_INVERSION_NOTE}
      </p>
    </div>
  );
}
