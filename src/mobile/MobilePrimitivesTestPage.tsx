import { useState } from 'react';
import { BottomSheet, type BottomSheetSnap } from './BottomSheet';
import { MobileToolbar, MobileToolbarButton } from './MobileToolbar';
import { useIsMobile } from './useIsMobile';
import './safeArea.css';

/**
 * Phase 0 scaffold test route for the shared mobile primitives (BottomSheet, MobileToolbar,
 * safe-area, useIsMobile). Reachable only via the `#mobiletest` permalink — not linked from
 * the app UI, so it never touches production layout. Deleted once Phase 1 adopts these
 * primitives directly in MapView.
 */
export default function MobilePrimitivesTestPage({ onBack }: { onBack: () => void }) {
  const [snap, setSnap] = useState<BottomSheetSnap>('half');
  const [layerOn, setLayerOn] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--sand-100)' }}>
      <div className="safe-pad-top" style={{ padding: '1rem' }}>
        <button type="button" onClick={onBack}>
          ← zurück
        </button>
        <p style={{ fontFamily: 'var(--font-base)', color: 'var(--ink-900)' }}>
          Mobile-Primitives-Testroute · useIsMobile(): {String(isMobile)}
        </p>
      </div>

      <MobileToolbar>
        <MobileToolbarButton label="Layer umschalten" active={layerOn} onClick={() => setLayerOn((v) => !v)}>
          ▤
        </MobileToolbarButton>
        <MobileToolbarButton label="Standort" onClick={() => {}}>
          ◎
        </MobileToolbarButton>
      </MobileToolbar>

      <BottomSheet snap={snap} onSnapChange={setSnap} header={<strong>Testsheet ({snap})</strong>}>
        <p>Ziehe an der Griffleiste, um zwischen collapsed / half / full zu wechseln.</p>
        {Array.from({ length: 20 }, (_, i) => (
          <p key={i}>Scroll-Testzeile {i + 1}</p>
        ))}
      </BottomSheet>
    </div>
  );
}
