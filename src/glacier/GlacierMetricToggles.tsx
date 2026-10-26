/**
 * "Karte färben nach" as toggles (Jan 26.10.): one switch per metric instead of the origin chip on the row. The metrics colour the
 * same map, so exactly one is on; the one that is on shows a short description underneath, with its origin chip (no value without
 * an origin). Locked metrics keep their reason and cannot be switched on. Used by the dock (tablet, desktop) and by the "Layer" page of
 * the phone layout.
 */
import { OriginChip } from './GlacierParts';
import type { GlacierMetricDef } from './glacierView';
import { GLACIER_METRICS, type GlacierMetric } from './glacierState';

interface Props {
  metric: GlacierMetric;
  onMetric: (m: GlacierMetric) => void;
  defs: Readonly<Record<GlacierMetric, GlacierMetricDef>>;
}

export default function GlacierMetricToggles({ metric, onMetric, defs }: Props) {
  return (
    <div role="group" aria-label="Größe der Karte">
      {GLACIER_METRICS.map((m) => {
        const d = defs[m];
        const on = metric === m && !d.locked;
        return (
          <div key={m} className="gl-metric-item">
            <button type="button" className={`gl-metric${d.locked ? ' is-locked' : ''}`} aria-pressed={metric === m} aria-disabled={!!d.locked}
              aria-describedby={on ? `gl-about-${m}` : undefined} title={d.locked ?? undefined} onClick={() => { if (!d.locked) onMetric(m); }}>
              <span className="gl-m-main"><b>{d.label}</b><span>{d.locked ? 'gesperrt' : d.sub}</span></span>
              <span className="gl-switch" aria-hidden="true"><i /></span>
            </button>
            {on && (
              <p className="gl-metric-about" id={`gl-about-${m}`}>
                {d.about} <OriginChip origin={d.origin} />
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
