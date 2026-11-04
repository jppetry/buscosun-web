/**
 * Command-Deck-Shell für den Routenplaner (Topbar + Ink-Rail + Content bzw.
 * Mobile-Header + Scroll). Verbindliche Vorlage: references/routenplaner.dc.html.
 * Wird von allen Route-Screens (Upload, Vorschau, Bewegungsart, Konfiguration,
 * Ergebnis) geteilt, damit die Shell exakt identisch ist.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { FeatureRail, type RailFeature } from '../nav/featureRail';

export type { RailFeature };

/** Die vier Schritte des Routenplaners, 0-basiert: `step` der Shell zeigt den laufenden. */
const ROUTE_STEPS = ['Strecke', 'Bewegungsart', 'Planung', 'Ergebnis'] as const;

function RouteStepper({ step }: { step: number }) {
  return (
    <ol className="rd-steps" aria-label="Fortschritt">
      {ROUTE_STEPS.map((label, i) => (
        <li key={label} className={`rd-step${i < step ? ' is-done' : ''}${i === step ? ' is-now' : ''}`} aria-current={i === step ? 'step' : undefined}>
          <i aria-hidden="true">{i < step ? '✓' : i + 1}</i><span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

export interface DeckBarItem { id: string; label: string; icon: ReactNode }

/** Bottom-Bar des mobilen Ergebnisses: springt zu den Abschnitten der Seite und zeigt, wo man gerade liest. */
export function DeckSectionBar({ items }: { items: readonly DeckBarItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '');
  const idsKey = items.map((it) => it.id).join('|');
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) setActive(e.target.id); },
      { root: document.querySelector('.rd-m-scroll'), rootMargin: '-15% 0px -75% 0px' },
    );
    for (const id of idsKey.split('|')) { const el = document.getElementById(id); if (el) obs.observe(el); }
    return () => obs.disconnect();
  }, [idsKey]);
  const go = (id: string) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
  };
  return (
    <nav className="rd-m-bar" aria-label="Abschnitte des Ergebnisses">
      {items.map((it) => (
        <button key={it.id} type="button" className={`rd-m-bar-btn${active === it.id ? ' is-active' : ''}`} aria-current={active === it.id ? 'true' : undefined} onClick={() => go(it.id)}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{it.icon}</svg>
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ============================ Rail-/Deck-Icons (SVG-Pfade aus der Vorlage) ============================ */
export function IconRailMap({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 L21 8 L12 13 L3 8 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 13 L12 18 L21 13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
export function IconRailRadar({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3 A9 9 0 0 1 21 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
export function IconRailTour({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 20 C6 20 5 13.5 9 11.5 C13 9.5 12 6.5 16 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6" cy="20" r="1.8" fill="currentColor" />
      <path d="M16 2.5 C14 2.5 12.4 4.1 12.4 6.1 C12.4 8.8 16 11.5 16 11.5 C16 11.5 19.6 8.8 19.6 6.1 C19.6 4.1 18 2.5 16 2.5 Z" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="16" cy="6.1" r="1.3" fill="currentColor" />
    </svg>
  );
}
export function IconRailGear({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.2 5.2 L7 7 M17 17 L18.8 18.8 M18.8 5.2 L17 7 M7 17 L5.2 18.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
export function IconChevLeft({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12 H5 M11 6 L5 12 L11 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Wordmark-Marke (public/buscosun-mark.svg), blendet sich bei Fehler aus. */
function Mark({ className }: { className?: string }) {
  return (
    <img
      className={className}
      src="/buscosun-mark.svg"
      width={26}
      height={26}
      alt=""
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

interface ShellProps {
  isMobile: boolean;
  /** Marke → zurück in die App. */
  onHome: () => void;
  /** Rail: direkt in ein anderes Werkzeug springen. Fehlt der Handler,
      führen die Rail-Knöpfe wie bisher zur Startseite zurück. */
  onOpenFeature?: (id: RailFeature) => void;
  /** Topbar-Mitte (nach dem Trenner): Zurück-Link + Kontext-Text. */
  crumb?: ReactNode;
  /** Topbar rechts (DATEN LIVE / Avatar). */
  right?: ReactNode;
  /** Mobile-Header-Inhalt (Marke+Live ODER Zurück-Button + Eyebrow/Titel). */
  mobileHeader: ReactNode;
  /** Zusatzklasse für die Content-Fläche (z. B. rd-content--result). */
  contentClass?: string;
  /** Laufender Schritt (0–3): Stepper in der Topbar, schmale Leiste unter dem Mobile-Header. */
  step?: number;
  /** Bottom-Bar unter der Scroll-Fläche (nur mobil). */
  mobileBar?: ReactNode;
  children: ReactNode;
}

export default function RouteDeckShell({ isMobile, onHome, onOpenFeature, crumb, right, mobileHeader, contentClass, step, mobileBar, children }: ShellProps) {
  if (isMobile) {
    return (
      <div className="rd-m-root">
        <header className="rd-m-header">{mobileHeader}</header>
        {step != null && (
          <div className="rd-m-steps" role="img" aria-label={`Schritt ${step + 1} von ${ROUTE_STEPS.length}: ${ROUTE_STEPS[step]}`}>
            {ROUTE_STEPS.map((label, i) => <i key={label} className={i <= step ? 'is-on' : undefined} />)}
          </div>
        )}
        <div className="rd-m-scroll rd-scroll">{children}</div>
        {mobileBar}
      </div>
    );
  }
  return (
    <div className="rd-root">
      <header className="rd-topbar">
        <div className="rd-brandwrap">
          <Mark className="rd-mark" />
          <button type="button" className="rd-brand" onClick={onHome}>buscosun</button>
        </div>
        <div className="rd-topdivider" />
        {crumb}
        {step != null && <RouteStepper step={step} />}
        <div className="rd-topright">{right}</div>
      </header>
      <div className="rd-body">
        <FeatureRail
          active="route"
          onOpenFeature={onOpenFeature}
          onHome={onHome}
          navClass="rd-rail"
          btnClass="rd-rail-btn"
          activeClass="rd-rail-btn--active"
          spacerClass="rd-rail-spacer"
        />
        <div className={`rd-content rd-scroll${contentClass ? ` ${contentClass}` : ''}`}>{children}</div>
      </div>
    </div>
  );
}

/** DATEN-LIVE-Indikator für die Topbar-Rechte. */
export function DeckLive() {
  return (
    <div className="rd-live">
      <span className="rd-live-dot" />
      <span className="rd-live-txt">DATEN LIVE</span>
    </div>
  );
}
