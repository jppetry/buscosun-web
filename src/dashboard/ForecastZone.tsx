/**
 * Prognose-Zone (Phase DB): Zeitraum Heute/3/7/14 Tage, Tageskarten mit vier Tagesphasen, Stundenverlauf.
 * Nur „3 Tage" ist in der Vorlage gezeichnet; Heute/7/14 Tage nutzen dieselben Karten im selben Raster
 * (Jans Entscheidung 29.09.: aus den Bausteinen abgeleitet, audit/dashboard.md §6).
 */
import { useId } from 'react';
import { DASH_RANGES, DASH_RANGE_LABEL, type DashRange } from './dashUrl';
import { WeatherIcon, type SunVariant } from './icons';
import { HourlyChart, HourlyTicks } from './charts';
import { Val } from './tiles';
import type { DayVM, ZoneVM } from './model/types';

const PHASE_SUN: Record<string, SunVariant> = { MORGEN: 'mittag', MITTAG: 'mittag', ABEND: 'abend', NACHT: 'mittag' };

export function ForecastZone({ vm, range, onRange }: { vm: ZoneVM; range: DashRange; onRange: (r: DashRange) => void }) {
  const patternId = `dbd-ens-${useId().replace(/[^a-z0-9]/gi, '')}`;
  return (
    <section className="dbd-zone" aria-label="Prognose">
      <div className="dbd-zone-head">
        <span className="dbd-zone-label">PROGNOSE</span>
        <div className="dbd-seg" role="group" aria-label="Zeitraum">
          {DASH_RANGES.map((r) => (
            <button key={r} type="button" className={r === range ? 'is-active' : undefined} aria-pressed={r === range} onClick={() => { if (r !== range) onRange(r); }}>
              {DASH_RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <span className="dbd-zone-info">
          <Val v={vm.head.period} /> · <Val v={vm.head.models} long /> · <Val v={vm.head.ensemble} />
        </span>
        <span className={`dbd-dotline dbd-zone-conf${vm.head.confCls === 'fair' ? ' is-fair' : ''}`}><i /><Val v={vm.head.conf} long /></span>
      </div>
      <p className="dbd-zone-lead"><Val v={vm.lead} long /></p>
      <div className="dbd-days">
        {vm.days.map((d) => <DayCard key={d.key} d={d} />)}
      </div>
      <div className="dbd-hourly">
        <div className="dbd-hourly-head">
          <span className="dbd-eyebrow">STUNDENVERLAUF ÜBER DEN GEWÄHLTEN ZEITRAUM</span>
          <Val v={vm.hourly ? vm.hourly.head : vm.hourlyHead} className="dbd-hourly-sub" />
        </div>
        <div className="dbd-hourly-chart">{vm.hourly && <HourlyChart vm={vm.hourly} patternId={patternId} />}</div>
        {vm.hourly && <HourlyTicks vm={vm.hourly} />}
        {vm.hourly && <HourlyTicks vm={vm.hourly} mobile />}
        <div className="dbd-legend">
          <span><i style={{ width: 14, height: 2.5, background: '#C97B47' }} /> Temperatur + Bandbreite p10–p90</span>
          <span><i style={{ width: 14, height: 2, background: '#3A6FA8' }} /> Taupunkt</span>
          <span><i style={{ width: 10, height: 8, background: '#3A6FA8', opacity: .55, borderRadius: 2 }} /> Menge mm/h</span>
          <span><i style={{ width: 12, height: 9, background: '#E0D6BE', borderRadius: 2 }} /> Nacht</span>
          <span><i style={{ width: 0, height: 10, borderLeft: '1px dashed #8B7355' }} /> Bandbreite erreicht ±2/3/4 °C</span>
          <span className="dbd-legend-right">Tagesgrenzen als Linie</span>
        </div>
      </div>
    </section>
  );
}

function DayCard({ d }: { d: DayVM }) {
  return (
    <article className={`dbd-day${d.highlight ? ' is-hl' : ''}`} aria-label={d.title}>
      <div className="dbd-day-head">
        <span>
          <span className="dbd-day-title">{d.title}</span>
          <Val v={d.text} className="dbd-day-text" long />
        </span>
        <span className="dbd-day-right">
          <WeatherIcon icon={d.icon} size={30} variant="day" />
          <span className="dbd-day-temps">
            <Val v={d.tmax} className="dbd-day-max" />
            <Val v={d.tmin} className="dbd-day-min" />
          </span>
        </span>
      </div>
      <div className="dbd-phases">
        {d.phases.map((p) => (
          <div key={p.id} className={`dbd-phase${p.highlight ? ' is-hl' : ''}`}>
            <div className="dbd-phase-l">{p.id}</div>
            <WeatherIcon icon={p.icon} size={20} variant={PHASE_SUN[p.id]} stroke={2.2} />
            <div className="dbd-phase-t"><Val v={p.temp} /></div>
            <div className={`dbd-phase-p${p.popLevel === 'faint' ? ' is-faint' : p.popLevel === 'high' ? ' is-high' : ''}`}><Val v={p.pop} /></div>
            <div className="dbd-phase-w"><Val v={p.wind} /></div>
          </div>
        ))}
      </div>
      <div className="dbd-day-vals">
        <div className="dbd-day-grid">
          <div><div className="dbd-dv-l">REGEN</div><div className={`dbd-dv-v${d.rainWet ? ' is-wet' : ''}`}><Val v={d.rain} /></div><div className="dbd-dv-s"><Val v={d.rainSub} /></div></div>
          <div><div className="dbd-dv-l">{d.mid.label}</div><div className="dbd-dv-v"><Val v={d.mid.value} /></div><div className={`dbd-dv-s${d.mid.subWarn ? ' is-warn' : ''}`}><Val v={d.mid.sub} /></div></div>
          <div><div className="dbd-dv-l">SONNE</div><div className="dbd-dv-v"><Val v={d.sun} /></div><div className="dbd-dv-s"><Val v={d.sunSub} /></div></div>
        </div>
        <div className="dbd-day-conf">
          <span>Konfidenz</span>
          <div className={`dbd-bar${d.conf.cls === 'fair' ? ' is-fair' : ''}`}>{d.conf.pct != null && <div style={{ width: `${d.conf.pct}%` }} />}</div>
          <Val v={d.conf.text} className={`dbd-day-conf-pct${d.conf.cls === 'fair' ? ' is-fair' : ''}`} />
        </div>
      </div>
    </article>
  );
}
