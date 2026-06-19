/**
 * „KI-Nowcast (experimentell)" — zeigt die In-Browser-Inferenz des gelernten
 * Radar-Nowcasters (ML #4) auf den ECHTEN RADOLAN-Frames: aus den jüngsten
 * Frames (0/+5/+10 min) den +15-min-Frame vorhersagen und neben dem tatsäch-
 * lichen DWD-Frame anzeigen, plus Übereinstimmung (Korrelation/CSI).
 *
 * EHRLICH gekennzeichnet: Demo-Gewichte auf SIMULIERTER Radar-Dynamik trainiert;
 * ersetzt NICHT den Produktiv-Nowcast. Lädt die Gewichte lazy (nur wenn geöffnet).
 */

import { useEffect, useRef, useState } from 'react';
import type { RadarStack } from '../radar/radarFrames';
import { loadNowcaster, predictFromFrames, coarsenFrameU8, frameAgreement, type LoadedNowcaster } from './nowcasterInference';
import type { Tensor } from './convNet';

const FACTOR = 10; // RADOLAN ~1100×1200 → ~110×120 fürs Netz

export default function KiNowcastCard({ stack }: { stack: RadarStack }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-ki">
      <button type="button" className="ml-ki-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        🧠 KI-Nowcast (experimentell) {open ? '▾' : '▸'}
      </button>
      {open && <KiNowcastBody stack={stack} />}
    </div>
  );
}

function KiNowcastBody({ stack }: { stack: RadarStack }) {
  const [state, setState] = useState<'loading' | 'unavailable' | 'ready' | 'nodata'>('loading');
  const [loaded, setLoaded] = useState<LoadedNowcaster | null>(null);
  const [agree, setAgree] = useState<{ corr: number; csi: number } | null>(null);
  const predRef = useRef<HTMLCanvasElement | null>(null);
  const dwdRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const m = await loadNowcaster();
      if (!alive) return;
      if (!m) { setState('unavailable'); return; }
      setLoaded(m);
      // Eingabe = jüngste Frames mit Lead 0/+5/+10; Ziel = DWD-Frame +15 min.
      const asc = [...stack.frames].sort((a, b) => a.leadMinutes - b.leadMinutes);
      const inFrames = [0, 5, 10].map((lead) => asc.find((f) => f.leadMinutes === lead)).filter(Boolean) as typeof asc;
      const dwd15 = asc.find((f) => f.leadMinutes === 15);
      if (inFrames.length < m.K || !dwd15) { setState('nodata'); return; }
      const res = predictFromFrames(m, inFrames.map((f) => ({ values: f.values, width: f.width, height: f.height })), FACTOR, 1);
      if (!res) { setState('nodata'); return; }
      const pred = res.preds[0];
      const dwdCoarse = coarsenFrameU8(dwd15.values, dwd15.width, dwd15.height, FACTOR);
      setAgree(frameAgreement(pred, dwdCoarse));
      setState('ready');
      requestAnimationFrame(() => { paint(predRef.current, pred); paint(dwdRef.current, dwdCoarse); });
    })();
    return () => { alive = false; };
  }, [stack]);

  if (state === 'loading') return <p className="ml-ki-note"><span className="ev-spinner" /> Modell wird geladen …</p>;
  if (state === 'unavailable') return <p className="ml-ki-note">KI-Modell nicht verfügbar (Gewichte fehlen).</p>;
  if (state === 'nodata') return <p className="ml-ki-note">Zu wenige Frames für die Demo (braucht 0/+5/+10/+15 min).</p>;

  return (
    <div className="ml-ki-body">
      <div className="ml-ki-canvases">
        <figure><canvas ref={predRef} className="ml-ki-canvas" /><figcaption>KI-Vorhersage +15 min</figcaption></figure>
        <figure><canvas ref={dwdRef} className="ml-ki-canvas" /><figcaption>DWD-Radar +15 min</figcaption></figure>
      </div>
      {agree && (
        <p className="ml-ki-agree">
          Übereinstimmung mit DWD: Korrelation <strong>{agree.corr}</strong> · Regen-CSI <strong>{agree.csi}</strong>.
        </p>
      )}
      {loaded && (
        <p className="ml-ki-note">
          ⚠ Experimentell. {loaded.note} Out-of-sample (Sim-Testdaten): Regen-CSI {loaded.eval.csiModel} vs. {loaded.eval.csiPersist} (Persistenz)
          {loaded.eval.improvementPct > 0 ? `, MSE −${loaded.eval.improvementPct}%` : ''}.
        </p>
      )}
    </div>
  );
}

/** Malt ein [1,H,W]-Feld [0,1] in ein Canvas (blaue Intensitätsrampe). */
function paint(canvas: HTMLCanvasElement | null, t: Tensor): void {
  if (!canvas) return;
  canvas.width = t.W; canvas.height = t.H;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const img = ctx.createImageData(t.W, t.H);
  for (let i = 0; i < t.data.length; i++) {
    const v = Math.max(0, Math.min(1, t.data[i]));
    const a = v < 0.02 ? 0 : 255;
    // hellblau → dunkelblau → violett
    img.data[i * 4] = Math.round(40 + v * 110);
    img.data[i * 4 + 1] = Math.round(120 - v * 80);
    img.data[i * 4 + 2] = Math.round(200 - v * 60);
    img.data[i * 4 + 3] = Math.round(a * (0.25 + 0.75 * v));
  }
  ctx.putImageData(img, 0, 0);
}
