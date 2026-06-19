/**
 * E-Bike-Akku-Panel: Konfiguration (Kapazität, Anfangs-SoC, Stufe, Masse,
 * Eigenleistung), SoC-Verlauf und Warnung/Empfehlung. Präsentational — die
 * Berechnung läuft in TourView (damit Samples auf Sample-Ebene mit dem Akku
 * angereichert werden können).
 */

import { useMemo } from 'react';
import {
  ASSIST_SPECS, RESERVE_FRACTION,
  type EbikeAssist, type EbikeConfig, type EbikeResult,
} from './ebikeBattery';
import { IconWarning } from './routeIcons';

interface Props {
  cfg: EbikeConfig;
  onChange: (c: EbikeConfig) => void;
  result: EbikeResult;
}

export default function EbikeBatteryPanel({ cfg, onChange, result }: Props) {
  const set = (patch: Partial<EbikeConfig>) => onChange({ ...cfg, ...patch });
  const finalPct = Math.round(result.finalSocFraction * 100);
  const usedWh = Math.round(result.totalWh);
  const initWh = Math.round(cfg.capacityWh * cfg.startSoC);
  const lowReserve = result.finalSocFraction < RESERVE_FRACTION;

  return (
    <div className="tp-block eb">
      <div className="tp-block-head">
        <span className="tp-block-title">E-Bike-Akku</span>
        <span className="eb-pct">{finalPct} % am Ziel</span>
      </div>

      <div className="eb-sliders">
        <label className="mv-slider">
          <span className="mv-slider-head">
            <span className="mv-slider-label">Akkukapazität</span>
            <span className="mv-slider-value">{cfg.capacityWh} Wh</span>
          </span>
          <input type="range" min={250} max={750} step={25} value={cfg.capacityWh}
            onChange={(e) => set({ capacityWh: parseFloat(e.target.value) })} />
        </label>
        <label className="mv-slider">
          <span className="mv-slider-head">
            <span className="mv-slider-label">Anfangs-Ladestand</span>
            <span className="mv-slider-value">{Math.round(cfg.startSoC * 100)} %</span>
          </span>
          <input type="range" min={0.3} max={1} step={0.05} value={cfg.startSoC}
            onChange={(e) => set({ startSoC: parseFloat(e.target.value) })} />
        </label>
        <label className="mv-slider">
          <span className="mv-slider-head">
            <span className="mv-slider-label">Gesamtmasse</span>
            <span className="mv-slider-value">{cfg.totalMassKg} kg</span>
          </span>
          <input type="range" min={60} max={140} step={5} value={cfg.totalMassKg}
            onChange={(e) => set({ totalMassKg: parseFloat(e.target.value) })} />
        </label>
        <label className="mv-slider">
          <span className="mv-slider-head">
            <span className="mv-slider-label">Eigenleistung</span>
            <span className="mv-slider-value">{cfg.riderPowerW} W</span>
          </span>
          <input type="range" min={50} max={200} step={10} value={cfg.riderPowerW}
            onChange={(e) => set({ riderPowerW: parseFloat(e.target.value) })} />
        </label>
      </div>

      <div className="eb-assist" role="group" aria-label="Unterstützungs-Stufe">
        {(['eco', 'tour', 'sport', 'turbo'] as EbikeAssist[]).map((a) => (
          <button
            key={a}
            type="button"
            className={`eb-assist-btn${cfg.assist === a ? ' is-active' : ''}`}
            onClick={() => set({ assist: a })}
          >
            {ASSIST_SPECS[a].label}
            <span className="eb-assist-cap">{ASSIST_SPECS[a].motorCapW} W</span>
          </button>
        ))}
      </div>

      <SoCProfile result={result} initialWh={initWh} capacityWh={cfg.capacityWh} />

      <dl className="tp-summary eb-summary">
        <div><dt>Gesamtverbrauch</dt><dd>{usedWh} Wh</dd></div>
        <div><dt>Start-Akku</dt><dd>{initWh} Wh</dd></div>
        <div><dt>Am Ziel</dt><dd className={lowReserve ? 'eb-low' : ''}>{Math.max(0, initWh - usedWh)} Wh · {finalPct} %</dd></div>
        {!result.reachesEnd && result.emptyAtDist != null && (
          <div><dt>Leer bei</dt><dd className="eb-low">{(result.emptyAtDist / 1000).toFixed(1).replace('.', ',')} km</dd></div>
        )}
      </dl>

      {lowReserve && (
        <p className="tp-note tp-note-warn">
          <IconWarning size={14} /> Akku reicht {result.reachesEnd ? 'knapp nicht für die Reserve' : 'nicht für diese Tour'}.{' '}
          {result.recommendation ? (
            <>Reduziere Unterstützung auf <strong>{ASSIST_SPECS[result.recommendation.assist].label}</strong> →
              {' '}voraussichtlich {Math.round(result.recommendation.expectedFinalSoc * 100)} % am Ziel ({Math.round(result.recommendation.expectedTotalWh)} Wh).</>
          ) : (
            <>Auch die niedrigste Unterstützung reicht nicht — größeren Akku verwenden oder Strecke kürzen.</>
          )}
        </p>
      )}

      <p className="tp-note">
        Ladestationen entlang der Route via OpenChargeMap — folgt in Phase 2.
      </p>
    </div>
  );
}

function SoCProfile({ result, initialWh, capacityWh }: {
  result: EbikeResult; initialWh: number; capacityWh: number;
}) {
  const profile = useMemo(() => {
    const segs = result.segments;
    if (segs.length < 2) return null;
    const totalDist = segs[segs.length - 1].dist;
    if (totalDist <= 0) return null;
    const W = 600, H = 80, padY = 6;
    const y = (soc: number) => padY + (1 - soc) * (H - 2 * padY);
    const x = (d: number) => (d / totalDist) * W;

    let line = `M 0 ${y(initialWh / capacityWh).toFixed(1)}`;
    for (const s of segs) line += ` L ${x(s.dist).toFixed(1)} ${y(s.socFraction).toFixed(1)}`;
    const area = `${line} L ${W} ${H} L 0 ${H} Z`;
    return { W, H, line, area, totalKm: totalDist / 1000 };
  }, [result, initialWh, capacityWh]);

  if (!profile) return null;
  return (
    <figure className="eb-profile">
      <figcaption>SoC-Verlauf</figcaption>
      <svg viewBox={`0 0 ${profile.W} ${profile.H}`} preserveAspectRatio="none" className="eb-profile-svg" aria-hidden="true">
        <path d={profile.area} fill="rgba(122, 148, 102, 0.18)" />
        <path d={profile.line} fill="none" stroke="var(--sage-600, #7a9466)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="route-profile-axis">
        <span>0 km</span>
        <span>{Math.round(initialWh)} Wh</span>
        <span>{profile.totalKm.toFixed(1).replace('.', ',')} km</span>
      </div>
    </figure>
  );
}
