/**
 * PointStrip — die Punkt-Niederschlags-Timeline (§4/§15 #2): horizontaler
 * Intensitäts-Streifen über die nächsten ~0–120 min AM EXAKTEN PUNKT plus
 * Klartext („Regen beginnt in 12 min"). Die Jogging-Entscheidung.
 *
 * Werte werden direkt aus den geladenen Radar-Frames am Punkt abgegriffen
 * (5-min, RADOLAN/INCA-Auflösung) — kein zusätzlicher Fetch. Phase/Schnee-
 * fallgrenze/Höhe kommen aus dem bestehenden Punktforecast (buildNowcast).
 */

import { sampleRadarQuad } from '../pointForecast/quadSampler';
import { flagForCountry } from '../geocode';
import {
  generatePlainNowcast, radarBand, radarBandLabel, fmtDbz,
  PALETTES, type PaletteId, type PlainSample, RADAR_VMAX,
} from './radarModel';
import type { RadarStack } from './radarFrames';
import { peakPoP, type PointPoP } from './pointPoP';
import type { ConvectiveIndex } from './convectiveIndex';
import type { Nowcast } from '../nowcast/nowcastModel';
import {
  IconCheck, IconWarning, IconHourglass, IconRain, IconSnowflake, IconBolt, IconDrop,
} from './radarIcons';

/** Greift den Punkt-Streifen (lead ≥ 0, 5-min) aus dem Stack ab. */
export function stripSamples(stack: RadarStack, lat: number, lon: number): PlainSample[] {
  const out: PlainSample[] = [];
  for (const f of stack.frames) {
    if (f.leadMinutes < 0) continue;
    const v = sampleRadarQuad(f.values, f.width, f.height, stack.corners, lat, lon, RADAR_VMAX);
    out.push({ min: f.leadMinutes, mmH: v ?? 0 });
  }
  return out;
}

/** Regenintensität (mm/h) je Frame am Punkt — über ALLE Frames (inkl. gemessene
 *  Vergangenheit), index-gleich zu `stack.frames`. Speist das Leisten-Profil. */
export function frameIntensities(stack: RadarStack, lat: number, lon: number): number[] {
  return stack.frames.map(
    (f) => sampleRadarQuad(f.values, f.width, f.height, stack.corners, lat, lon, RADAR_VMAX) ?? 0,
  );
}

interface Props {
  name: string;
  country: 'DE' | 'AT' | 'CH';
  samples: PlainSample[];
  nowMs: number;
  skillMin: number;
  palette: PaletteId;
  nowcast: Nowcast | null;
  expertDbz: boolean;
  /** Ensemble-Regenwahrscheinlichkeit je Lead am Punkt (nur DE; [] sonst). */
  pop?: PointPoP[];
  /** Gewittergefahr-Index am Punkt (CAPE + Zelle + Warnung); null wenn (noch) nicht berechnet. */
  convective?: ConvectiveIndex | null;
  accent?: 'primary' | 'compare';
  onRemove?: () => void;
}

export default function PointStrip({
  name, country, samples, nowMs, skillMin, palette, nowcast, expertDbz, pop = [], convective = null, accent = 'primary', onRemove,
}: Props) {
  // Regenwahrscheinlichkeit: Schlagzeilen-Wert (nächste 60 min) + Lead→% für Tooltips.
  const pop60 = peakPoP(pop, 60);
  const popByLead = new Map(pop.map((p) => [p.leadMinutes, p.prob]));
  const plain = generatePlainNowcast(samples, nowMs, skillMin);
  const bandColors = PALETTES[palette].bandColors;
  const peak = Math.max(0, ...samples.map((s) => s.mmH));
  const elevM = nowcast?.elevationM ?? null;
  const snowLineM = nowcast?.summary.snowLineM ?? null;
  const phase = nowcast?.summary.dominantPhase ?? null;

  // Bar-Höhe: log-skaliert, damit Niesel sichtbar bleibt und Starkregen nicht sprengt.
  const barH = (mmH: number): number => {
    if (mmH < 0.06) return 2;
    const t = Math.log10(1 + mmH) / Math.log10(1 + RADAR_VMAX); // 0..1
    return Math.max(3, Math.round(t * 100));
  };

  const verdictLabel = plain.verdict === 'go' ? 'Los' : plain.verdict === 'caution' ? 'Achtung' : 'Warten';
  const VerdictIcon = plain.verdict === 'go' ? IconCheck : plain.verdict === 'caution' ? IconWarning : IconHourglass;

  return (
    <div className={`rdr-strip rdr-strip-${accent}`}>
      <div className="rdr-strip-head">
        <span className="rdr-strip-name">
          <span aria-hidden="true">{flagForCountry(country)}</span> {shortName(name)}
          {elevM != null && <em className="rdr-strip-elev"> · {Math.round(elevM)} m</em>}
        </span>
        <span className={`rdr-verdict rdr-verdict-${plain.verdict}`}><VerdictIcon size={13} /> {verdictLabel}</span>
        {onRemove && <button type="button" className="rdr-strip-x" onClick={onRemove} aria-label="Vergleichspunkt entfernen">×</button>}
      </div>

      <p className="rdr-strip-headline">{plain.headline}</p>
      <p className="rdr-strip-detail">{plain.detail}</p>

      <div className="rdr-strip-bars" role="img" aria-label={`Niederschlag am Punkt: ${plain.headline}. ${plain.detail}`}>
        {samples.map((s, i) => {
          const band = radarBand(s.mmH);
          const forecast = s.min > 0;
          return (
            <span
              key={i}
              className={`rdr-bar${forecast ? ' is-fc' : ''}`}
              style={{ height: `${barH(s.mmH)}%`, background: band === 'dry' ? 'rgba(150,150,150,0.18)' : bandColors[band] }}
              title={`${s.min === 0 ? 'jetzt' : '+' + s.min + ' min'}: ${s.mmH.toFixed(1).replace('.', ',')} mm/h${popByLead.has(s.min) ? ' · ' + Math.round((popByLead.get(s.min) as number) * 100) + ' % Regenchance' : ''}${expertDbz ? ' · ' + fmtDbz(s.mmH) : ''}`}
            />
          );
        })}
      </div>
      <div className="rdr-strip-axis">
        <span>jetzt</span>
        <span>+30</span>
        <span>+60</span>
        <span>+90</span>
        <span>+{samples.length ? samples[samples.length - 1].min : 120} min</span>
      </div>

      <div className="rdr-strip-chips">
        {pop.length > 0 && (
          <span className="rdr-chip rdr-chip-pop" title="Ensemble-Regenwahrscheinlichkeit (15 Member, RADOLAN-Flow) — höchster Wert der nächsten 60 min">
            <IconDrop size={12} /> Regenchance {Math.round(pop60 * 100)} % · 60 min
          </span>
        )}
        <span className="rdr-chip"><IconDrop size={12} /> Spitze {peak.toFixed(1).replace('.', ',')} mm/h</span>
        {phase && phase !== 'dry' && <PhaseChip phase={phase} />}
        {snowLineM != null && <span className="rdr-chip rdr-chip-snow"><IconSnowflake size={12} /> Schneefallgrenze {snowLineM} m</span>}
        {convective && convective.level !== 'none' && convective.level !== 'low' ? (
          <span
            className={`rdr-chip ${convective.level === 'high' ? 'rdr-chip-warn' : 'rdr-chip-storm'}`}
            title={`Gewittergefahr ${convective.label}${convective.capeBased ? '' : ' (ohne CAPE — nur Radar-Intensität)'} · ${convective.drivers.join(' · ')}`}
          >
            <IconBolt size={12} /> Gewittergefahr: {convective.label}
          </span>
        ) : (
          !convective && nowcast && nowcast.summary.thunderRiskPct >= 30 && (
            <span className="rdr-chip rdr-chip-warn"><IconBolt size={12} /> Gewitter {nowcast.summary.thunderRiskPct} %</span>
          )
        )}
        {expertDbz && <span className="rdr-chip">{fmtDbz(peak)}</span>}
        <span className="rdr-chip rdr-chip-muted">{radarBandLabel(radarBand(samples[0]?.mmH ?? 0))} jetzt</span>
      </div>
    </div>
  );
}

function shortName(name: string): string { return name.split(',')[0]; }

/** Phasen-Chip mit passendem Line-Icon (statt Emoji). */
function PhaseChip({ phase }: { phase: string }) {
  switch (phase) {
    case 'rain': return <span className="rdr-chip"><IconRain size={12} /> Regen</span>;
    case 'snow': return <span className="rdr-chip rdr-chip-snow"><IconSnowflake size={12} /> Schnee</span>;
    case 'sleet': return <span className="rdr-chip rdr-chip-snow"><IconSnowflake size={12} /> Schneeregen</span>;
    case 'freezing': return <span className="rdr-chip rdr-chip-warn"><IconWarning size={12} /> gefrierender Regen</span>;
    default: return null;
  }
}
