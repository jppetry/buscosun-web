/**
 * 3D-Wetter · Go/No-Go-Panel (Epic E, US-E1/E2/E3/E4).
 *
 * Arbeits-/Flughöhe + Böen-Grenzwert eingeben → eindeutiger grün/rot-Status mit
 * No-Go-Zeitfenstern und Höhenfaktor (Boden → Arbeitshöhe). Grenzwert wird lokal
 * gespeichert (US-E2). Barrierearm: Status zusätzlich als Text, nicht nur Farbe.
 */

import { useMemo, useState } from 'react';
import type { PreparedSection } from './buildCrossSection';
import { evaluateGoNoGo, loadGoNoGo, saveGoNoGo, type GoNoGoConfig } from './goNoGo';

const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

export default function GoNoGoPanel({ prepared, locationName, timeMs }: { prepared: PreparedSection; locationName: string; timeMs: number }) {
  const [cfg, setCfg] = useState<GoNoGoConfig>(() => loadGoNoGo());
  const [copied, setCopied] = useState(false);
  const patch = (p: Partial<GoNoGoConfig>) => setCfg((c) => { const n = { ...c, ...p }; saveGoNoGo(n); return n; });

  const result = useMemo(() => evaluateGoNoGo(prepared, cfg), [prepared, cfg]);
  const go = result.status === 'go';

  // US-E5 — Auswertung als Text-Report (Ort, Zeit, Höhe, Werte, Grenzwert, Status).
  function buildReport(): string {
    const L: string[] = [];
    L.push('BUSCOSUN · 3D-Wetter · Go/No-Go-Auswertung');
    L.push('='.repeat(44));
    L.push(`Ort:           ${locationName}`);
    L.push(`Bezugszeit:    ${new Date(timeMs).toLocaleString('de-DE')}`);
    L.push(`Datenstand:    ICON-D2 + DEM, abgerufen ${fmtClock(prepared.runAtMs)} Uhr`);
    L.push(`Arbeitshöhe:   ${cfg.heightAglM} m AGL`);
    L.push(`Böen-Grenzwert:${cfg.gustLimitKmh} km/h`);
    L.push('');
    L.push(`STATUS:        ${go ? 'GO' : 'NO-GO'}`);
    L.push(`Böe jetzt:     ${Math.round(result.gustNowKmh)} km/h (auf ${cfg.heightAglM} m AGL)`);
    L.push(`Böe Spitze:    ${Math.round(result.peakGustKmh)} km/h im Prognosezeitraum`);
    L.push(`Höhenfaktor:   Boden ${Math.round(result.groundGustKmh)} → ${cfg.heightAglM} m ${Math.round(result.heightGustKmh)} km/h (×${result.heightFactor.toFixed(2)})`);
    L.push('');
    if (result.noGoWindows.length) {
      L.push('No-Go-Fenster (Grenzwert überschritten):');
      for (const w of result.noGoWindows) L.push(`  · ${fmtDay(w.startMs)} ${fmtClock(w.startMs)}–${fmtClock(w.endMs)}  bis ${Math.round(w.maxGustKmh)} km/h`);
    } else {
      L.push('Kein Grenzwert-Überschreiten im Prognosezeitraum auf dieser Höhe.');
    }
    L.push('');
    L.push(`Permalink: ${window.location.href}`);
    L.push('Hinweis: Höhenwind aus 10-m-Wind + Standardprofil abgeleitet (Grenzschicht-gesättigt). Keine verbindliche Betriebsfreigabe.');
    return L.join('\n');
  }

  function exportReport() {
    const blob = new Blob([buildReport()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gonogo-${locationName.split(',')[0].replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); } catch { /* ignore */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rt-card td-gng">
      <span className="td-gng-title">Go / No-Go · Schwellenwert</span>

      <div className="td-gng-inputs">
        <label className="td-gng-field">
          <span>Arbeits-/Flughöhe</span>
          <span className="td-gng-input"><input type="number" min={0} max={1500} step={10} value={cfg.heightAglM}
            onChange={(e) => patch({ heightAglM: Math.max(0, Number(e.target.value) || 0) })} /> m AGL</span>
        </label>
        <label className="td-gng-field">
          <span>Böen-Grenzwert</span>
          <span className="td-gng-input"><input type="number" min={0} max={200} step={5} value={cfg.gustLimitKmh}
            onChange={(e) => patch({ gustLimitKmh: Math.max(0, Number(e.target.value) || 0) })} /> km/h</span>
        </label>
      </div>

      <div className={`td-gng-status ${go ? 'is-go' : 'is-nogo'}`}>
        <span className="td-gng-badge">{go ? '✓ GO' : '✕ NO-GO'}</span>
        <span className="td-gng-status-text">
          Böe auf {cfg.heightAglM} m AGL jetzt <strong>{Math.round(result.gustNowKmh)} km/h</strong>
          {go ? ` · unter Grenzwert ${cfg.gustLimitKmh}` : ` · über Grenzwert ${cfg.gustLimitKmh}`} km/h
        </span>
      </div>

      {/* Höhenfaktor (US-E4) */}
      <div className="td-gng-factor">
        <span>Boden ~10 m: <strong>{Math.round(result.groundGustKmh)}</strong> km/h</span>
        <span>→ {cfg.heightAglM} m: <strong>{Math.round(result.heightGustKmh)}</strong> km/h</span>
        <span>Faktor <strong>×{result.heightFactor.toFixed(2)}</strong></span>
      </div>

      {/* No-Go-Fenster im Zeitraum */}
      {result.noGoWindows.length > 0 ? (
        <div className="td-gng-windows">
          <span className="td-gng-windows-title">No-Go-Fenster (Grenzwert überschritten):</span>
          <ul>
            {result.noGoWindows.slice(0, 6).map((w, i) => (
              <li key={i}>{fmtDay(w.startMs)} {fmtClock(w.startMs)}–{fmtClock(w.endMs)} · bis {Math.round(w.maxGustKmh)} km/h</li>
            ))}
          </ul>
          {result.noGoWindows.length > 6 && <span className="td-gng-more">+ {result.noGoWindows.length - 6} weitere</span>}
        </div>
      ) : (
        <p className="td-gng-clear">Im gesamten Prognosezeitraum kein Grenzwert-Überschreiten auf dieser Höhe.</p>
      )}

      {/* Export / Teilen (US-E5) */}
      <div className="td-gng-actions">
        <button type="button" className="td-gng-export" onClick={exportReport}>⤓ Auswertung exportieren (.txt)</button>
        <button type="button" className="td-gng-share" onClick={() => void copyLink()}>{copied ? '✓ Link kopiert' : '🔗 Link teilen'}</button>
      </div>
    </div>
  );
}
