/**
 * Umschalter Dashboard | Karte (Phase DB, audit/dashboard.md §5.1).
 *
 * Form und Maße aus der Vorlage `reference/dashboard.dc.html` (Kopfzeile: weißer Kasten, Rand #D9D0B8, aktives Segment
 * Terracotta). Dieselbe Komponente sitzt im Dashboard-Kopf und — ohne eigene Vorlage, E-DB-2 — in der Karten-Topbar
 * direkt nach der Marke bzw. mobil in der Schwebeleiste. Sie hält keinen Zustand: die Ansicht steht in der URL
 * (`?ansicht=dashboard`), der Aufrufer schreibt sie.
 */
import './viewToggle.css';

export type DashboardView = 'dashboard' | 'karte';

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
