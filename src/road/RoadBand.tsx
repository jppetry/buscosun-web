/**
 * AW-5 — Streckenband: the corridor by kilometre. Each km takes the class of the nearest measuring station within
 * 10 km (plan/design); further away the band is sand-hatched ("keine Messung im 10-km-Umkreis"); a station without
 * a valid measurement is hatched too — never coloured like "dry" (D-04). Border marker where the corridor leaves
 * Germany: beyond it there is no open road measurement (forecast points come with AW-6).
 *
 * AW-6.1b: a second, thinner row under the measured bar — the WEATHER forecast of buscosun Fusion 8 per axis point
 * (every 5 km) for the chosen hour: forecast air temperature in three bands (own colours, not the road classes) and a
 * mark where precipitation is likely. It also covers stretches without any station.
 */
import type { RoadPoint } from './roadContract';
import type { RoadCorridor } from './roadClient';
import { ROAD_CLASS_COLOR, bandSegments, dec, isHatched, kmIn, kmTicks, shieldText, corridorEnds } from './roadView';
import { ROAD_CLASS_LABEL } from './roadClasses';
import { ROAD_FC_AIR_COLOR, ROAD_FC_AIR_LABEL, ROAD_FC_PRECIP_PP, roadFcLine, type RoadFcCell } from './roadFcView';

interface Props {
  corridor: RoadCorridor;
  byId: ReadonlyMap<string, RoadPoint>;
  dir: 0 | 1;
  selectedId: string | null;
  standLabel: string;
  zust: boolean;
  onPick: (id: string) => void;
  /** Forecast row (null = no usable forecast) and its label, e.g. `Prognose Luft +3 h · 15:00 · Lauf 11:05`. */
  fc?: RoadFcCell[] | null;
  fcLabel?: string;
}

const COUNTRY: Record<string, string> = { AT: 'AT', CH: 'CH', CZ: 'CZ', PL: 'PL', FR: 'FR', NL: 'NL', BE: 'BE', DK: 'DK', LU: 'LU' };

export default function RoadBand({ corridor: c, byId, dir, selectedId, standLabel, zust, onPick, fc, fcLabel }: Props) {
  const len = c.lengthKm;
  const pct = (km: number) => `${Math.max(0, Math.min(100, (km / len) * 100))}%`;
  const segs = bandSegments(c, byId, dir);
  const ends = corridorEnds(c, dir);
  const towns = c.towns.map(([km, name]) => [kmIn(c, km, dir), name] as const).sort((a, b) => a[0] - b[0]);
  const ticks = kmTicks(len);
  const borders = c.borders.map((b) => ({ km: kmIn(c, b.km, dir), country: COUNTRY[b.country] ?? b.country }));
  return (
    <section className="aw-band" aria-label="Streckenband">
      <div className="aw-band-head">
        <span className="aw-eyebrow is-accent">Streckenband</span>
        <span className="aw-band-title">{c.shields.join(' · ')} · {ends.from} → {ends.to} · {dec(len, 0)} km</span>
        <span className="aw-band-stand">{standLabel}</span>
      </div>
      <div className={`aw-band-track${fc ? ' has-fc' : ''}`}>
        <div className="aw-band-bar">
          {segs.map((g, i) => (
            <div
              key={i}
              className={`aw-band-seg${g.cls === 'gap' || isHatched(g.cls) ? ' is-gap' : ''}`}
              style={{ left: pct(g.fromKm), width: pct(g.toKm - g.fromKm), ...(g.cls !== 'gap' && !isHatched(g.cls) ? { background: zust ? ROAD_CLASS_COLOR[g.cls] : '#8B95A3' } : {}) }}
            />
          ))}
        </div>
        {fc && (
          <div className="aw-band-fc" role="group" aria-label={fcLabel ?? 'Prognose Luft'}>
            {fc.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`aw-band-fc-cell${g.cls === 'gap' ? ' is-gap' : ''}${g.id === selectedId ? ' is-sel' : ''}${g.mark !== 'none' ? ` is-${g.mark}` : ''}`}
                style={{ left: pct(g.fromKm), width: pct(g.toKm - g.fromKm), ...(g.cls !== 'gap' ? { background: ROAD_FC_AIR_COLOR[g.cls] } : {}) }}
                aria-label={`Prognosepunkt km ${dec(g.km, 0)}: ${g.value ? roadFcLine(g.value) : 'keine Prognose'}`}
                title={`km ${dec(g.km, 0)} · ${g.value ? roadFcLine(g.value) : 'keine Prognose'}`}
                aria-pressed={g.id === selectedId}
                onClick={() => onPick(g.id)}
              />
            ))}
          </div>
        )}
        {borders.map((b) => {
          // At a corridor end there is no room on the far side: both labels go inward.
          // Short label like the design ("DE · AT"): a long one covered the ticks next to it. The meaning sits in the
          // title/aria text, in the briefing ("ab km … keine offene Fahrbahnmessung") and in the dock.
          const atEnd = b.km > len * 0.85, atStart = b.km < len * 0.15;
          const explain = `Grenze ${b.country}: dahinter keine offene Fahrbahnmessung`;
          return (
            <div key={`${b.country}${b.km}`} className="aw-band-border" style={{ left: pct(b.km) }} title={explain} role="img" aria-label={explain}>
              {atEnd ? <span className="aw-band-border-a">DE | {b.country}</span>
                : atStart ? <span className="aw-band-border-b">{b.country} | DE</span>
                  : <><span className="aw-band-border-a">DE</span><span className="aw-band-border-b">{b.country}</span></>}
            </div>
          );
        })}
        {c.stations.map((s) => {
          const p = byId.get(s.id);
          const cls = p?.cls ?? 'nodata';
          const km = kmIn(c, s.km, dir);
          const sel = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              className={`aw-band-tick${sel ? ' is-sel' : ''}${isHatched(cls) ? ' is-hatched' : ''}`}
              style={{ left: `calc(${pct(km)} - ${sel ? 8 : 6}px)`, ...(!isHatched(cls) ? { background: zust ? ROAD_CLASS_COLOR[cls] : '#8B95A3' } : {}) }}
              aria-label={`${p?.n ?? s.id}, km ${dec(km, 0)}, ${ROAD_CLASS_LABEL[cls].label}`}
              aria-pressed={sel}
              onClick={() => onPick(s.id)}
            />
          );
        })}
      </div>
      <div className="aw-band-towns">
        {towns.map(([km, name], i) => (
          <span key={`${name}${i}`} style={{ left: pct(km), transform: i === 0 && km < len * 0.04 ? 'none' : km > len * 0.96 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{name}</span>
        ))}
      </div>
      <div className="aw-band-km">
        {ticks.map((k, i) => (
          <span key={k} style={{ left: pct(k), transform: i === 0 ? 'none' : k + (ticks[1] ?? 0) > len ? 'translateX(-100%)' : 'translateX(-50%)' }}>km {k}</span>
        ))}
      </div>
      <div className="aw-band-legend">
        <span><i className="aw-sw" style={{ background: '#5E97D1' }} />Messung DWD</span>
        <span><i className="aw-sw is-gap" />keine Messung im 10-km-Umkreis</span>
        <span className="aw-band-legend-note">{shieldText(c.road)}: Messpunkt, nicht Strecke</span>
      </div>
      {fc && (
        <div className="aw-band-legend is-fc">
          <span className="aw-band-fc-label">{fcLabel}</span>
          {(['frost', 'near', 'above'] as const).map((k) => <span key={k}><i className="aw-sw" style={{ background: ROAD_FC_AIR_COLOR[k] }} />{ROAD_FC_AIR_LABEL[k]}</span>)}
          <span><i className="aw-sw is-rain" />Regen ab {ROAD_FC_PRECIP_PP} %</span>
          <span><i className="aw-sw is-snow" />Schnee-Anteil</span>
        </div>
      )}
    </section>
  );
}
