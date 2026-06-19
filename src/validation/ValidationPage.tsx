/**
 * Validierungs-/Über-Seite — macht die Ehrlichkeits-Infra sichtbar: das echte,
 * nicht-zirkuläre Radar-Hindcast des Flow-Ensembles. Rechnet LIVE: aus
 * beobachteten RADOLAN-Analysen bei T−Δ vorhersagen und gegen die spätere
 * beobachtete Analyse verifizieren → Brier/BSS/Reliability gegen ECHTES Radar.
 *
 * „Wetter, das seine Arbeit zeigt" — wir behaupten Kalibrierung nicht, wir prüfen
 * sie und zeigen das Ergebnis (das je nach Wetterlage schwankt).
 */

import { useEffect, useState } from 'react';
import { FeatureTopbar } from '../feature/featureHeader';
import { runRadarHindcast, type LiveHindcast } from '../ml/radarHindcast';
import type { ReliabilityBin } from '../ml/metrics';
import '../feature/FeaturePage.css';
import './ValidationPage.css';

type State = 'loading' | 'ready' | 'error';

export default function ValidationPage({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<State>('loading');
  const [result, setResult] = useState<LiveHindcast | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await runRadarHindcast(ctrl.signal);
        if (!alive) return;
        if (!r) { setErr('Zu wenige RADOLAN-Läufe verfügbar.'); setState('error'); return; }
        setResult(r); setState('ready');
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : 'Unbekannter Fehler'); setState('error');
      }
    })();
    return () => { alive = false; ctrl.abort(); };
  }, []);

  return (
    <div className="feature-page">
      <FeatureTopbar onBack={onBack} />
      <main className="feature-page-body val-body">
        <span className="feature-page-eyebrow">Validierung · Ehrlichkeit</span>
        <h1 className="feature-page-title">Wie gut ist der KI-Nowcast wirklich?</h1>
        <p className="val-intro">
          Statt Kalibrierung zu behaupten, prüfen wir sie. Dieses Hindcast läuft <strong>jetzt live</strong>:
          Aus beobachteten Radar-Analysen der letzten Minuten sagt das Flow-Ensemble den Niederschlag voraus —
          und wird gegen das <strong>tatsächlich beobachtete</strong> Radar danach verglichen. Nicht-zirkulär
          (der DWD-Forecast wird nie als Wahrheit benutzt), nur Deutschland (RADOLAN).
        </p>

        {state === 'loading' && (
          <div className="val-loading">
            <span className="val-spinner" />
            <span>Lade echte RADOLAN-Beobachtungen & rechne das Ensemble … (~20 s)</span>
          </div>
        )}
        {state === 'error' && (
          <p className="val-error">⚠ {err} — das Hindcast braucht mehrere aufeinanderfolgende RADOLAN-Läufe (nur DE).</p>
        )}
        {state === 'ready' && result && <Results r={result} />}

        <Methodology />
      </main>
    </div>
  );
}

function Results({ r }: { r: LiveHindcast }) {
  const o = r.overall;
  const skillPct = Math.round(o.bss * 100);
  return (
    <section className="val-results">
      <div className="val-window">
        Beobachtungen <strong>{r.observedAt[0]}–{r.observedAt[r.observedAt.length - 1]} UTC</strong> ·
        vorhergesagt ab {r.initAt} · {o.n.toLocaleString('de-DE')} Zellen
      </div>

      <div className="val-cards">
        <Card eyebrow="Skill vs. Klimatologie" value={`+${skillPct}%`} sub={`BSS ${o.bss.toFixed(2)} (0 = kein Skill, 1 = perfekt)`} accent={o.bss > 0.2 ? 'good' : o.bss > 0 ? 'mid' : 'bad'} />
        <Card eyebrow="Kalibrierung (ECE)" value={o.ece.toFixed(3)} sub={`${o.ece < 0.05 ? 'gut kalibriert' : o.ece < 0.1 ? 'brauchbar' : 'grob'} — vorhergesagt ≈ beobachtet`} accent={o.ece < 0.05 ? 'good' : o.ece < 0.1 ? 'mid' : 'bad'} />
        <Card eyebrow="Brier-Score" value={o.brier.toFixed(3)} sub={`vs. ${o.brierRef.toFixed(3)} (Basisrate) — kleiner = besser`} accent={o.brier < o.brierRef ? 'good' : 'bad'} />
        <Card eyebrow="Trefferquote (CSI)" value={o.csi.toFixed(2)} sub="Hits / (Hits + Verfehlt + Fehlalarm) — deterministisch, 1 = perfekt" accent={o.csi > 0.5 ? 'good' : o.csi > 0.3 ? 'mid' : 'bad'} />
      </div>

      <div className="val-twocol">
        <div>
          <h2 className="val-h2">Skill je Vorlaufzeit</h2>
          <table className="val-table">
            <thead><tr><th>Vorlauf</th><th>BSS</th><th>Brier</th><th>ECE</th><th>CSI</th></tr></thead>
            <tbody>
              {r.leads.map((l) => (
                <tr key={l.leadMin}>
                  <td>+{l.leadMin} min</td>
                  <td className="num">{l.bss.toFixed(2)}</td>
                  <td className="num">{l.brier.toFixed(3)}</td>
                  <td className="num">{l.ece.toFixed(3)}</td>
                  <td className="num">{l.csi.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="val-foot">Der Skill fällt mit der Vorlaufzeit — physikalisch korrekt: je weiter voraus, desto unsicherer.</p>
        </div>
        <div>
          <h2 className="val-h2">Reliability-Diagramm</h2>
          <ReliabilityChart bins={r.reliability} />
          <p className="val-foot">Punkte auf der Diagonale = perfekt kalibriert (vorhergesagte 70 % treten zu ~70 % ein).</p>
        </div>
      </div>
    </section>
  );
}

function Card({ eyebrow, value, sub, accent }: { eyebrow: string; value: string; sub: string; accent: 'good' | 'mid' | 'bad' }) {
  return (
    <div className={`val-card val-${accent}`}>
      <span className="val-card-eyebrow">{eyebrow}</span>
      <span className="val-card-value">{value}</span>
      <span className="val-card-sub">{sub}</span>
    </div>
  );
}

function ReliabilityChart({ bins }: { bins: ReliabilityBin[] }) {
  const W = 240, H = 240, pad = 30;
  const px = (v: number) => pad + v * (W - 2 * pad);
  const py = (v: number) => (H - pad) - v * (H - 2 * pad);
  const maxC = Math.max(1, ...bins.map((b) => b.count));
  const pts = bins.map((b) => ({ x: px(b.forecast), y: py(b.observed), r: 2 + 5 * Math.sqrt(b.count / maxC) }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="val-reliability" role="img" aria-label="Reliability-Diagramm">
      {/* Gitter */}
      <g stroke="var(--sand-200, #e6ddc8)" strokeWidth="1">
        {[0.25, 0.5, 0.75].map((t) => <line key={`v${t}`} x1={px(t)} y1={py(0)} x2={px(t)} y2={py(1)} />)}
        {[0.25, 0.5, 0.75].map((t) => <line key={`h${t}`} x1={px(0)} y1={py(t)} x2={px(1)} y2={py(t)} />)}
      </g>
      {/* Achsen */}
      <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(0)} stroke="var(--stone-400, #8b8170)" strokeWidth="1" />
      <line x1={px(0)} y1={py(0)} x2={px(0)} y2={py(1)} stroke="var(--stone-400, #8b8170)" strokeWidth="1" />
      {/* Diagonale (perfekte Kalibrierung) */}
      <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="var(--stone-400, #8b8170)" strokeWidth="1.2" strokeDasharray="4 3" />
      {/* Reliability-Kurve */}
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#1f4fd0" strokeWidth="1.6" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#1f4fd0" fillOpacity="0.8" />)}
      {/* Labels */}
      <text x={px(0.5)} y={H - 6} textAnchor="middle" className="val-axis">vorhergesagte Wahrscheinlichkeit</text>
      <text x={10} y={py(0.5)} textAnchor="middle" transform={`rotate(-90 10 ${py(0.5)})`} className="val-axis">beobachtete Häufigkeit</text>
    </svg>
  );
}

function Methodology() {
  return (
    <section className="val-method">
      <h2 className="val-h2">Wie das Hindcast funktioniert</h2>
      <ol className="val-steps">
        <li>Wir laden die letzten <strong>beobachteten</strong> RADOLAN-Analysen (DE1200, 5-Minuten-Schritte).</li>
        <li>Aus den zwei ältesten schätzen wir das Bewegungsfeld (Horn-Schunck, optischer Fluss).</li>
        <li>15 Ensemble-Member advehieren das Radar mit <strong>gestörten</strong> Bewegungsfeldern (±Tempo, ±Richtung) → Regenwahrscheinlichkeit je Zelle.</li>
        <li>Wir vergleichen diese Vorhersage gegen die <strong>spätere, tatsächlich beobachtete</strong> Analyse — nicht gegen einen anderen Forecast.</li>
      </ol>
      <p className="val-caveat">
        <strong>Ehrliche Grenze:</strong> Die Werte schwanken mit der Wetterlage — an ruhigen, langsam ziehenden Tagen ist der Skill höher,
        bei konvektiven Lagen niedriger. Dies misst das <em>Flow-Ensemble</em> (0–60 min, nur DE), nicht den Temperatur-Schleier.
        Zusätzlich ist der Ensemble-Apparat in einem Monte-Carlo-Test gegen unabhängige Wahrheit kalibriert (headless verifiziert).
      </p>
    </section>
  );
}
