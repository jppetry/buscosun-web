/**
 * Verteilungs-Panel (EPIC 4): lädt das Ensemble lazy für den Ort, zeigt für den
 * gewählten Tag die Bandbreiten ↔ alle Szenarien (US-4.1/4.2) mit Umschalter und
 * Streuungs-Klartext. Bewusst Progressive Disclosure (nur im Experten-Modus).
 */

import { useEffect, useState } from 'react';
import { fetchEnsemble, type EnsembleForecast } from './ensemble';
import { spreadSummary } from './distributionModel';
import type { DayVM } from './forecastView';
import DistributionChart from './DistributionChart';

const MODE_KEY = 'buscosun.forecast.distMode.v1';
type Mode = 'bands' | 'spaghetti';

function loadMode(): Mode { try { return localStorage.getItem(MODE_KEY) === 'spaghetti' ? 'spaghetti' : 'bands'; } catch { return 'bands'; } }

export default function DistributionPanel({ lat, lon, vm }: { lat: number; lon: number; vm: DayVM }) {
  const [ens, setEns] = useState<EnsembleForecast | null>(null);
  const [state, setState] = useState<'load' | 'ok' | 'err'>('load');
  const [mode, setMode] = useState<Mode>(loadMode);

  useEffect(() => {
    const ctrl = new AbortController();
    setState('load'); setEns(null);
    fetchEnsemble(lat, lon, ctrl.signal)
      .then((e) => { setEns(e); setState('ok'); })
      .catch((err) => { if (err?.name !== 'AbortError') setState('err'); });
    return () => ctrl.abort();
  }, [lat, lon]);

  function pick(m: Mode) { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } }

  const dayHours = ens?.hours.filter((h) => h.dayIndex === vm.day.leadDays) ?? [];
  const spread = dayHours.length ? spreadSummary(dayHours) : null;

  return (
    <div className="fc-dist">
      <div className="fc-block-head fc-dist-head">
        <span className="rt-eyebrow fc-eyebrow">Streuung &amp; Verteilung · die ganze Bandbreite möglicher Werte · {vm.day.weekdayShort}</span>
        <div className="fc-seg" role="tablist" aria-label="Darstellung der Verteilung">
          <button type="button" role="tab" aria-selected={mode === 'bands'} className={`fc-seg-btn${mode === 'bands' ? ' is-on' : ''}`} onClick={() => pick('bands')}>Bandbreiten</button>
          <button type="button" role="tab" aria-selected={mode === 'spaghetti'} className={`fc-seg-btn${mode === 'spaghetti' ? ' is-on' : ''}`} onClick={() => pick('spaghetti')}>Alle Szenarien</button>
        </div>
      </div>

      <div className="rt-card fc-chart-card">
        {state === 'load' && <div className="fc-chart-empty">Ensemble wird geladen …</div>}
        {state === 'err' && <div className="fc-chart-empty">Ensemble-Daten für diesen Ort nicht verfügbar.</div>}
        {state === 'ok' && <DistributionChart hours={dayHours} mode={mode} />}
        {state === 'ok' && spread && (
          <p className={`fc-dist-note${spread.tight ? ' is-tight' : ' is-wide'}`}>
            {spread.text}
            {ens && <em> · {ens.memberCount} Szenarien (ICON-Ensemble)</em>}
          </p>
        )}
      </div>
    </div>
  );
}
