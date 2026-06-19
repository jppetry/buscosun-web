/**
 * Einheitliches Modellvergleichs-Panel: Metric-Tabs (Temperatur / Niederschlag /
 * Wind / Wolkendichte), überlagerte Modell-Linien, Quellen-Toggles, Agreement-Karte.
 * Ersetzt ModelCompare + DistributionPanel + PrecipUncertaintyGrid.
 */

import { useState } from 'react';
import { agreement, precipAgreement, outlierIndices, type AgreeLevel, type AgreementInfo } from './agreementModel';
import { stddev } from './confidenceModel';
import type { HourPoint, MultiModelForecast } from './multiModel';
import type { DayVM } from './forecastView';
import ModelCompareChart, { type ChartMetric } from './ModelCompareChart';

const SEL_KEY = 'buscosun.forecast.compareSel.v1';
const METRIC_KEY = 'buscosun.forecast.compareMetric.v1';

interface CompareSettings { disabled: string[]; consensus: boolean }

function loadSettings(): CompareSettings {
  try { const raw = localStorage.getItem(SEL_KEY); if (raw) return { disabled: [], consensus: true, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return { disabled: [], consensus: true };
}
function loadMetric(): ChartMetric {
  try { const v = localStorage.getItem(METRIC_KEY); if (v === 'precip' || v === 'wind' || v === 'cloud') return v; } catch { /* ignore */ }
  return 'temp';
}

const METRICS: Array<{ id: ChartMetric; label: string }> = [
  { id: 'temp', label: 'Temperatur' },
  { id: 'precip', label: 'Niederschlag' },
  { id: 'wind', label: 'Wind' },
  { id: 'cloud', label: 'Wolkendichte' },
];

const agreeStyle = (l: AgreeLevel) =>
  l === 'high' ? { color: '#5C7A4A', glyph: '✓', bg: '#F1F4EC', border: '#7A9466' }
    : l === 'mixed' ? { color: '#C99A4E', glyph: '≈', bg: '#F8F2E2', border: '#C99A4E' }
      : { color: '#6B7A8F', glyph: '!', bg: '#EEF1F4', border: '#9AA7B5' };

function metricAgreement(metric: ChartMetric, vm: DayVM, hours: HourPoint[], modelLabels: string[]): AgreementInfo {
  if (metric === 'temp') return agreement(vm.day.tMaxByModel, vm.day.precipByModel, modelLabels);

  if (metric === 'precip') {
    const pa = precipAgreement(vm.day.precipByModel);
    const ratio = pa.total > 0 ? pa.wet / pa.total : 0.5;
    const level: AgreeLevel = (pa.wet === 0 || pa.wet === pa.total) ? 'high' : (ratio >= 0.6 || ratio <= 0.4) ? 'mixed' : 'low';
    const outlierIdx = outlierIndices(vm.day.precipByModel);
    const outlierNames = outlierIdx.map((i: number) => modelLabels[i]).filter(Boolean).join(', ');
    const detail = outlierIdx.length
      ? `${outlierIdx.length === 1 ? 'Eine Quelle' : 'Quellen'} (${outlierNames}) weicht${outlierIdx.length === 1 ? '' : 'en'} deutlich ab.`
      : pa.text;
    return { precip: pa, level, tempSpreadC: NaN, outlierIdx, summary: pa.text, detail };
  }

  // Wind / Wolkendichte: Tagesdurchschnitt je Modell → Streuung
  const isWind = metric === 'wind';
  const meanPerModel = modelLabels.map((_, i) => {
    const vals = hours
      .map((h) => (isWind ? h.windByModel : h.cloudByModel)[i])
      .filter(Number.isFinite);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
  });
  const spread = Math.round((stddev(meanPerModel) + Number.EPSILON) * 10) / 10;
  const [loThresh, hiThresh] = isWind ? [5, 12] : [10, 25];
  const level: AgreeLevel = spread <= loThresh ? 'high' : spread <= hiThresh ? 'mixed' : 'low';
  const unit = isWind ? ' km/h' : ' %';
  const metricLabel = isWind ? 'Wind' : 'Wolkendichte';
  const outlierIdx = outlierIndices(meanPerModel);
  const outlierNames = outlierIdx.map((i: number) => modelLabels[i]).filter(Boolean).join(', ');
  const summary = level === 'high'
    ? `Alle Modelle einig bei ${metricLabel}.`
    : level === 'mixed' ? `Überwiegende Einigkeit bei ${metricLabel}.`
    : `Vorhersagen uneinig — ${metricLabel}lage offen.`;
  const detail = outlierIdx.length
    ? `${outlierIdx.length === 1 ? 'Eine Quelle' : 'Quellen'} (${outlierNames}) weicht${outlierIdx.length === 1 ? '' : 'en'} deutlich ab (Ausreißer).`
    : `${metricLabel}-Streuung ±${spread}${unit}.`;
  const pa = precipAgreement(vm.day.precipByModel);
  return { precip: pa, level, tempSpreadC: NaN, outlierIdx, summary, detail };
}

export default function ModelCompare({ forecast, vm }: { forecast: MultiModelForecast; vm: DayVM }) {
  const [settings, setSettings] = useState<CompareSettings>(loadSettings);
  const [metric, setMetric] = useState<ChartMetric>(loadMetric);

  function save(s: CompareSettings) { setSettings(s); try { localStorage.setItem(SEL_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
  function pickMetric(m: ChartMetric) { setMetric(m); try { localStorage.setItem(METRIC_KEY, m); } catch { /* ignore */ } }

  const models = forecast.models;
  const hours = forecast.hours.filter((h) => h.dayIndex === vm.day.leadDays);
  const enabledIdx = models.map((m) => !settings.disabled.includes(m.id));
  const modelLabels = models.map((m) => m.label);

  const agr = metricAgreement(metric, vm, hours, modelLabels);
  const outlierForChart = metric === 'temp' ? agr.outlierIdx : [];
  const as = agreeStyle(agr.level);

  function toggleModel(id: string) {
    const dis = new Set(settings.disabled);
    if (dis.has(id)) dis.delete(id); else dis.add(id);
    save({ ...settings, disabled: [...dis] });
  }

  return (
    <div className="fc-compare">
      <div className="fc-block-head">
        <span className="rt-eyebrow fc-eyebrow">Sind sich die Vorhersagen einig? · {vm.day.weekdayShort}</span>
      </div>

      {/* Metric-Tabs */}
      <div className="ev-course-tabs fc-metric-tabs" role="tablist" aria-label="Wettergröße">
        {METRICS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={metric === t.id}
            className={`ev-course-tab${metric === t.id ? ' is-active' : ''}`}
            onClick={() => pickMetric(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Agreement-Karte */}
      <div className="rt-card fc-agreement" style={{ background: as.bg, borderColor: as.border }}>
        <span className="fc-agreement-ring" style={{ color: as.color }}>{as.glyph}</span>
        <div>
          <strong>{agr.summary}</strong>
          <p>{agr.detail}</p>
        </div>
      </div>

      <div className="fc-compare-grid">
        <div className="rt-card fc-chart-card">
          <ModelCompareChart
            hours={hours}
            models={models}
            enabledIdx={enabledIdx}
            showConsensus={settings.consensus}
            outlierIdx={outlierForChart}
            metric={metric}
          />
        </div>

        <div className="fc-compare-side">
          <div className="rt-card fc-sources">
            <span className="rt-eyebrow fc-eyebrow">Quellen ein-/ausblenden</span>
            <div className="fc-sources-rows">
              {models.map((m, i) => (
                <div key={m.id} className="fc-source-row">
                  <span className="fc-source-sw" style={{ background: m.color }} />
                  <span className="fc-source-name">{m.label}{agr.outlierIdx.includes(i) ? ' ⚠' : ''}</span>
                  <Toggle on={enabledIdx[i]} onChange={() => toggleModel(m.id)} label={m.label} />
                </div>
              ))}
              <div className="fc-source-row fc-source-consensus">
                <span className="fc-source-sw" style={{ background: '#2C2A26' }} />
                <span className="fc-source-name">Konsens</span>
                <Toggle on={settings.consensus} onChange={() => save({ ...settings, consensus: !settings.consensus })} label="Konsens" />
              </div>
            </div>
          </div>
          <p className="fc-compare-note">Auswahl wird gemerkt — beim nächsten Öffnen wieder da.</p>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={`${label} ${on ? 'aus' : 'ein'}blenden`}
      className={`fc-switch${on ? ' is-on' : ''}`} onClick={onChange}>
      <span className="fc-switch-knob" />
    </button>
  );
}
