import { useMemo } from 'react';
import { BASEMAP_SOURCE, MapSourcesTile, type MapSourceGroup } from '../map/MapSourcesTile';
import type { GlacierSourceRow } from './glacierClient';
import { fmtRefYear } from './glacierView';

/**
 * „Quellen" on the glacier map — the shared source line of the map pages (`map/MapSourcesTile.tsx`, Brandradar concept).
 * Lists the base map, the relief and every glacier data set from `sources.json` with its licence.
 */
export function GlacierSourcesTile({ sources, ready }: { sources: readonly GlacierSourceRow[] | null; ready: boolean }) {
  const groups = useMemo<MapSourceGroup[]>(() => [
    {
      title: 'Basiskarte und Relief',
      items: [
        BASEMAP_SOURCE,
        { name: 'Mapzen / AWS Terrain Tiles', url: 'https://registry.opendata.aws/terrain-tiles/', what: 'Relief für Schummerung und 3D-Ansicht' },
      ],
    },
    {
      title: 'Gletscherdaten',
      note: sources ? undefined : 'Liste wird geladen oder ist gerade nicht erreichbar',
      items: (sources ?? []).map((s) => ({ name: s.label, url: s.url, what: s.used, licence: `${s.licence} · Bezugsjahr ${fmtRefYear(s.refYear)}` })),
    },
  ], [sources]);
  return <MapSourcesTile title="Quellen der Gletscherkarte" groups={groups} ready={ready} foot={'buscosun bereitet die Daten auf (Zusammenführung, Berechnung, eigene Farbskalen); berechnete Werte sind „Datenbasis, bearbeitet".'} />;
}
