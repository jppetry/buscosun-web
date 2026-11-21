/**
 * Phase GO — "Gemessen in der Nähe": the latest station measurement per quantity next to the model values of "Wetter am Gletscher"
 * (tab "Heute" and the Heute board). Networks: Land Tirol (LWD Tirol, HD Tirol), Province of Bolzano, the IMIS stations of the SLF
 * (phase GI) and the DWD / TAWES / SwissMetNet stations of the measurement mirror — whichever stands nearest to the glacier's
 * outline within the mapping's window.
 *
 * Every value is a measurement and says so (`data-origin="measured"`), with station name, elevation, distance, elevation difference
 * and age. The fixed sentence says where the instruments stand. A measurement never replaces or corrects a model value: the card
 * shows no difference and no word about conditions. A glacier without a station in range renders nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import { OriginChip } from './GlacierParts';
import { fmt0 } from './glacierView';
import { loadStationHour, loadStationMap, type GlacierBases } from './glacierClient';
import type { GlacierCatalogEntry } from './glacierContract';
import { GLACIER_STN_SITE_NOTE, stnMapSection, stnPointerKey, type GlacierStnPointer, type StnHourDoc, type StnMapDoc, type StnMapFrom } from './glacierStationContract';
import { ageText, dzText, stationView, whereText, type StnView, type StnViewStation } from './glacierStationView';

/**
 * Elevation ladder: the glacier's span as a bar with its median, the station as a dot at its own elevation — where the instrument
 * stands against the ice, at a glance. Decorative; the sentence next to it carries the same numbers.
 */
function Ladder({ z, elev }: { z: readonly [number, number, number]; elev: number }) {
  const H = 68, PAD = 7;
  const lo = Math.min(z[0], elev), hi = Math.max(z[2], elev), span = Math.max(1, hi - lo);
  const y = (m: number) => PAD + ((hi - m) * (H - 2 * PAD)) / span;
  return (
    <svg className="gl-stn-ladder" viewBox={`0 0 24 ${H}`} width="24" height={H} aria-hidden="true">
      <line x1="12" x2="12" y1={PAD - 4} y2={H - PAD + 4} className="gl-stn-rail" />
      <rect x="7" width="10" y={y(z[2])} height={Math.max(2, y(z[0]) - y(z[2]))} rx="3" className="gl-stn-ice" />
      <line x1="5" x2="19" y1={y(z[1])} y2={y(z[1])} className="gl-stn-median" />
      <circle cx="12" cy={y(elev)} r="4.5" className="gl-stn-dot" />
    </svg>
  );
}

function Station({ s, z, nowMs, from }: { s: StnViewStation; z: readonly [number, number, number]; nowMs: number; from: StnMapFrom }) {
  const where = whereText(s.km, from);
  return (
    <li className="gl-stn-station" data-origin="measured" data-station={s.id}>
      <Ladder z={z} elev={s.elev} />
      <div className="gl-stn-body">
        <div className="gl-stn-head">
          <b>{s.name}<span>{fmt0(s.elev)} m</span></b>
          {s.ms != null ? <time dateTime={new Date(s.ms).toISOString()}>{ageText(nowMs - s.ms)}</time> : null}
        </div>
        <p className="gl-stn-where">
          {where[0].toUpperCase()}{where.slice(1)}, {dzText(s.dz)}.{' '}
          {s.operatorUrl ? <a href={s.operatorUrl} target="_blank" rel="noopener noreferrer">{s.operator}</a> : s.operator}.
        </p>
        <dl className="gl-stn-values">
          {s.values.map((v) => (
            <div key={v.q}>
              <dt>{v.label}</dt>
              {v.text != null
                ? <dd><b className="gl-num" data-origin="measured">{v.text}</b></dd>
                : <dd className="gl-stn-none"><strong>Keine Daten.</strong> {v.why ? `${v.why[0].toUpperCase()}${v.why.slice(1)}.` : ''}</dd>}
            </div>
          ))}
        </dl>
      </div>
    </li>
  );
}

export default function GlacierStationCard({ g, pointer, byId, nowMs, bases }: {
  g: GlacierCatalogEntry; pointer: GlacierStnPointer | null; byId: ReadonlyMap<string, GlacierCatalogEntry>; nowMs: number; bases: GlacierBases;
}) {
  const catalogIds = useMemo(() => new Set(byId.keys()), [byId]);
  // `undefined` = still loading, `null` = not loadable
  const [map, setMap] = useState<StnMapDoc | null | undefined>(undefined);
  const [hour, setHour] = useState<StnHourDoc | null | undefined>(undefined);
  const mapFile = pointer?.map ?? null, hourKey = pointer ? stnPointerKey(pointer) : null;
  useEffect(() => {
    let alive = true;
    setMap(undefined);
    if (!mapFile) return;
    void loadStationMap(mapFile, catalogIds, bases).then((d) => { if (alive) setMap(d); }, () => { if (alive) setMap(null); });
    return () => { alive = false; };
  }, [mapFile, catalogIds, bases]);
  const mapped = !!(map && stnMapSection(map).glaciers[g.id]);
  useEffect(() => {
    let alive = true;
    setHour(undefined);
    // the hour file is read only for a glacier that has a station
    if (!hourKey || !mapped) return;
    void loadStationHour(hourKey, bases).then((d) => { if (alive) setHour(d); }, () => { if (alive) setHour(null); });
    return () => { alive = false; };
  }, [hourKey, mapped, bases]);

  const view = useMemo(() => (map && mapped && hour !== undefined ? stationView(map, hour, g.id, nowMs) : null), [map, mapped, hour, g.id, nowMs]);
  return view ? <GlacierStationBlock view={view} z={g.z} nowMs={nowMs} /> : null;
}

/** The card itself, from a ready view (no loading inside — the verifier renders it as it is). */
export function GlacierStationBlock({ view, z, nowMs }: { view: StnView; z: readonly [number, number, number]; nowMs: number }) {
  return (
    <section className="gl-card gl-stn" aria-label="Gemessen in der Nähe">
      <div className="gl-card-head"><b>GEMESSEN IN DER NÄHE</b><OriginChip origin="measured" /></div>
      <p className="gl-honest">{GLACIER_STN_SITE_NOTE}.</p>
      <ul className="gl-stn-list">
        {view.stations.map((s) => <Station key={s.id} s={s} z={z} nowMs={nowMs} from={view.from} />)}
      </ul>
      <p className="gl-fine">
        Links: die Höhenspanne des Gletschers als Balken, der Strich ist seine mittlere Höhe, der Punkt die Station. Die Werte sind Rohdaten
        der Betreiber. Die Seite lässt weg, was außerhalb benannter Grenzen liegt, springt, stillsteht oder älter als drei Stunden ist;
        Schneehöhe und Strahlung unter null stehen als 0. Eine Messung ersetzt keinen Modellwert.
        {view.from === 'outline' ? ' Der Abstand zählt vom Umriss des Gletschers bis zur Station.' : ''}
        {view.stations.some((s) => s.net === 'imis') ? ' Die Werte des SLF sind Mittel über 30 Minuten, die Böe ist die stärkste Messung dieser 30 Minuten.' : ''}
        {view.stations.some((s) => s.values.some((v) => v.q === 'dsnow')) ? ' Änderung der Schneehöhe: Schneehöhe jetzt minus Schneehöhe vor 24, 48 oder 72 Stunden, wie der Betreiber sie liefert — sie kann negativ sein.' : ''}
      </p>
      <p className="gl-fine gl-stn-sources">
        {view.sources.map((s) => (
          <span key={s.id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.note}</a> (<a href={s.licenceUrl} target="_blank" rel="noopener noreferrer">{s.licence}</a>)
          </span>
        ))}
      </p>
    </section>
  );
}
