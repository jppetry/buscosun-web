/**
 * MOS-Kalibrierungs-Panel — macht das ML sichtbar & überprüfbar.
 *
 * Trainiert beim Öffnen die Orts-Klimatologie auf der ERA5-Historie (im Browser),
 * zeigt das **Reliability-Diagramm** (out-of-sample) als ehrlichen Beweis, dass
 * die Wahrscheinlichkeiten kalibriert sind, die Skill-Zahlen, und eine
 * **7-Tage-Vorhersage mit kalibrierter Regenwahrscheinlichkeit & ehrlichem
 * Unsicherheitsband**, die das Live-Modell-Ensemble mit der Klimatologie
 * lead-zeit-gewichtet verbindet.
 */

import { useEffect, useRef, useState } from 'react';
import type { Location } from '../types';
import { doyOf } from '../history/historyModel';
import type { MultiModelForecast } from '../confidence/multiModel';
import { trainLocationMos, forecastWithMos, forecastAnalog, type TrainedMos } from './mosTrain';
import { snowProb, snowPhase } from './snowModel';
import './ml.css';

interface Props {
  location: Location;
  live: MultiModelForecast | null;
}

type State =
  | { kind: 'idle' }
  | { kind: 'training' }
  | { kind: 'ready'; trained: TrainedMos }
  | { kind: 'error'; message: string };

export default function MosPanel({ location, live }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: 'idle' });
  // Welcher Ort bereits trainiert ist — vermeidet erneutes Training beim
  // bloßen Zu-/Aufklappen (nur bei echtem Ortswechsel neu).
  const trainedKeyRef = useRef('');

  // LAZY: das schwere ERA5-Training (~30 Jahre im Browser) erst starten, wenn
  // der Bereich aufgeklappt ist — und nur, wenn dieser Ort noch nicht trainiert
  // wurde. Spart Rechenarbeit für alle, die den Selbsttest gar nicht öffnen.
  useEffect(() => {
    if (!open) return;
    const key = `${location.lat},${location.lon}`;
    if (trainedKeyRef.current === key) return;
    const ac = new AbortController();
    setState({ kind: 'training' });
    trainLocationMos(location.lat, location.lon, { years: 30, signal: ac.signal })
      .then((trained) => { if (!ac.signal.aborted) { trainedKeyRef.current = key; setState({ kind: 'ready', trained }); } })
      .catch((err) => {
        if (ac.signal.aborted || (err as { name?: string })?.name === 'AbortError') return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Training fehlgeschlagen' });
      });
    return () => ac.abort();
  }, [location.lat, location.lon, open]);

  return (
    <details className="rt-section ml-mos" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="ml-mos-summary">
        <span className="ml-mos-sum-text">
          <span className="rt-eyebrow fc-eyebrow">KI-Selbsttest · auf ERA5-Historie geprüft</span>
          <strong className="ml-mos-sum-title">Wie ehrlich ist diese Vorhersage-KI?</strong>
          <span className="ml-mos-sum-sub">
            Eine KI lernt im Browser ~30 Jahre Wetter für deinen Ort — und prüft sich hier selbst. Zum Aufklappen tippen.
          </span>
        </span>
        <svg className="ml-mos-chevron" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6,8 10,12 14,8" />
        </svg>
      </summary>

      <div className="ml-mos-body">
        <p className="ml-mos-intro">
          Damit du der Vorhersage vertrauen kannst, testet sich die KI mit Wetterdaten, die sie beim Lernen
          <strong> nicht gesehen</strong> hat (Jahr für Jahr ausgelassen). Die Kernfrage: Wenn sie „70 % Regen" sagt —
          regnet es dann auch wirklich an rund 70 % dieser Tage? Die folgenden Punkte sind der offene Beweis.
        </p>

        {state.kind === 'training' && (
          <div className="rt-card ml-state"><span className="ev-spinner" /> <p>Orts-Klimatologie wird trainiert &amp; mit ungesehenen Jahren gegengeprüft …</p></div>
        )}
        {state.kind === 'error' && <div className="rt-card ml-state"><p>⚠ {state.message}</p></div>}
        {state.kind === 'ready' && <MosReady trained={state.trained} live={live} />}
      </div>
    </details>
  );
}

function MosReady({ trained, live }: { trained: TrainedMos; live: MultiModelForecast | null }) {
  const s = trained.skill;
  return (
    <div className="ml-grid">
      <div className="rt-card ml-card">
        <span className="ml-card-title">Reliability — ist „70 %" wirklich 70 %?</span>
        <ReliabilityChart trained={trained} />
        <p className="ml-note">
          Out-of-sample (Leave-one-year-out): die vorhergesagte Regenwahrscheinlichkeit gegen die
          tatsächlich eingetretene Häufigkeit. Nah an der Diagonale = ehrlich kalibriert.
        </p>
      </div>

      <div className="rt-card ml-card">
        <span className="ml-card-title">Wie gut trifft sie? — an ungesehenen Jahren geprüft</span>
        <ul className="ml-skills">
          <li>
            <span className="ml-skill-k">Temperatur trifft auf</span>
            <span className="ml-skill-v">± {s.tempRmseClim} °C</span>
            <span className={`ml-skill-d ${s.tempImprovementPct > 0 ? 'is-good' : ''}`}>
              {s.tempImprovementPct > 0 ? `${s.tempImprovementPct}% genauer` : 'gleichauf'} als der reine Jahresschnitt (± {s.tempRmseBaseline} °C)
            </span>
          </li>
          <li>
            <span className="ml-skill-k">Regen besser als raten?</span>
            <span className="ml-skill-v">{s.precipBss > 0 ? 'Ja' : 'Nein'}</span>
            <span className={`ml-skill-d ${s.precipBss > 0 ? 'is-good' : ''}`}>
              {s.precipBss > 0 ? 'schlägt' : 'unter'} den langjährigen Schnitt ({Math.round(s.precipBaseRate * 100)}% Regentage) · Skill {s.precipBss}
            </span>
          </li>
          <li>
            <span className="ml-skill-k">Stimmen die Prozente?</span>
            <span className="ml-skill-v">{s.eceRaw} → {s.eceCal}</span>
            <span className={`ml-skill-d ${s.eceCal <= s.eceRaw ? 'is-good' : ''}`}>Abweichung kleiner = ehrlicher (ECE)</span>
          </li>
        </ul>
        <p className="ml-note">
          Trainiert auf {s.nDays.toLocaleString('de-DE')} Tagen ({s.years} Jahre) · {trained.source.label} ·
          {trained.range.startYear}–{trained.range.endYear}. {trained.source.kind === 'measured' ? 'Echte Stationsmessungen.' : 'Reanalyse, keine reine Messung.'}
        </p>
      </div>

      {trained.snow && (
        <div className="rt-card ml-card">
          <span className="ml-card-title">Gelernte Schnee/Regen-Grenze</span>
          <SnowCurve trained={trained} />
          <p className="ml-note">
            Logistische Kurve P(Schnee | Temperatur), gelernt aus {trained.snow.nSnow.toLocaleString('de-DE')} Schneetagen.
            Übergang (50 %) bei <strong>{trained.snow.t50} °C</strong> statt fixer 0,5 °C.
            Out-of-sample-Brier {trained.snow.brierModel} vs. {trained.snow.brierThresh} (feste Schwelle) —
            {trained.snow.brierModel < trained.snow.brierThresh ? ' Kurve ist besser.' : ' gleichwertig.'}
          </p>
        </div>
      )}

      {live && live.days.length > 0 && (
        <div className="rt-card ml-card ml-card-wide">
          <span className="ml-card-title">7 Tage · kalibrierte Wahrscheinlichkeit &amp; ehrliches Band</span>
          <CalibratedDays trained={trained} live={live} />
          <p className="ml-note">
            Kurzer Vorlauf → Live-Ensemble dominiert; mit zunehmendem Vorlauf zieht alles zur Orts-Klimatologie,
            und das Temperatur-Band weitet sich automatisch auf (kein Vortäuschen falscher Präzision).
          </p>
        </div>
      )}

      {trained.analog && live && live.days.length > 0 && (
        <div className="rt-card ml-card ml-card-wide">
          <span className="ml-card-title">Analog-Ensemble · vergleichbare Tage aus der Historie</span>
          <AnalogView trained={trained} live={live} />
        </div>
      )}
    </div>
  );
}

function ReliabilityChart({ trained }: { trained: TrainedMos }) {
  const W = 240, H = 240, pad = 28;
  const x = (p: number) => pad + p * (W - 2 * pad);
  const y = (p: number) => H - pad - p * (H - 2 * pad);
  const maxCount = Math.max(1, ...trained.reliabilityRaw.map((b) => b.count));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ml-rel" role="img" aria-label="Reliability-Diagramm">
      {/* Gitter */}
      <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="#fff" stroke="var(--sand-200, #E0D6BE)" />
      {/* perfekte Kalibrierung */}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#9aa0a6" strokeDasharray="4 3" />
      {/* Roh (OOS, der ehrliche Beweis) */}
      <polyline fill="none" stroke="#3A6FA8" strokeWidth={2}
        points={trained.reliabilityRaw.map((b) => `${x(b.forecast)},${y(b.observed)}`).join(' ')} />
      {trained.reliabilityRaw.map((b, i) => (
        <circle key={i} cx={x(b.forecast)} cy={y(b.observed)} r={3 + 4 * (b.count / maxCount)} fill="#3A6FA8" opacity={0.85} />
      ))}
      {/* Achsen */}
      <text x={W / 2} y={H - 6} textAnchor="middle" className="ml-ax">vorhergesagt</text>
      <text x={10} y={H / 2} textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`} className="ml-ax">eingetreten</text>
    </svg>
  );
}

function AnalogView({ trained, live }: { trained: TrainedMos; live: MultiModelForecast }) {
  if (!trained.analog) return null;
  const sk = trained.analog.skill;
  // Zieltag = erster Forecast-Tag; Prädiktor = vom Modell vorhergesagte Mitteltemperatur.
  const d0 = live.days[0];
  const [yr, mo, da] = d0.dateISO.split('-').map(Number);
  const doy = doyOf(yr, mo, da);
  const tmax = d0.tMaxByModel.filter(Number.isFinite);
  const tmin = d0.tMinByModel.filter(Number.isFinite);
  const meanOf = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  const predTMean = (meanOf(tmax) + meanOf(tmin)) / 2;
  const a = Number.isFinite(predTMean) ? forecastAnalog(trained, doy, predTMean) : null;
  const fmtDate = (iso: string) => { const [y, m, dd] = iso.split('-'); return `${dd}.${m}.${y}`; };

  return (
    <div className="ml-analog">
      <p className="ml-note ml-analog-skill">
        Empirische Verteilung aus echten Outcomes (keine Verteilungs-Annahme). Out-of-sample-CRPS&nbsp;
        <strong>{sk.crpsAnalog}</strong> vs.&nbsp;{sk.crpsClim} (reine Saison-Klimatologie)
        {sk.improvementPct > 0 ? ` · −${sk.improvementPct}% schärfer` : ' · gleichwertig'} ·
        80-%-Abdeckung {Math.round(sk.coverage80 * 100)}% ({sk.coverage80 >= 0.72 && sk.coverage80 <= 0.9 ? 'kalibriert' : 'näherungsweise'}).
      </p>
      {a && a.members.length >= 5 && (
        <>
          <div className="ml-analog-now">
            <span>Heute ähnelt {a.pool} Tagen aus {trained.range.startYear}–{trained.range.endYear}:</span>
            <span className="ml-analog-stat">Regen ≥ {trained.analog.tau} mm in <strong>{Math.round((a.pop ?? 0) * 100)}%</strong></span>
            <span className="ml-analog-stat">Top-Fälle bis <strong>{Math.round(a.p90)} mm</strong> (90-%-Quantil)</span>
          </div>
          <div className="ml-analog-dates">
            <span className="ml-analog-lbl">Ähnlichste Tage:</span>
            {a.analogs.slice(0, 4).map((m) => (
              <span key={m.dateISO} className="ml-analog-chip" title={`${m.outcome.toFixed(1).replace('.', ',')} mm Niederschlag`}>
                {fmtDate(m.dateISO)} · {m.outcome >= trained.analog!.tau ? `${Math.round(m.outcome)} mm` : 'trocken'}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SnowCurve({ trained }: { trained: TrainedMos }) {
  if (!trained.snow) return null;
  const model = trained.snow.model;
  const W = 240, H = 150, pad = 26;
  const tMin = -10, tMax = 10;
  const x = (t: number) => pad + ((t - tMin) / (tMax - tMin)) * (W - 2 * pad);
  const y = (p: number) => H - pad - p * (H - 2 * pad);
  const pts: string[] = [];
  for (let t = tMin; t <= tMax; t += 0.5) pts.push(`${x(t)},${y(snowProb(model, t))}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ml-snow" role="img" aria-label="Schnee-Wahrscheinlichkeitskurve">
      <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="#fff" stroke="var(--sand-200, #E0D6BE)" />
      {/* feste 0,5-°C-Schwelle (Referenz) */}
      <line x1={x(0.5)} y1={pad} x2={x(0.5)} y2={H - pad} stroke="#c9b89a" strokeDasharray="3 3" />
      {/* gelernte T50 */}
      <line x1={x(trained.snow.t50)} y1={pad} x2={x(trained.snow.t50)} y2={H - pad} stroke="#3A6FA8" strokeWidth={1.5} />
      <text x={x(trained.snow.t50)} y={pad - 4} textAnchor="middle" className="ml-ax">T50 {trained.snow.t50}°</text>
      {/* Kurve */}
      <polyline fill="none" stroke="#28507A" strokeWidth={2.5} points={pts.join(' ')} />
      <text x={x(-8)} y={H - 8} className="ml-ax">−10°</text>
      <text x={x(8)} y={H - 8} textAnchor="end" className="ml-ax">+10 °C</text>
      <text x={10} y={y(1)} className="ml-ax">P(Schnee)</text>
    </svg>
  );
}

function CalibratedDays({ trained, live }: { trained: TrainedMos; live: MultiModelForecast }) {
  const days = live.days.slice(0, 7);
  return (
    <div className="ml-days">
      {days.map((d) => {
        const [yr, mo, da] = d.dateISO.split('-').map(Number);
        const doy = doyOf(yr, mo, da);
        const ensTemp = d.tMaxByModel.filter(Number.isFinite);
        const finitePrecip = d.precipByModel.filter(Number.isFinite);
        const rawPoP = finitePrecip.length ? finitePrecip.filter((p) => p >= trained.tau).length / finitePrecip.length : undefined;
        const f = forecastWithMos(trained, doy, d.leadDays, ensTemp.length ? ensTemp : undefined, rawPoP);
        const popPct = Math.round(f.pop * 100);
        // Gelernte Phase (nur wenn Niederschlag wahrscheinlich & Schnee-Modell belastbar).
        const minT = d.tMinByModel.filter(Number.isFinite);
        const dayMin = minT.length ? minT.reduce((a, b) => a + b, 0) / minT.length : null;
        const phase = trained.snow?.reliable && dayMin != null && popPct >= 10 ? snowPhase(snowProb(trained.snow.model, dayMin)) : null;
        const phaseIcon = phase === 'snow' ? '❄' : phase === 'sleet' ? '🌨' : null;
        return (
          <div key={d.dateISO} className="ml-day">
            <span className="ml-day-wd">{d.weekdayShort}{phaseIcon && <span className="ml-day-phase" title={phase === 'snow' ? 'Schnee wahrscheinlich' : 'Schneeregen möglich'}> {phaseIcon}</span>}</span>
            <div className="ml-day-pop">
              <div className="ml-pop-bar"><span style={{ height: `${Math.max(popPct, popPct < 5 ? 4 : popPct)}%` }} className={popPct >= 60 ? 'is-high' : popPct >= 30 ? 'is-mid' : ''} /></div>
              <span className="ml-day-popv">{popPct < 5 ? '<5%' : `${popPct}%`}</span>
            </div>
            <span className="ml-day-temp">{Math.round(f.tempLow)}…{Math.round(f.tempHigh)}°</span>
            {f.bandWidenedToClima && <span className="ml-day-flag" title="Band auf Klimatologie aufgeweitet">⌇</span>}
          </div>
        );
      })}
    </div>
  );
}
