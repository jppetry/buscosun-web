/**
 * Phase FX-UI, part B — `/buscosun-fusion`: what the post-processing "buscosun Fusion" does, without giving away how it is tuned
 * (`audit/fusion-erklaerung.md`). Command-Deck page, lazy chunk, namespace `.fx-`. Every graphic is a SCHEMA without measured data.
 * The stand always comes from the register (`fusionName(FUSION_CURRENT)`); the stands strip is built from `FUSION_RELEASES`.
 */
import { Fragment } from 'react';
import { FUSION_BASE, FUSION_BASE_PUBLIC_LABEL, FUSION_CURRENT, FUSION_RELEASES, fusionName } from '../pointForecast/fusion/fusionRelease';
import StepPanel, { type StepNo } from './StepPanel';
import TerrainFigure from './TerrainFigure';
import OutputFigure from './OutputFigure';
import { OUTPUT } from './charts';
import { CLOSING, FOOTER, HERO, PROOF_CARDS, SECTIONS as S, SOURCES, SOURCE_TICKS } from './copy';
import './FusionExplainerPage.css';

const minus = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));
/** `2026-10-01` → `01.10.` */
const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
/** Section 03 axis: square-root scale over 0–336 h, so the first hours get room. */
const pos = (h: number) => Math.sqrt(h / 336) * 100;

function Head({ id, num, kicker, h2, intro }: { id: string; num: string; kicker: string; h2: string; intro?: string }) {
  return (
    <header className="fx-head">
      <div className="fx-kicker-row"><span className="fx-num">{num}</span><span className="fx-kicker">{kicker}</span></div>
      <h2 className="fx-h2" id={`${id}-h`}>{h2}</h2>
      {intro && <p className="fx-intro">{intro}</p>}
    </header>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return <section className="fx-section" aria-labelledby={`${id}-h`} id={id}>{children}</section>;
}

export default function FusionExplainerPage({ onBack }: { onBack: () => void }) {
  const stand = fusionName(FUSION_CURRENT);
  const stands = [
    { n: FUSION_BASE, date: S.s5.baseDate, label: FUSION_BASE_PUBLIC_LABEL },
    ...FUSION_RELEASES.filter((r) => r.n <= FUSION_CURRENT).map((r) => ({ n: r.n, date: ddmm(r.date), label: r.publicLabel ?? '' })),
  ];
  const r = OUTPUT.readout;

  return (
    <div className="fx-page">
      <header className="fx-topbar">
        <a className="fx-brand" href="/" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <img src="/buscosun-mark.svg" width="26" height="26" alt="" aria-hidden="true" />
          <span className="fx-brand-name">buscosun</span>
        </a>
        <span className="fx-topbar-kicker">METHODIK · BUSCOSUN FUSION</span>
        <a className="fx-back" href="/" onClick={(e) => { e.preventDefault(); onBack(); }}>← Startseite</a>
      </header>

      <main className="fx-main">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="fx-hero">
          <div className="fx-hero-text">
            <div className="fx-eyebrow-row"><span className="fx-eyebrow">{HERO.eyebrow}</span><span className="fx-pill">{stand}</span></div>
            <h1 className="fx-h1">{HERO.h1}</h1>
            <p className="fx-lead">{HERO.lead}</p>
          </div>
          <aside className="fx-sheet" aria-label={HERO.sheetHead}>
            <div className="fx-sheet-head">{HERO.sheetHead}</div>
            <dl className="fx-dl">
              {HERO.sheet.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
            </dl>
          </aside>
        </div>

        {/* ── 01 Das Problem ───────────────────────────────────── */}
        <Section id="problem">
          <Head id="problem" num={S.s1.num} kicker={S.s1.kicker} h2={S.s1.h2} intro={S.s1.intro} />
          <div className="fx-row">
            <div className="fx-card fx-s1-fig"><TerrainFigure /></div>
            <ul className="fx-list">
              {S.s1.items.map(([t, p]) => <li key={t}><h3>{t}</h3><p>{p}</p></li>)}
            </ul>
          </div>
        </Section>

        {/* ── 02 Der Rechenweg ─────────────────────────────────── */}
        <Section id="rechenweg">
          <Head id="rechenweg" num={S.s2.num} kicker={S.s2.kicker} h2={S.s2.h2} intro={S.s2.intro} />
          <div className="fx-strip-head" aria-hidden="true"><span>{S.s2.stripHead}</span><span>{S.s2.stripHint}</span></div>
          <div className="fx-steps" tabIndex={0} role="group" aria-label={S.s2.stripAria}>
            {S.s2.steps.map(([n, kick, title, text], i) => (
              <article key={n} className="fx-step">
                <div className="fx-step-top"><span className="fx-num">{n}</span><span className="fx-kicker">{kick}</span><span className="fx-step-count" aria-hidden="true">{n} / 05</span></div>
                <StepPanel step={(i + 1) as StepNo} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <div className="fx-fig-legend">
            <div className="fx-legend-head">{S.s2.legendHead}</div>
            <p className="fx-legend-sub">{S.s2.legendSub}</p>
            <ul className="fx-legend">
              {S.s2.legend.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
        </Section>

        {/* ── 03 Die Quellen ───────────────────────────────────── */}
        <Section id="quellen">
          <Head id="quellen" num={S.s3.num} kicker={S.s3.kicker} h2={S.s3.h2} intro={S.s3.intro} />
          <div className="fx-card fx-src">
            <ul className="fx-src-rows">
              {SOURCES.map((s) => {
                return (
                  <li key={s.title} className="fx-src-row">
                    <div className="fx-src-label">
                      <div className="fx-src-title"><b>{s.title}</b><span className="fx-src-range">{s.range}</span></div>
                      <div className="fx-src-source">{s.source}</div>
                    </div>
                    <div className="fx-track" aria-hidden="true">
                      {(s.steps ?? [[s.from, s.to, 1] as const]).map(([a, b, o]) => (
                        <i key={a} className="fx-bar" style={{ left: `${pos(a)}%`, width: `${pos(b) - pos(a)}%`, background: s.color, opacity: s.steps ? o : 1 }} />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="fx-src-axis" aria-hidden="true">
              <div className="fx-src-label fx-src-axis-cap">{S.s3.axisCaption}</div>
              <div className="fx-ticks">
                {SOURCE_TICKS.map(([h, label, hide]) => (
                  <span key={label} className={`fx-tick${hide ? ' fx-tick-opt' : ''}${h === 0 ? ' fx-tick-first' : ''}${h === 336 ? ' fx-tick-last' : ''}`} style={{ left: `${pos(h)}%` }}>{label}</span>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ── 04 Das Ergebnis ──────────────────────────────────── */}
        <Section id="ergebnis">
          <Head id="ergebnis" num={S.s4.num} kicker={S.s4.kicker} h2={S.s4.h2} intro={S.s4.intro} />
          <div className="fx-row">
            <div className="fx-card fx-s4-fig"><OutputFigure /></div>
            <div className="fx-s4-side">
              <ol className="fx-olist">
                {S.s4.items.map(([t, p], i) => <li key={t}><span className="fx-badge fx-badge-inline" aria-hidden="true">{i + 1}</span><div><h3>{t}</h3><p>{p}</p></div></li>)}
              </ol>
              <div className="fx-readout">
                <div className="fx-readout-head"><span>{S.s4.readHead}</span><span>{S.s4.readTag}</span></div>
                <div className="fx-readout-when">{S.s4.readWhen}</div>
                <div className="fx-readout-value">{minus(r.value)} °C</div>
                <div className="fx-readout-span">Spanne {minus(r.lo)} bis {minus(r.hi)} °C</div>
                <span className="fx-readout-chip">{S.s4.readChip}</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ── 05 Nachgemessen ──────────────────────────────────── */}
        <Section id="nachgemessen">
          <Head id="nachgemessen" num={S.s5.num} kicker={S.s5.kicker} h2={S.s5.h2} />
          <div className="fx-cards3">
            {PROOF_CARDS.map(([t, p], i) => (
              <article key={t} className="fx-card fx-proof">
                <span className="fx-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="#5F7A4C" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {i === 0 && <><rect x="4.5" y="9" width="11" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></>}
                    {i === 1 && <><circle cx="10" cy="10" r="7" /><path d="M6.5 10.2l2.4 2.4 4.6-5" /></>}
                    {i === 2 && <><path d="M4 16V9M10 16V4M16 16v-5" /></>}
                  </svg>
                </span>
                <h3>{t}</h3>
                <p>{p.replace('{stand}', stand)}</p>
              </article>
            ))}
          </div>
          <div className="fx-stands">
            <div className="fx-stands-head"><span>{S.s5.stripHead}</span><span>{S.s5.stripSub}</span></div>
            <ol className="fx-stands-grid">
              {stands.map((s) => (
                <li key={s.n} className={`fx-stand${s.n === FUSION_CURRENT ? ' is-current' : ''}`} aria-current={s.n === FUSION_CURRENT ? 'true' : undefined}>
                  <span className="fx-stand-n">{s.n}</span>
                  <span className="fx-stand-date">{s.date}</span>
                  <span className="fx-stand-label">{s.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        {/* ── 06 Grenzen ───────────────────────────────────────── */}
        <Section id="grenzen">
          <Head id="grenzen" num={S.s6.num} kicker={S.s6.kicker} h2={S.s6.h2} />
          <div className="fx-cards4">
            {S.s6.items.map(([t, p]) => <article key={t} className="fx-limit"><h3>{t}</h3><p>{p}</p></article>)}
          </div>
        </Section>

        {/* ── 07 Fragen ────────────────────────────────────────── */}
        <Section id="fragen">
          <Head id="fragen" num={S.s7.num} kicker={S.s7.kicker} h2={S.s7.h2} />
          <div className="fx-faq">
            {S.s7.items.map(([q, a], i) => (
              <details key={q} className="fx-q" open={i === 0}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* ── Schluss ──────────────────────────────────────────── */}
        <div className="fx-closing">
          <div>
            <div className="fx-closing-title">{CLOSING.title}</div>
            <p className="fx-closing-sub">{CLOSING.sub}</p>
          </div>
          <a className="fx-closing-link" href="/" onClick={(e) => { e.preventDefault(); onBack(); }}>{CLOSING.link}</a>
        </div>
        <p className="fx-footer">{FOOTER}</p>
      </main>
    </div>
  );
}
