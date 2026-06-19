/**
 * Tag-Detail (US-1.3/1.4/1.5/5.1/5.2).
 *
 * Unsicherheits-Temperaturchart + Regenwahrscheinlichkeit in Klartext +
 * Hinweis bei niedriger Sicherheit + Progressive-Disclosure-Affordanz. Im
 * Experten-Modus zusätzlich die Modelle direkt nebeneinander.
 */

import { precipExplain, PRECIP_WET_EXPLAIN } from './confidenceModel';
import { levelStyle, type DayStab, type DayVM } from './forecastView';
import type { MultiModelForecast } from './multiModel';
import type { ForecastHistory } from './forecastHistory';
import UncertaintyChart from './UncertaintyChart';

interface Props {
  forecast: MultiModelForecast;
  vm: DayVM;
  lowDay: DayVM | null;
  history: ForecastHistory | null;
  stab: DayStab | null;
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });

export default function DayDetail({ forecast, vm, lowDay, history, stab }: Props) {
  const s = levelStyle(vm.confidence.level);
  const hours = forecast.hours.filter((h) => h.dayIndex === vm.day.leadDays);
  const ghosts = history?.ghostsByDay[vm.day.dateISO]?.ghosts ?? [];
  const precipPct = Math.round(vm.precipProb * 100);

  return (
    <>
      <div className="fc-block-head">
        <span className="rt-eyebrow fc-eyebrow">{fmtDate(vm.day.dateMs)} im Detail · Temperaturverlauf mit Unsicherheit</span>
        <span className="fc-detail-sub" style={{ color: s.color }}>{s.glyph} {vm.confidence.label} · {vm.confidence.pct} %</span>
      </div>

      <div className="fc-detail-grid">
        {/* Chart (mit Verlaufs-Ghost-Lines, US-3.3) */}
        <div className="rt-card fc-chart-card">
          <UncertaintyChart hours={hours} ghosts={ghosts} showGhosts={true} />
        </div>

        {/* Seitenspalte */}
        <div className="fc-detail-side">
          {/* Regenwahrscheinlichkeit (US-1.3) */}
          <div className="rt-card fc-precip">
            <span className="rt-eyebrow fc-eyebrow">Regenwahrscheinlichkeit</span>
            <div className="fc-precip-row">
              <span className="fc-precip-pct">{precipPct} %</span>
              <span className="fc-precip-explain">{precipExplain(vm.precipProb)}</span>
            </div>
            <p className="fc-precip-note">{PRECIP_WET_EXPLAIN}</p>
          </div>

          {/* Stabilität dieses Tages (US-3.2) */}
          {stab && stab.stability.level !== 'unknown' && (
            <div className="rt-card fc-stab-detail">
              <span className="rt-eyebrow fc-eyebrow">Stabilität · letzte Läufe</span>
              <div className="fc-stab-detail-row">
                <span className={`fc-stab-chip is-${stab.stability.level}`}>{stab.stability.level === 'stable' ? '● ' : '~ '}{stab.stability.label}</span>
                {stab.delta.deltaC != null && !stab.delta.isSmall && (
                  <span className="fc-stab-delta">{stab.delta.direction === 'up' ? '▲ +' : '▼ −'}{Math.abs(Math.round(stab.delta.deltaC))}° seit gestern</span>
                )}
              </div>
              <p className="fc-stab-detail-note">
                {stab.stability.level === 'stable'
                  ? 'Die Prognose für diesen Tag ist über die letzten Läufe weitgehend gleich geblieben.'
                  : 'Die Prognose hat über die letzten Läufe stärker geschwankt — noch nicht eingelaufen.'}
                {' '}<em>Stabil heißt nicht automatisch richtig.</em>
              </p>
            </div>
          )}

          {/* Hinweis bei niedriger Sicherheit (US-1.4) */}
          {lowDay && (
            <div className="rt-card fc-lowhint">
              <span className="fc-lowhint-glyph">!</span>
              <div>
                <strong>Prognose noch unsicher</strong>
                <p>Ab {lowDay.day.weekdayShort} ist die Sicherheit niedrig (&lt; 40 %). Am besten morgen erneut prüfen.</p>
              </div>
            </div>
          )}

        </div>
      </div>

    </>
  );
}
