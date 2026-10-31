/**
 * Umschalter Dashboard | Karte (Phase DB, audit/dashboard.md §5.1).
 *
 * Form und Maße aus der Vorlage `reference/dashboard.dc.html` (Kopfzeile: weißer Kasten, Rand #D9D0B8, aktives Segment
 * Terracotta). Dieselbe Komponente sitzt im Dashboard-Kopf und — ohne eigene Vorlage, E-DB-2 — in der Karten-Topbar
 * direkt nach der Marke bzw. mobil in der Schwebeleiste. Sie hält keinen Zustand: die Ansicht steht in der URL
 * (`?ansicht=dashboard`), der Aufrufer schreibt sie.
 */
import './viewToggle.css';
import { IcoLayers } from '../map/deckIcons';

export type DashboardView = 'dashboard' | 'karte';

/**
 * Mobile (< 768 px): Dashboard | Karte als untere Leiste, Form wie die Bottom-Bar des Brandradars (`.br-bar`) und der
 * Kartenseite (`.mdk-bar`). Ersetzt den oberen Umschalter `variant="mobile"` im Dashboard; auf der Karte steht der
 * Eintrag „Dashboard" in `.mdk-bar` selbst. Auf Desktop/Tablet nicht sichtbar (viewToggle.css).
 */
export function ViewBar({ active, onSelect }: { active: DashboardView; onSelect: (v: DashboardView) => void }) {
  return (
    <nav className="vt-bar" aria-label="Ansicht">
      <button type="button" className={`vt-bar-btn${active === 'dashboard' ? ' is-active' : ''}`} aria-current={active === 'dashboard' ? 'page' : undefined} onClick={() => { if (active !== 'dashboard') onSelect('dashboard'); }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="3.5" width="7" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
          <rect x="13.5" y="3.5" width="7" height="5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
          <rect x="13.5" y="11.5" width="7" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
          <rect x="3.5" y="15.5" width="7" height="5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span>Dashboard</span>
      </button>
      <button type="button" className={`vt-bar-btn${active === 'karte' ? ' is-active' : ''}`} aria-current={active === 'karte' ? 'page' : undefined} onClick={() => { if (active !== 'karte') onSelect('karte'); }}>
        <IcoLayers size={22} />
        <span>Karte</span>
      </button>
    </nav>
  );
}

export default function ViewToggle({ active, onSelect, variant = 'bar', className }: {
  active: DashboardView;
  onSelect: (v: DashboardView) => void;
  /** `bar` = Kopfzeile Desktop/Tablet, `mobile` = volle Breite mit 44-px-Zielen (Vorlage Mobile). */
  variant?: 'bar' | 'mobile';
  className?: string;
}) {
  const item = (v: DashboardView, label: string) => (
    <button
      type="button"
      className={`vt-btn${active === v ? ' is-active' : ''}`}
      aria-pressed={active === v}
      onClick={() => { if (active !== v) onSelect(v); }}
    >
      {label}
    </button>
  );
  return (
    <div className={`vt-toggle vt-${variant}${className ? ` ${className}` : ''}`} role="group" aria-label="Ansicht">
      {item('dashboard', 'Dashboard')}
      {item('karte', 'Karte')}
    </div>
  );
}
