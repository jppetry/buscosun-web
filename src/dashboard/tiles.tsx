/**
 * Kacheln des Dashboards (Phase DB) — zeichnen nur das View-Model (`model/types.ts`), rechnen nichts.
 * Jeder Wert trägt `data-origin` (P01–P88) und seine Herkunft als `title` (`origin.ts`); „nicht verfügbar" erscheint
 * als „n. v." mit Grund, nie als Zahl.
 */
import type { ReactNode, RefObject } from 'react';
import { originTitle } from './origin';
import { WeatherIcon } from './icons';
import { NowcastChart } from './charts';
import { pollenColor, uvBarPct, uvColor } from './model/rules';
import type { ConfVM, IconD2VM, NowcastVM, NowVM, PollenVM, Shown, UvVM, WarningVM, WindVM, CloudsVM } from './model/types';

/** Ein Wert mit Herkunft. `long` = „nicht verfügbar" ausschreiben (wo Platz ist). */
export function Val({ v, className, long, prefix }: { v: Shown; className?: string; long?: boolean; prefix?: string }) {
  if (v.t != null) return <span className={className} data-origin={v.o} title={originTitle(v.o)}>{v.t}</span>;
  if (v.na) {
    return (
      <span className={`${className ? `${className} ` : ''}dbd-na`} data-origin={v.o} data-na="1" title={`nicht verfügbar — ${v.na} · ${originTitle(v.o)}`}>
        {prefix}{long ? 'nicht verfügbar' : 'n. v.'}
      </span>
    );
  }
  return <span className={`${className ? `${className} ` : ''}dbd-loading`} data-origin={v.o} aria-busy="true">{prefix}…</span>;
}

export function Rich({ parts }: { parts: Array<string | { b: string }> }) {
  return <>{parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <strong key={i}>{p.b}</strong>))}</>;
}

// ---------------------------------------------------------------------------
// Jetzt · Warnung · Konfidenz
// ---------------------------------------------------------------------------

export function NowCard({ vm }: { vm: NowVM }) {
  return (
    <section className="dbd-card dbd-sand-card dbd-now" aria-label="Jetzt">
      <div className="dbd-now-head">
        <span className="dbd-eyebrow">JETZT · MESSWERT ALS ANKER</span>
        <Val v={vm.source} className="dbd-now-src" long />
      </div>
      <div className="dbd-now-main">
        <div className="dbd-now-temp"><b><Val v={vm.temp} /></b><span className="dbd-unit">{vm.unit}</span></div>
        <WeatherIcon icon={vm.icon} size={44} variant="now" stroke={2.2} />
        <div className="dbd-now-grid">
          <KV l="TAUPUNKT" v={vm.td} />
          <KV l="REL. FEUCHTE" v={vm.rh} />
          <KV l="WIND · BÖEN" v={vm.windGust} />
          <KV l={vm.psLabel} v={vm.ps} />
        </div>
      </div>
      <div className="dbd-chips">
        {vm.chips.map((c, i) => <Val key={i} v={c} className="dbd-chip" long prefix={c.t == null && c.na ? `${CHIP_LABEL[c.o] ?? ''}` : undefined} />)}
      </div>
    </section>
  );
}
const CHIP_LABEL: Partial<Record<Shown['o'], string>> = { P13: 'Wind: ', P14: 'Bewölkung: ', P15: 'Schneegrenze: ', P16: '925 / 850 / 700 hPa: ' };

function KV({ l, v }: { l: string; v: Shown }) {
  return <div><div className="dbd-kv-l">{l}</div><div className="dbd-kv-v"><Val v={v} /></div></div>;
}

function WarnTriangle() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C97B47" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 L22 20 H2 Z" /><line x1="12" y1="10" x2="12" y2="14" />
    </svg>
  );
}

export function WarningCard({ vm }: { vm: WarningVM }) {
  const quiet = vm.state !== 'active';
  const text = vm.state === 'active' ? `„${vm.quote ?? ''}"`
    : vm.state === 'none' ? 'Keine amtliche Warnung für diesen Ort.'
      : vm.state === 'loading' ? 'Warnlage wird geladen …'
        : vm.state === 'na' ? 'Für dieses Land liest die Plattform keine Warnungen.'
          : 'Die Warnungen sind gerade nicht abrufbar — es wird kein Ersatztext gezeigt.';
  return (
    <section className={`dbd-card dbd-warn${quiet ? ' is-quiet' : ''}`} aria-label="Amtliche Warnung" data-origin="P18" title={originTitle('P18')}>
      <div className="dbd-warn-head"><WarnTriangle /><span>AMTLICHE WARNUNG · {vm.channel.toUpperCase()}</span></div>
      <p lang="de">{text}</p>
      <div className="dbd-warn-foot" data-origin="P19">{vm.footer}</div>
    </section>
  );
}

/**
 * E-DB-23: Trichter der halben 80 %-Bandbreite über den ganzen Horizont (P90) — so breit wie die Temperatur jetzt schwankt,
 * und wie weit sie in 14 Tagen schwankt. Marken (P93) dort, wo ±2/3/4 °C zuerst erreicht sind.
 */
function BandFunnel({ vm }: { vm: ConfVM }) {
  const W = 118, top = 4, bottom = 46, mid = (top + bottom) / 2;
  const pts = vm.funnel;
  if (pts.length < 2) return <svg width={W} height="58" viewBox={`0 0 ${W} 58`} className="dbd-funnel" aria-hidden="true" />;
  const hMax = pts[pts.length - 1].h || 1;
  const maxHalf = Math.max(...pts.map((p) => p.half), 0.5);
  const x = (h: number) => (h / hMax) * W;
  const off = (half: number) => (half / maxHalf) * (bottom - top) / 2;
  const d = `${pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.h).toFixed(1)} ${(mid - off(p.half)).toFixed(1)}`).join(' ')} `
    + `${[...pts].reverse().map((p) => `L${x(p.h).toFixed(1)} ${(mid + off(p.half)).toFixed(1)}`).join(' ')} Z`;
  const last = pts[pts.length - 1];
  const label = `Bandbreite ${vm.band.t ?? 'n. v.'} jetzt, ±${last.half.toFixed(1).replace('.', ',')} °C in ${Math.round(hMax / 24)} Tagen${vm.funnelMarks.length ? `; ${vm.funnelMarks.map((m) => m.label).join(', ')}` : ''}`;
  return (
    <svg width={W} height="58" viewBox={`0 0 ${W} 58`} className="dbd-funnel" role="img" aria-label={label} data-origin="P90">
      <path d={d} fill="#C99A4E" opacity=".55" />
      <line x1="0" y1={mid} x2={W} y2={mid} stroke="#F5F1E8" strokeWidth="1.2" opacity=".7" />
      <g data-origin="P93" stroke="#8B8474" strokeWidth="1" strokeDasharray="2 2">
        {vm.funnelMarks.map((m) => <line key={m.k} x1={x(m.h)} x2={x(m.h)} y1={top} y2={bottom} />)}
      </g>
      <g fontFamily="League Spartan" fontSize="9.5" fill="#8B8474">
        <text x="0" y="56">jetzt</text>
        <text x={W} y="56" textAnchor="end">+{Math.round(hMax / 24)} Tage</text>
      </g>
    </svg>
  );
}

export function ConfidenceCard({ vm }: { vm: ConfVM }) {
  const fair = vm.pct != null && vm.pct < 70;
  return (
    <section className="dbd-card dbd-dark-card dbd-conf dbd-dark" aria-label="Konfidenz und Quellen">
      <span className="dbd-eyebrow" style={{ letterSpacing: '2px' }}>KONFIDENZ &amp; QUELLEN</span>
      <div className="dbd-conf-row">
        <BandFunnel vm={vm} />
        <div className="dbd-conf-main">
          <div className="dbd-conf-pct"><Val v={vm.band} /></div>
          <div className="dbd-conf-range"><Val v={vm.bandRange} long /></div>
          <div className={`dbd-conf-word${fair ? ' is-fair' : ''}`}>Index <Val v={vm.value} /> · <Val v={vm.word} /></div>
        </div>
      </div>
      <div className="dbd-weights" data-origin="P24">
        {vm.weights.map((w, i) => <span key={i} style={{ width: `${w.pct}%`, background: w.color }} />)}
      </div>
      <div className="dbd-weights-text"><Val v={vm.weightsText} long /></div>
      <div className="dbd-conf-foot">Gewicht je Stunde neu — Kennzeichnung an jedem Wert</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Nowcast · Bewölkung · Windrichtung
// ---------------------------------------------------------------------------

export function NowcastTile({ vm, rootRef }: { vm: NowcastVM; rootRef?: RefObject<HTMLElement | null> }) {
  return (
    <section ref={rootRef} className="dbd-nowcast" aria-label="Nowcast Radar">
      <div className="dbd-nowcast-head"><span>NOWCAST · RADAR</span><span data-origin="P56">{vm.horizon}</span></div>
      <div className="dbd-nowcast-line"><Val v={vm.headline} long /></div>
      <div className="dbd-nowcast-chart"><NowcastChart vm={vm} /></div>
      <div className="dbd-nchips">
        {vm.chips.map((c, i) => <Val key={i} v={c} className="dbd-nchip" long prefix={c.t == null && c.na ? 'Blitze 1 h: ' : undefined} />)}
      </div>
    </section>
  );
}

export function CloudsTile({ vm }: { vm: CloudsVM }) {
  const W = 300;
  const x = (t: number) => ((t - vm.fromMs) / (vm.toMs - vm.fromMs)) * W;
  const rows: Array<{ id: 'high' | 'mid' | 'low'; y: number; base: number; op: number }> = [
    { id: 'high', y: 2, base: .45, op: .8 }, { id: 'mid', y: 25, base: .35, op: .7 }, { id: 'low', y: 48, base: .3, op: .6 },
  ];
  // Gesamtbewölkung: Linie p50 und Band p10–p90 im unteren Streifen (y 70 … 94 ↔ 100 … 0 %).
  const yT = (pc: number) => 94 - (pc / 100) * 24;
  const pts = vm.total.filter((p) => p.p50 != null);
  const band = vm.total.filter((p) => p.p10 != null && p.p90 != null);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${yT(p.p50!).toFixed(1)}`).join(' ');
  const bandPath = band.length > 1
    ? `${band.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${yT(p.p10!).toFixed(1)}`).join(' ')} ${[...band].reverse().map((p) => `L${x(p.t).toFixed(1)} ${yT(p.p90!).toFixed(1)}`).join(' ')} Z`
    : '';
  return (
    <section className="dbd-tile" aria-label="Bewölkung in vier Schichten">
      <span className="dbd-eyebrow">BEWÖLKUNG · 4 SCHICHTEN</span>
      <svg className="dbd-clouds-svg" viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true" data-origin="P60">
        {rows.map((r) => {
          const layer = vm.layers.find((l) => l.id === r.id);
          return (
            <g key={r.id}>
              <rect x="0" y={r.y} width="300" height="19" fill="#C9CFD6" opacity={r.base} />
              {(layer?.cells ?? []).filter((c) => c.pct >= 1).map((c, i) => (
                <rect key={i} x={x(c.from)} y={r.y} width={Math.max(0.5, x(c.to) - x(c.from))} height="19" fill="#9BA6B2" opacity={(r.op * Math.min(100, c.pct)) / 100} />
              ))}
            </g>
          );
        })}
        {bandPath && <path d={bandPath} fill="rgba(44,42,38,.09)" data-origin="P61" />}
        {line && <path d={line} fill="none" stroke="#2C2A26" strokeWidth="1.5" data-origin="P61" />}
      </svg>
      <div className="dbd-caption"><Val v={vm.caption} long /></div>
    </section>
  );
}

const ROSE_FILLS = ['#C4B896', '#A89A7A', '#8B8474', '#5C5447'];

export function WindTile({ vm }: { vm: WindVM }) {
  const max = Math.max(0.0001, ...vm.sectors.map((s) => s.share));
  const wedge = (deg: number, r: number) => {
    // Sektor ±22,5° um die Herkunftsrichtung (meteorologisch: 0° = aus Nord, oben).
    const a0 = ((deg - 22.5 - 90) * Math.PI) / 180, a1 = ((deg + 22.5 - 90) * Math.PI) / 180;
    const p = (a: number) => `${(55 + r * Math.cos(a)).toFixed(1)} ${(55 + r * Math.sin(a)).toFixed(1)}`;
    return `M55 55 L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`;
  };
  const now = vm.nowDeg;
  const nowEnd = now == null ? null : [55 + 30 * Math.cos(((now - 90) * Math.PI) / 180), 55 + 30 * Math.sin(((now - 90) * Math.PI) / 180)];
  return (
    <section className="dbd-tile" aria-label="Windrichtung und Reichweite">
      <span className="dbd-eyebrow">WINDRICHTUNG · REICHWEITE</span>
      <div className="dbd-wind">
        <svg viewBox="0 0 110 110" aria-hidden="true" data-origin="P63">
          <circle cx="55" cy="55" r="40" fill="none" stroke="#E0D6BE" strokeWidth=".9" />
          <circle cx="55" cy="55" r="20" fill="none" stroke="#EDE6D3" strokeWidth=".9" />
          {vm.sectors.filter((s) => s.share > 0).map((s) => {
            const rel = s.share / max;
            return <path key={s.deg} d={wedge(s.deg, 14 + 22 * rel)} fill={ROSE_FILLS[Math.min(3, Math.floor(rel * 3.999))]} />;
          })}
          {nowEnd && <line x1="55" y1="55" x2={nowEnd[0].toFixed(1)} y2={nowEnd[1].toFixed(1)} stroke="#2C2A26" strokeWidth="1.5" strokeDasharray="3 2" data-origin="P64" />}
          <g fill="#8B7355" fontSize="8.5" textAnchor="middle" fontFamily="League Spartan">
            <text x="55" y="10">N</text><text x="102" y="58">O</text><text x="55" y="105">S</text><text x="8" y="58">W</text>
          </g>
        </svg>
        <div className="dbd-wind-body">
          <div className="dbd-wind-title"><Val v={vm.title} long /></div>
          <div className="dbd-wind-text">
            belastbar bis <strong><Val v={vm.reach} /></strong>
            <span data-origin="P65"> · je Windstärke </span><span className="dbd-na" title="nicht verfügbar — die Fusion gibt die Richtung je Stunde frei, nicht je Windstärke">n. v.</span>
          </div>
          <div className="dbd-wind-bar" data-origin="P66" title={originTitle('P66')}>
            {vm.reachPct != null && <div style={{ width: `${vm.reachPct}%` }} />}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// UV · Pollen · ICON-D2
// ---------------------------------------------------------------------------

export function UvTile({ vm }: { vm: UvVM }) {
  return (
    <section className="dbd-white" aria-label="UV-Index">
      <span className="dbd-s2-l">UV-INDEX · DWD · NUR DE</span>
      {vm.state === 'ok' ? (
        <div className="dbd-uv" data-origin="P81">
          {vm.days.map((d) => (
            <div key={d.label}>
              <div className="dbd-uv-area">{d.value != null && <div className="dbd-uv-bar" style={{ height: `${uvBarPct(d.value)}%`, background: uvColor(d.value) }} />}</div>
              <div className="dbd-uv-v">{d.value != null ? Math.round(d.value) : <span className="dbd-na" title="nicht verfügbar — DWD liefert den Tag nicht">n. v.</span>}</div>
              <div className="dbd-uv-d">{d.label}</div>
            </div>
          ))}
        </div>
      ) : <Empty state={vm.state} na={vm.na} />}
      <div className="dbd-s2-cap"><Val v={vm.caption} long /></div>
    </section>
  );
}

export function PollenTile({ vm }: { vm: PollenVM }) {
  return (
    <section className="dbd-white dbd-pollen-card" aria-label="Pollenflug">
      <div className="dbd-pollen-head"><span className="dbd-s2-l">POLLEN · DWD-GEFAHRENINDEX · 8 ARTEN · NUR DE</span><span data-origin="P83">{vm.cams}</span></div>
      {vm.state === 'ok' ? (
        <div className="dbd-pollen" data-origin="P82">
          {vm.species.map((s) => (
            <div key={s.name}>
              <div className="dbd-pollen-tile" title={`${s.name}: heute ${lvl(s.levels[0])} · morgen ${lvl(s.levels[1])} · übermorgen ${lvl(s.levels[2])} (DWD-Index 0–3)`}>
                {s.levels.map((l, i) => <span key={i} style={{ background: pollenColor(l) }} />)}
              </div>
              <div className="dbd-pollen-name">{s.name}</div>
            </div>
          ))}
        </div>
      ) : <Empty state={vm.state} na={vm.na} />}
      <div className="dbd-pollen-cap"><Val v={vm.caption} long /></div>
    </section>
  );
}
const lvl = (x: number | null) => (x == null ? 'n. v.' : String(x).replace('.', ','));

export function IconD2Tile({ vm, rootRef }: { vm: IconD2VM; rootRef?: RefObject<HTMLElement | null> }) {
  return (
    <section ref={rootRef} className="dbd-icond2 dbd-dark" aria-label="ICON-D2-Layer am Ort">
      <span className="dbd-s2-l">{vm.title}</span>
      <div className="dbd-icond2-rows">
        {vm.rows.map((r) => (
          <div key={r.label}><span>{r.label}</span><Val v={r.value} className={r.value.t != null ? `dbd-tone-${r.tone}` : undefined} /></div>
        ))}
      </div>
      <div className="dbd-icond2-foot">{vm.foot}</div>
    </section>
  );
}

export function Empty({ state, na, children }: { state: string; na: string | null; children?: ReactNode }) {
  if (state === 'loading') return <div className="dbd-empty dbd-loading" aria-busy="true">lädt …</div>;
  return <div className="dbd-empty">nicht verfügbar{na ? ` — ${na}` : ''}{children}</div>;
}
