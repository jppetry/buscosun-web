import './MobileToolbar.css';

interface MobileToolbarProps {
  /** Each child renders as one ≥44×44px floating control, stacked vertically with 8px gaps. */
  children: React.ReactNode;
}

/** Floating control stack (zoom, locate, north-up, ...) anchored bottom-right in the thumb zone. */
export function MobileToolbar({ children }: MobileToolbarProps) {
  return (
    <div className="mt-root safe-pad-bottom safe-pad-top" role="toolbar" aria-label="Kartensteuerung">
      {children}
    </div>
  );
}

interface MobileToolbarButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}

export function MobileToolbarButton({ label, onClick, active, children }: MobileToolbarButtonProps) {
  return (
    <button
      type="button"
      className="mt-button"
      aria-label={label}
      aria-pressed={active}
      data-active={active ? 'true' : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
