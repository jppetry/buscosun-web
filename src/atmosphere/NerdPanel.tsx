/**
 * Atmosphäre · Nerd-Mode (Tiefe 3, lazy geladen).
 *
 * Vollständige Daten für Enthusiasten: echtes Skew-T/Log-P (wiederverwendet aus
 * threed/SkewTChart), CAPE/CIN/LCL/LFC/EL/Lifted-Index, Deckelinversions-Stärke
 * und die rohen ICON-EU-Level-Werte je Druckfläche — plus Modelllauf-Zeitstempel
 * und -Alter. Wird via React.lazy nur bei Opt-in geladen (kein Standard-Bundle).
 */

import { useAtmosphere } from './atmosphereStore';
import SkewTChart from '../threed/SkewTChart';

const de0 = (n: number) => Math.round(n).toString();
const de1 = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');
const windKmh = (u: number, v: number) => Math.hypot(u, v) * 3.6;
const windDir = (u: number, v: number) => (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
const compass = (deg: number) => ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];

function fmtUTC(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}. ${String(d.getUTCHours()).padStart(2, '0')}Z`;
}

export default function NerdPanel() {
  const { sounding, profile, modelRunAt } = useAtmosphere();

  if (!sounding || !profile) {
    return <div className="atm-nerd-body">Werte erscheinen, sobald das Sounding geladen ist.</div>;
  }
  const { profile: snd, derived: d } = sounding;

  // Stärkste erhöhte Inversion (Deckel) — dünne (<200 m) als unteraufgelöst markieren.
  const capping = profile.inversions
    .filter((iv) => iv.baseM > profile.surfaceM + 300)
    .sort((a, b) => b.deltaC - a.deltaC)[0] ?? null;

  const ageH = modelRunAt ? Math.max(0, Math.round((Date.now() - modelRunAt.getTime()) / 3_600_000)) : null;

  const indices: Array<[string, string]> = [
    ['CAPE', `${de0(d.capeJkg)} J/kg`],
    ['CIN', `${de0(d.cinJkg)} J/kg`],
    ['Lifted Index', d.liftedIndex == null ? '–' : de1(d.liftedIndex)],
    ['LCL', `${de0(d.lclM)} m`],
    ['LFC', d.lfcM == null ? '–' : `${de0(d.lfcM)} m`],
    ['Gleichgewicht (EL)', d.elM == null ? '–' : `${de0(d.elM)} m`],
    ['Nullgradgrenze', d.freezingM == null ? '–' : `${de0(d.freezingM)} m`],
  ];

  return (
    <div className="atm-nerd-body atm-nerd-full">
      <div className="atm-nerd-grid">
        <div className="atm-nerd-skewt">
          <SkewTChart profile={snd} derived={d} />
        </div>
        <div className="atm-nerd-side">
          <dl className="atm-nerd-idx">
            {indices.map(([k, v]) => (<div key={k} className="atm-nerd-idxrow"><dt>{k}</dt><dd>{v}</dd></div>))}
          </dl>
          <p className="atm-nerd-cap">
            {capping
              ? <>Deckelinversion: {de0(capping.baseM)}–{de0(capping.topM)} m, +{de1(capping.deltaC)} °C{capping.topM - capping.baseM < 200 ? ' (dünn — ggf. unteraufgelöst)' : ''}.</>
              : 'Keine ausgeprägte Deckelinversion.'}
          </p>
        </div>
      </div>

      <table className="atm-nerd-table">
        <thead>
          <tr><th>hPa</th><th>m ü. NN</th><th>T °C</th><th>Td °C</th><th>Wind</th></tr>
        </thead>
        <tbody>
          {snd.levels.map((l) => (
            <tr key={l.pressureHpa}>
              <td>{de0(l.pressureHpa)}</td>
              <td>{de0(l.heightM)}</td>
              <td>{de1(l.tempC)}</td>
              <td>{de1(l.dewC)}</td>
              <td>{de0(windKmh(l.windU, l.windV))} km/h {compass(windDir(l.windU, l.windV))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="atm-nerd-src">
        ICON-EU (~7 km) · Lauf {fmtUTC(snd.runAt)}{ageH != null ? ` (vor ${ageH} h)` : ''} · gültig {fmtUTC(snd.validAt)} ·
        Richtwert; grobe Standard-Druckflächen, kein Radiosonden-Ersatz.
      </p>
    </div>
  );
}
