/**
 * Vorhersage / Modellvergleich — „Command-Deck" (hell).
 *
 * Ersetzt das alte einspaltige rt-container-Ergebnislayout durch das Command-Deck
 * aus references/modellvergleich.dc.html (Sand/Ink · League Spartan · Sage-Akzent):
 * links Metrik-Tabs + Quellen-Toggles + Stufen-Legende, Mitte die 7-Tage-
 * Konfidenzkarten + Agreement + überlagerte Modell-Linien (Spread) + Tag-Detail
 * (Unsicherheit + Ghosts), rechts der Readout (Regenwahrscheinlichkeit · Stabilität
 * · Treffsicherheit/MAE · Unsicherheits-Hinweis). Mobile: vertikaler Fluss mit
 * prominentem Tag oben.
 *
 * Funktionserhalt: bindet unverändert ConfidenceCards, ModelCompareChart,
 * UncertaintyChart, agreementModel (via metricAgreement), confidenceModel, die
 * Quellen-Persistenz aus ModelCompare sowie HitRatePanel + MosPanel (Progressive
 * Disclosure, erhalten unterhalb der Karten). Kein Feature entfällt.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Location } from '../types';
import { flagForCountry } from '../geocode';
import { fetchMultiModelForecast, type MultiModelForecast } from './multiModel';
import { fetchForecastHistory, type ForecastHistory } from './forecastHistory';
import { buildDayVMs, firstLowConfidenceDay, buildStabilityMap, levelStyle, type DayVM, type DayStab } from './forecastView';
import { fetchHitRate, type HitRateData } from './hitRate';
import { sourceRanking, simpleLabel, confidenceFactor, type HitLabel } from './hitRateModel';
import { precipExplain, PRECIP_WET_EXPLAIN } from './confidenceModel';
import ConfidenceCards, { WeatherGlyph } from './ConfidenceCards';
import ModelCompareChart, { type ChartMetric } from './ModelCompareChart';
import UncertaintyChart from './UncertaintyChart';
import HitRatePanel from './HitRatePanel';
import MosPanel from '../ml/MosPanel';
import {
  METRICS, agreeStyle, metricAgreement, loadSettings, loadMetric, Toggle,
  SEL_KEY, METRIC_KEY, type CompareSettings,
} from './ModelCompare';
import { useIsMobile } from '../mobile/useIsMobile';
import '../route/tourTheme.css';
import './forecast.css';
import './forecastDeck.css';

interface Props { location: Location; setLocation: (l: Location | null) => void; onBack: () => void }

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; forecast: MultiModelForecast }
  | { kind: 'error'; message: string };

// ----------------------------------------------------------------------------
// Datenlebenszyklus (identisch zur alten ForecastPage): Modellvergleich (Pflicht)
// + Verlaufshistorie (optional) parallel, Treffsicherheit separat & lazy.
// ----------------------------------------------------------------------------
function useForecastData(location: Location) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [history, setHistory] = useState<ForecastHistory | null>(null);
  const [hitData, setHitData] = useState<HitRateData | null>(null);
  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setState({ kind: 'loading' });
    setHistory(null);
    (async () => {
      try {
        const [fcRes, histRes] = await Promise.allSettled([
          fetchMultiModelForecast(location.lat, location.lon, ac.signal),
          fetchForecastHistory(location.lat, location.lon, ac.signal),
        ]);
        if (ac.signal.aborted) return;
        if (fcRes.status === 'rejected') {
          setState({ kind: 'error', message: fcRes.reason instanceof Error ? fcRes.reason.message : 'Modelldaten nicht erreichbar' });
          return;
        }
        setState({ kind: 'ready', forecast: fcRes.value });
        setHistory(histRes.status === 'fulfilled' ? histRes.value : null);
      } catch (err) {
        if (ac.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Modelldaten nicht erreichbar' });
      }
    })();
    return () => ac.abort();
  }, [location]);

  useEffect(() => {
    const ac = new AbortController();
    fetchHitRate(location.lat, location.lon, ac.signal)
      .then((d) => { if (!ac.signal.aborted) setHitData(d); })
      .catch((err) => { if (err?.name !== 'AbortError') setHitData(null); });
    return () => ac.abort();
  }, [location]);

  const bestTempMae = useMemo(() => {
    if (!hitData) return NaN;
    const best = sourceRanking(hitData, 'temp', 1, 7).scores.find((s) => Number.isFinite(s.raw));
    return best ? best.raw : NaN;
  }, [hitData]);
  const hitLabel = useMemo(() => simpleLabel(bestTempMae), [bestTempMae]);
  const hitFactor = useMemo(() => confidenceFactor(bestTempMae), [bestTempMae]);

  const days = useMemo(() => (state.kind === 'ready' ? buildDayVMs(state.forecast, hitFactor) : []), [state, hitFactor]);
  const lowDay = useMemo(() => firstLowConfidenceDay(days), [days]);
  const stabMap = useMemo(() => (history ? buildStabilityMap(history) : null), [history]);

  return { state, history, hitData, bestTempMae, hitLabel, days, lowDay, stabMap };
}

// ----------------------------------------------------------------------------
// Deck
// ----------------------------------------------------------------------------
export default function ForecastDeck({ location, setLocation, onBack }: Props) {
  const isMobile = useIsMobile();
  const data = useForecastData(location);
  const [selected, setSelected] = useState(0);
  const [settings, setSettings] = useState<CompareSettings>(loadSettings);
  const [metric, setMetric] = useState<ChartMetric>(loadMetric);

  function saveSettings(s: CompareSettings) { setSettings(s); try { localStorage.setItem(SEL_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
  function pickMetric(m: ChartMetric) { setMetric(m); try { localStorage.setItem(METRIC_KEY, m); } catch { /* ignore */ } }
  function toggleModel(id: string) {
    const dis = new Set(settings.disabled);
    if (dis.has(id)) dis.delete(id); else dis.add(id);
    saveSettings({ ...settings, disabled: [...dis] });
  }

  const days = data.days;
  const sel = Math.min(selected, Math.max(0, days.length - 1));

  const ctx: DeckCtx = {
    ...data, location, setLocation, onBack,
    selected: sel, setSelected,
    settings, saveSettings, toggleModel, metric, pickMetric,
  };

  if (isMobile) return <MobileDeck {...ctx} />;
  return <DesktopDeck {...ctx} />;
}

interface DeckCtx {
  state: State; history: ForecastHistory | null; hitData: HitRateData | null;
  bestTempMae: number; hitLabel: HitLabel; days: DayVM[]; lowDay: DayVM | null; stabMap: Map<string, DayStab> | null;
  location: Location; setLocation: (l: Location | null) => void; onBack: () => void;
  selected: number; setSelected: (i: number) => void;
  settings: CompareSettings; saveSettings: (s: CompareSettings) => void; toggleModel: (id: string) => void;
  metric: ChartMetric; pickMetric: (m: ChartMetric) => void;
}

// Verdichtete Vergleichs-Ableitung für den gewählten Tag (Chart + Agreement + Toggles).
function compareData(forecast: MultiModelForecast, vm: DayVM, settings: CompareSettings, metric: ChartMetric) {
  const models = forecast.models;
  const hours = forecast.hours.filter((h) => h.dayIndex === vm.day.leadDays);
  const enabledIdx = models.map((m) => !settings.disabled.includes(m.id));
  const modelLabels = models.map((m) => m.label);
  const agr = metricAgreement(metric, vm, hours, modelLabels);
  const outlierForChart = metric === 'temp' ? agr.outlierIdx : [];
  const as = agreeStyle(agr.level);
  return { models, hours, enabledIdx, agr, outlierForChart, as };
}

interface MaeRow { id: string; label: string; color: string; valueText: string; width: number }
function maeRows(hitData: HitRateData | null): MaeRow[] {
  if (!hitData) return [];
  const rk = sourceRanking(hitData, 'temp', 1, 7);
  return rk.scores
    .filter((s) => !s.isConsensus && Number.isFinite(s.raw))
    .slice(0, 4)
    .map((s) => ({ id: s.id, label: s.label, color: s.color, valueText: s.valueText, width: Math.max(20, Math.min(95, 100 - s.raw * 18)) }));
}

// Ortsnamen wie in der Vorlage kürzen: Topbar „Stadt, Region", Readout/Mobile „Stadt".
const topLoc = (name: string) => name.split(',').slice(0, 2).join(',').trim();
const cityLoc = (name: string) => name.split(',')[0].trim();

const fmtDetailDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });
const fmtLongDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const levelWord = (level: DayVM['confidence']['level']) => (level === 'high' ? 'Hohe' : level === 'mid' ? 'Mittlere' : 'Niedrige');

// ============================ Desktop / Tablet ============================
function DesktopDeck(ctx: DeckCtx) {
  const { state, location, setLocation, onBack } = ctx;
  return (
    <div className="fcd-root">
      <div className="fcd-topbar">
        <div className="fcd-brandwrap">
          <img src="/buscosun-mark.svg" width={26} height={26} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <button className="fcd-brand" onClick={onBack}>buscosun</button>
        </div>
        <div className="fcd-topdivider" />
        <div className="fcd-loc">
          <IconSearch />
          <span className="fcd-loc-flag" aria-hidden="true">{flagForCountry(location.country)}</span>
          <span className="fcd-loc-name">{topLoc(location.name)}</span>
          <button className="fcd-loc-change" onClick={() => setLocation(null)}>Ändern</button>
        </div>
        <div className="fcd-topright">
          <div className="fcd-live"><span className="fcd-live-dot" /><span className="fcd-live-txt">{state.kind === 'ready' ? `${state.forecast.models.length} QUELLEN AKTIV` : 'MODELLVERGLEICH'}</span></div>
          <span className="fcd-avatar">JK</span>
        </div>
      </div>

      <div className="fcd-body">
        <Rail onBack={onBack} />
        {state.kind === 'loading' && <div className="fcd-state"><span className="ev-spinner" /><p>Mehrere Modelle werden abgeglichen …</p></div>}
        {state.kind === 'error' && <div className="fcd-state"><p>⚠ {state.message}</p></div>}
        {state.kind === 'ready' && ctx.days.length > 0 && <DesktopReady {...ctx} forecast={state.forecast} />}
      </div>
    </div>
  );
}

function DesktopReady(ctx: DeckCtx & { forecast: MultiModelForecast }) {
  const { forecast, days, selected, setSelected, stabMap, settings, toggleModel, metric, pickMetric, hitData, hitLabel, bestTempMae, lowDay, history, location } = ctx;
  const vm = days[selected];
  const cmp = compareData(forecast, vm, settings, metric);
  const metricLabel = METRICS.find((m) => m.id === metric)?.label ?? 'Temperatur';
  const stab = stabMap?.get(vm.day.dateISO) ?? null;
  const ghosts = history?.ghostsByDay[vm.day.dateISO]?.ghosts ?? [];

  return (
    <>
      {/* LEFT DOCK — Metrik · Quellen · Stufen */}
      <div className="fcd-dock fcd-scroll">
        <span className="fcd-eyebrow">Wettergröße</span>
        <div className="fcd-metrics" role="tablist" aria-label="Wettergröße">
          {METRICS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={metric === t.id}
              className={`fcd-metric${metric === t.id ? ' fcd-metric--active' : ''}`} onClick={() => pickMetric(t.id)}>{t.label}</button>
          ))}
        </div>

        <span className="fcd-eyebrow">Quellen ein-/ausblenden</span>
        <div className="fcd-sources">
          {forecast.models.map((m, i) => {
            const outlier = cmp.agr.outlierIdx.includes(i);
            const on = !settings.disabled.includes(m.id);
            return (
              <div key={m.id} className={`fcd-source${outlier ? ' fcd-source--outlier' : ''}${on ? '' : ' fcd-source--muted'}`}>
                <span className="fcd-source-sw" style={{ background: m.color }} />
                <span className="fcd-source-name">{m.label}{outlier ? <span className="fcd-source-warn" title="Ausreißer"> ⚠</span> : null}</span>
                <Toggle on={on} onChange={() => toggleModel(m.id)} label={m.label} />
              </div>
            );
          })}
          <div className="fcd-source fcd-source--consensus">
            <span className="fcd-source-sw" style={{ background: '#2C2A26' }} />
            <span className="fcd-source-name">Konsens</span>
            <Toggle on={settings.consensus} onChange={() => ctx.saveSettings({ ...settings, consensus: !settings.consensus })} label="Konsens" />
          </div>
        </div>
        <div className="fcd-note">Auswahl wird gemerkt — beim nächsten Öffnen wieder da.</div>

        <div className="fcd-stufen">
          <div className="fcd-stufen-lab">Stufen</div>
          <div className="fcd-stufen-rows">
            <span><b style={{ color: 'var(--sage-600)' }}>✓</b> Hoch ≥ 70 %</span>
            <span><b style={{ color: 'var(--fd-mid)' }}>≈</b> Mittel 40–69 %</span>
            <span><b style={{ color: 'var(--slate-500)' }}>!</b> Niedrig &lt; 40 %</span>
          </div>
        </div>
      </div>

      {/* CENTER — Karten · Agreement · Modell-Linien · Tag-Detail */}
      <div className="fcd-center fcd-scroll">
        {hitData && Number.isFinite(bestTempMae) && (
          <div className={`fcd-hit${hitLabel.tone === 'mixed' ? ' fcd-hit--mixed' : hitLabel.tone === 'poor' ? ' fcd-hit--poor' : ''}`}>
            <span className="fcd-hit-ico">{hitLabel.glyph}</span>
            <span className="fcd-hit-txt">{hitLabel.text}</span>
            <span className="fcd-hit-sub">— Rückblick der letzten Tage</span>
          </div>
        )}

        <span className="fcd-sec-lab">7 Tage · Sicherheit sinkt mit Vorlaufzeit</span>
        <ConfidenceCards days={days} selected={selected} onSelect={setSelected} stab={stabMap} />

        <span className="fcd-sec-lab">Sind sich die Vorhersagen einig? · {vm.day.weekdayShort}</span>
        <div className="fcd-agree" style={{ background: cmp.as.bg, borderColor: cmp.as.border }}>
          <span className="fcd-agree-ring" style={{ color: cmp.as.color }}>{cmp.as.glyph}</span>
          <div><strong>{cmp.agr.summary}</strong><p>{cmp.agr.detail}</p></div>
        </div>

        <div className="fcd-chartcard">
          <div className="fcd-chartcard-title">Modell-Linien · {metricLabel} über den Tag <em>— Band = Spread</em></div>
          <ModelCompareChart hours={cmp.hours} models={cmp.models} enabledIdx={cmp.enabledIdx} showConsensus={settings.consensus} outlierIdx={cmp.outlierForChart} metric={metric} />
        </div>

        <div className="fcd-detail-head">
          <span className="fcd-sec-lab">{fmtDetailDate(vm.day.dateMs)} im Detail · Temperaturverlauf mit Unsicherheit</span>
          <span className="fcd-detail-sub" style={{ color: levelStyle(vm.confidence.level).color }}>{levelStyle(vm.confidence.level).glyph} {levelWord(vm.confidence.level)} Sicherheit · {vm.confidence.pct} %</span>
        </div>
        <div className="fcd-chartcard" style={{ marginTop: 0 }}>
          <UncertaintyChart hours={cmp.hours} ghosts={ghosts} showGhosts />
          <p className="fcd-chart-note">Linie = Konsens · Band = Spread der Modelle · <span className="dash">gestrichelt</span> = frühere Läufe (Ghosts)</p>
        </div>

        {/* Erhaltene Tiefen-Panels (Progressive Disclosure): Treffsicherheits-Rückblick + KI-Selbsttest */}
        <div className="fcd-preserved">
          {hitData && <HitRatePanel data={hitData} />}
          <MosPanel location={location} live={forecast} />
        </div>
      </div>

      {/* RIGHT — Readout */}
      <div className="fcd-readout fcd-scroll">
        <Readout ctx={ctx} vm={vm} stab={stab} lowDay={lowDay} />
      </div>
    </>
  );
}

function Readout({ ctx, vm, stab, lowDay }: { ctx: DeckCtx; vm: DayVM; stab: DayStab | null; lowDay: DayVM | null }) {
  const { hitData, location } = ctx;
  const precipPct = Math.round(vm.precipProb * 100);
  const rows = maeRows(hitData);
  return (
    <>
      <span className="fcd-rd-eyebrow">Verlässlichkeit · {cityLoc(location.name)}</span>

      <div className="fcd-rd-card">
        <div className="fcd-rd-lab">Regenwahrscheinlichkeit</div>
        <div className="fcd-precip-row"><span className="fcd-precip-big">{precipPct} %</span><span className="fcd-precip-sub">{precipExplain(vm.precipProb)}</span></div>
        <p className="fcd-precip-note">{PRECIP_WET_EXPLAIN}</p>
      </div>

      <div className="fcd-rd-card">
        <div className="fcd-rd-lab">Stabilität · letzte Läufe</div>
        {stab && stab.stability.level !== 'unknown' ? (
          <>
            <div className="fcd-stab-row">
              <span className={`fcd-chip ${stab.stability.level === 'stable' ? 'fcd-chip--stable' : 'fcd-chip--volatile'}`}>{stab.stability.level === 'stable' ? '● ' : '~ '}{stab.stability.label}</span>
              <span className="fcd-stab-since">{stab.delta.deltaC != null && stab.delta.isSmall ? '≈ stabil seit gestern' : stab.stability.level === 'stable' ? '≈ stabil seit gestern' : 'schwankt noch'}</span>
            </div>
            <p className="fcd-stab-note">Die Prognose ist über die letzten Läufe {stab.stability.level === 'stable' ? 'weitgehend gleich geblieben' : 'noch nicht eingelaufen'}. <em>Stabil heißt nicht automatisch richtig.</em></p>
          </>
        ) : (
          <p className="fcd-stab-note">Für diesen Tag liegen noch keine Verlaufsläufe vor.</p>
        )}
      </div>

      <span className="fcd-rd-eyebrow" style={{ display: 'block', marginTop: 16 }}>Treffsicherheit · Rückblick</span>
      <div className="fcd-rd-card">
        <div className="fcd-mae-intro">Wie gut lagen die Modelle zuletzt (Temperatur, +1 Tag)?</div>
        {rows.length ? (
          <div className="fcd-mae-rows">
            {rows.map((r) => (
              <div key={r.id} className="fcd-mae-row">
                <span className="fcd-mae-name">{r.label}</span>
                <span className="fcd-mae-bar"><span className="fcd-mae-fill" style={{ width: `${r.width}%`, background: r.color }} /></span>
                <span className="fcd-mae-val">{r.valueText}</span>
              </div>
            ))}
          </div>
        ) : <div className="fcd-mae-intro">Rückblick wird geladen …</div>}
        <p className="fcd-mae-note">Mittlerer Fehler (MAE) der letzten 7 Tage · kleiner = treffsicherer.</p>
      </div>

      {lowDay && (
        <div className="fcd-hint">
          <span className="fcd-hint-ico">!</span>
          <div><strong>Prognose noch unsicher</strong><p>Ab {lowDay.day.weekdayShort} ist die Sicherheit niedrig (&lt; 40 %). Am besten morgen erneut prüfen.</p></div>
        </div>
      )}

      <div className="fcd-foot">Sicherheit aus {ctx.days.length ? ctx.state.kind === 'ready' ? ctx.state.forecast.models.length : 5 : 5} unabhängigen Modellen ({ctx.state.kind === 'ready' ? ctx.state.forecast.models.map((m) => m.label).join(' · ') : ''}). Stufen: Hoch ≥ 70 %, Mittel 40–69 %, Niedrig &lt; 40 %.</div>
    </>
  );
}

function Rail({ onBack }: { onBack: () => void }) {
  return (
    <nav className="fcd-rail" aria-label="Werkzeuge">
      <button className="fcd-rail-btn" title="Wetterkarte" onClick={onBack} aria-label="Wetterkarte"><IconRailMap /></button>
      <button className="fcd-rail-btn" title="Regenradar" onClick={onBack} aria-label="Regenradar"><IconRailRadar /></button>
      <button className="fcd-rail-btn fcd-rail-btn--active" title="Modellvergleich" aria-current="page" aria-label="Modellvergleich"><IconRailCompare /></button>
      <button className="fcd-rail-btn" title="Event" onClick={onBack} aria-label="Event"><IconRailEvent /></button>
      <span className="fcd-rail-spacer" />
      <button className="fcd-rail-btn" title="Einstellungen" onClick={onBack} aria-label="Einstellungen"><IconRailGear /></button>
    </nav>
  );
}

// ============================ Mobile ============================
function MobileDeck(ctx: DeckCtx) {
  const { state, location, setLocation, onBack } = ctx;
  return (
    <div className="fcd-m-root">
      <div className="fcd-m-header">
        <div className="fcd-m-brandrow">
          <img src="/buscosun-mark.svg" width={22} height={22} alt="" onClick={onBack} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <div className="fcd-m-htext"><div className="fcd-m-eyebrow">Modellvergleich</div><div className="fcd-m-title">{flagForCountry(location.country)} {cityLoc(location.name)}</div></div>
        </div>
        <button className="fcd-m-change" onClick={() => setLocation(null)}>Ändern</button>
      </div>
      {state.kind === 'loading' && <div className="fcd-state"><span className="ev-spinner" /><p>Mehrere Modelle werden abgeglichen …</p></div>}
      {state.kind === 'error' && <div className="fcd-state"><p>⚠ {state.message}</p></div>}
      {state.kind === 'ready' && ctx.days.length > 0 && (
        <div className="fcd-m-scroll fcd-scroll"><MobileReady {...ctx} forecast={state.forecast} /></div>
      )}
    </div>
  );
}

function MobileReady(ctx: DeckCtx & { forecast: MultiModelForecast }) {
  const { forecast, days, selected, setSelected, stabMap, settings, metric, pickMetric, hitData, hitLabel, bestTempMae, lowDay, history, location } = ctx;
  const vm = days[selected];
  const cmp = compareData(forecast, vm, settings, metric);
  const stab = stabMap?.get(vm.day.dateISO) ?? null;
  const ls = levelStyle(vm.confidence.level);
  const ghosts = history?.ghostsByDay[vm.day.dateISO]?.ghosts ?? [];

  return (
    <>
      {hitData && Number.isFinite(bestTempMae) && (
        <div className={`fcd-hit${hitLabel.tone === 'mixed' ? ' fcd-hit--mixed' : hitLabel.tone === 'poor' ? ' fcd-hit--poor' : ''}`}>
          <span className="fcd-hit-ico">{hitLabel.glyph}</span><span className="fcd-hit-txt">{hitLabel.text}</span>
        </div>
      )}

      {/* Prominenter ausgewählter Tag */}
      <div className="fcd-m-hero">
        <WeatherGlyph icon={vm.icon} size={52} />
        <div className="fcd-m-hero-mid">
          <div className="fcd-m-hero-dayrow"><span className="fcd-m-hero-day">{fmtLongDate(vm.day.dateMs)}</span>{vm.day.isToday && <span className="fcd-m-hero-badge">HEUTE</span>}</div>
          <div className="fcd-m-hero-temps"><span className="fcd-m-hero-tmax">{Math.round(vm.day.tMaxConsensus)}°</span><span className="fcd-m-hero-tmin">{Math.round(vm.day.tMinConsensus)}°</span></div>
        </div>
        <div className="fcd-m-hero-right">
          <div className="fcd-m-hero-pct" style={{ color: ls.color }}>{vm.confidence.pct}%</div>
          <div className="fcd-m-hero-level" style={{ color: ls.color }}>{ls.glyph} {levelWord(vm.confidence.level)}</div>
          {stab && stab.stability.level !== 'unknown' && (
            <div className={`fcd-m-hero-stab ${stab.stability.level === 'stable' ? 'is-stab-stable' : 'is-stab-volatile'}`}>{stab.stability.level === 'stable' ? '● stabil' : '~ wechs.'}</div>
          )}
        </div>
      </div>

      {/* Metrik-Tabs */}
      <div className="fcd-sec-lab" style={{ margin: '4px 2px 0' }}>Wettergröße</div>
      <div className="fcd-m-tabs" role="tablist" aria-label="Wettergröße">
        {METRICS.map((t) => (
          <button key={t.id} role="tab" aria-selected={metric === t.id} className={`fcd-m-tab${metric === t.id ? ' fcd-m-tab--active' : ''}`} onClick={() => pickMetric(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* 7-Tage-Karten (horizontal, tippen zum Wählen) */}
      <div className="fcd-detail-head" style={{ margin: '4px 2px 0' }}>
        <span className="fcd-sec-lab" style={{ margin: 0 }}>7 Tage · Sicherheit sinkt mit Vorlauf</span>
        <span className="fcd-hit-sub">tippen zum Wählen →</span>
      </div>
      <div className="fcd-m-cardrow">
        {days.map((d, i) => {
          const dls = levelStyle(d.confidence.level);
          const ds = stabMap?.get(d.day.dateISO) ?? null;
          return (
            <button key={d.day.dateISO} type="button" className={`fcd-m-card${i === selected ? ' fcd-m-card--sel' : ''}`} onClick={() => setSelected(i)}
              aria-label={`${d.day.weekdayShort}, ${Math.round(d.day.tMaxConsensus)} Grad, ${levelWord(d.confidence.level)} Sicherheit ${d.confidence.pct} Prozent`}>
              <span className="fcd-m-card-day">{d.day.weekdayShort}</span>
              <WeatherGlyph icon={d.icon} size={28} />
              <span className="fcd-m-card-temp">{Math.round(d.day.tMaxConsensus)}°</span>
              <span className="fcd-m-card-conf" style={{ color: dls.color }}>{dls.glyph} {d.confidence.pct}%</span>
              {ds && ds.stability.level !== 'unknown' && (
                <span className={`fcd-m-card-stab ${ds.stability.level === 'stable' ? 'is-stab-stable' : 'is-stab-volatile'}`}>{ds.stability.level === 'stable' ? '● stabil' : '~ wechs.'}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Agreement */}
      <div className="fcd-agree" style={{ background: cmp.as.bg, borderColor: cmp.as.border }}>
        <span className="fcd-agree-ring" style={{ color: cmp.as.color }}>{cmp.as.glyph}</span>
        <div><strong>{cmp.agr.summary}</strong><p>{cmp.agr.detail}</p></div>
      </div>

      {/* Modell-Linien */}
      <div className="fcd-chartcard" style={{ marginTop: 0 }}>
        <div className="fcd-chartcard-title">Modell-Linien · {vm.day.weekdayShort}</div>
        <ModelCompareChart hours={cmp.hours} models={cmp.models} enabledIdx={cmp.enabledIdx} showConsensus={settings.consensus} outlierIdx={cmp.outlierForChart} metric={metric} />
      </div>

      {/* Tag-Detail */}
      <div className="fcd-chartcard" style={{ marginTop: 0 }}>
        <div className="fcd-chartcard-title">{fmtDetailDate(vm.day.dateMs)} · Unsicherheit</div>
        <UncertaintyChart hours={cmp.hours} ghosts={ghosts} showGhosts />
      </div>

      {/* Readout */}
      <div className="fcd-sec-lab" style={{ margin: '4px 2px 0' }}>Verlässlichkeit · {vm.day.weekdayShort}</div>
      <div className="fcd-m-rd-grid">
        <div className="fcd-rd-card" style={{ marginTop: 0 }}>
          <div className="fcd-rd-lab">Regen</div>
          <div className="fcd-precip-big" style={{ fontSize: 20, marginTop: 3 }}>{Math.round(vm.precipProb * 100)} %</div>
          <div className="fcd-precip-sub" style={{ fontSize: 10 }}>{precipExplain(vm.precipProb)}</div>
        </div>
        <div className="fcd-rd-card" style={{ marginTop: 0 }}>
          <div className="fcd-rd-lab">Stabilität</div>
          {stab && stab.stability.level !== 'unknown' ? (
            <div style={{ marginTop: 5 }}><span className={`fcd-chip ${stab.stability.level === 'stable' ? 'fcd-chip--stable' : 'fcd-chip--volatile'}`} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid var(--evd-sage-border)' }}>{stab.stability.level === 'stable' ? '● stabil' : '~ wechselh.'}</span></div>
          ) : <div className="fcd-precip-sub" style={{ fontSize: 10, marginTop: 5 }}>keine Läufe</div>}
        </div>
      </div>

      <MobileMae hitData={hitData} />

      {lowDay && (
        <div className="fcd-hint" style={{ marginTop: 8 }}>
          <span className="fcd-hint-ico" style={{ width: 22, height: 22, fontSize: 12 }}>!</span>
          <div><strong style={{ fontSize: 12 }}>Prognose noch unsicher</strong><p style={{ fontSize: 10.5 }}>Ab {lowDay.day.weekdayShort} niedrig (&lt; 40 %). Morgen erneut prüfen.</p></div>
        </div>
      )}

      {/* Erhaltene Tiefen-Panels */}
      <div className="fcd-preserved">
        {hitData && <HitRatePanel data={hitData} />}
        <MosPanel location={location} live={forecast} />
      </div>

      <p className="fcd-m-foot">{ctx.state.kind === 'ready' ? `${forecast.models.length} Modelle · ${forecast.models.map((m) => m.label).join(' · ')}` : '5 Modelle'}</p>
    </>
  );
}

function MobileMae({ hitData }: { hitData: HitRateData | null }) {
  const rows = maeRows(hitData);
  if (!rows.length) return null;
  return (
    <div className="fcd-rd-card" style={{ marginTop: 8 }}>
      <div className="fcd-rd-lab">Treffsicherheit · MAE (7 Tage)</div>
      <div className="fcd-mae-rows" style={{ marginTop: 8 }}>
        {rows.map((r) => (
          <div key={r.id} className="fcd-mae-row">
            <span className="fcd-mae-name" style={{ width: 48 }}>{r.label}</span>
            <span className="fcd-mae-bar"><span className="fcd-mae-fill" style={{ width: `${r.width}%`, background: r.color }} /></span>
            <span className="fcd-mae-val" style={{ width: 40 }}>{r.valueText}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================ Icons (Vorlage) ============================
function IconSearch() {
  return <svg className="fcd-loc-icon" width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" /><line x1="12.5" y1="12.5" x2="16" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}
function IconRailMap() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 L21 8 L12 13 L3 8 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M3 13 L12 18 L21 13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}
function IconRailRadar() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M12 3 A9 9 0 0 1 21 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>;
}
function IconRailCompare() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 18 L9 11 L13 14 L20 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 5 L4 20 L20 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity=".5" /></svg>;
}
function IconRailEvent() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" /><line x1="3.5" y1="9.5" x2="20.5" y2="9.5" stroke="currentColor" strokeWidth="1.6" /></svg>;
}
function IconRailGear() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.2 5.2 L7 7 M17 17 L18.8 18.8 M18.8 5.2 L17 7 M7 17 L5.2 18.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}
