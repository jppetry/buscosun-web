/**
 * Phase RA-250 (`audit/radar-aufloesung.md` §6) — the „250 m" switch of the German radar picture, for the layer panels of
 * the Wetterkarte (`mdk-subseg`) and the Regenradar (`rr-seg` / `rm-seg`). It owns no map state: the preference lives in
 * `scalar/radarHd250.ts` (store + query + event), the words next to it come from the map that draws the tiles
 * (`publishRadarHd250Note`). Germany only — the callers render it for DE places; AT/CH have no open 250-m product.
 */
import { useEffect, useState } from 'react';
import {
  radarHd250FlagFrom, setRadarHd250Pref, onRadarHd250Pref, onRadarHd250Note, currentRadarHd250Note, radarHd250NoteText,
  RADAR_HD250_MIN_ZOOM, type RadarHd250Note,
} from '../scalar/radarHd250';

/** The switch state as React state (query / store at mount, then the event). */
export function useRadarHd250Pref(): boolean {
  const [on, setOn] = useState(() => radarHd250FlagFrom());
  useEffect(() => onRadarHd250Pref(setOn), []);
  return on;
}
/** What the map's tile layer does for the drawn frame (see `RadarHd250Note`). */
export function useRadarHd250Note(): RadarHd250Note {
  const [note, setNote] = useState<RadarHd250Note>(() => currentRadarHd250Note());
  useEffect(() => onRadarHd250Note(setNote), []);
  return note;
}

export function Hd250Switch({ segClass, btnClass, eyebrowClass, accent }: {
  segClass: string; btnClass: string; eyebrowClass: string; accent?: string;
}) {
  const on = useRadarHd250Pref();
  const note = useRadarHd250Note();
  const words = radarHd250NoteText(note, on);
  return (
    <>
      {eyebrowClass ? <span className={eyebrowClass}>Auflösung · DE</span> : null}
      <div className={`${segClass} hd250-seg`} {...(accent ? { 'data-accent': accent } : {})} role="group" aria-label="Auflösung des Niederschlagsradars in Deutschland">
        <button
          type="button" className={`${btnClass}${on ? '' : ' is-active'}`} aria-pressed={!on}
          onClick={() => setRadarHd250Pref(false)}
          title="1-km-Gitter des amtlichen Komposits (DWD RADOLAN-RV) — Messung und Vorhersage"
        >
          1 km
        </button>
        <button
          type="button" className={`${btnClass}${on ? ' is-active' : ''}`} aria-pressed={on}
          onClick={() => setRadarHd250Pref(true)}
          title={`250-m-Gitter aus den 17 DWD-Standortradaren · 250 m radial · 1° Azimut · nur Messungen (Rückblick und jetzt), ab Zoom ${RADAR_HD250_MIN_ZOOM}; die Vorhersage bleibt 1 km`}
        >
          250 m
        </button>
      </div>
      {words ? <span className="hd250-note" data-note={note ?? ''}>{words}</span> : null}
    </>
  );
}
