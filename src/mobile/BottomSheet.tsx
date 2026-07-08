import { useRef, useState } from 'react';
import './BottomSheet.css';

export type BottomSheetSnap = 'collapsed' | 'half' | 'full';

const SNAP_VH: Record<BottomSheetSnap, number> = { collapsed: 0, half: 45, full: 90 };
/** Height of the always-visible handle bar when collapsed, in px. */
const COLLAPSED_PX = 64;

function nearestSnap(vh: number): BottomSheetSnap {
  let nearest: BottomSheetSnap = 'collapsed';
  let best = Infinity;
  (Object.keys(SNAP_VH) as BottomSheetSnap[]).forEach((key) => {
    const d = Math.abs(SNAP_VH[key] - vh);
    if (d < best) {
      best = d;
      nearest = key;
    }
  });
  return nearest;
}

interface BottomSheetProps {
  snap: BottomSheetSnap;
  onSnapChange: (snap: BottomSheetSnap) => void;
  /** Rendered in the drag handle row, e.g. a title. Tapping/dragging here moves the sheet. */
  header?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Snapping bottom sheet (collapsed ~64px / half ~45vh / full ~90vh) for map-heavy mobile
 * features. Drag is confined to the handle/header so scrolling the sheet body never fights
 * the map underneath — content scroll and sheet drag are mutually exclusive gestures.
 */
export function BottomSheet({ snap, onSnapChange, header, children }: BottomSheetProps) {
  const [dragOffsetVh, setDragOffsetVh] = useState(0);
  const dragState = useRef<{ startY: number; startVh: number } | null>(null);

  const targetVh = SNAP_VH[snap];
  const liveVh = Math.min(96, Math.max(0, targetVh + dragOffsetVh));

  const startDrag = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startVh = targetVh;
    dragState.current = { startY, startVh };

    const onMove = (ev: PointerEvent) => {
      const deltaVh = ((startY - ev.clientY) / window.innerHeight) * 100;
      setDragOffsetVh(deltaVh);
    };
    const onUp = (ev: PointerEvent) => {
      const deltaVh = ((startY - ev.clientY) / window.innerHeight) * 100;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      dragState.current = null;
      setDragOffsetVh(0);
      onSnapChange(nearestSnap(startVh + deltaVh));
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className="bs-root"
      style={{ height: `${liveVh}vh`, minHeight: COLLAPSED_PX }}
      role="dialog"
      aria-label="Steuerung"
    >
      <div className="bs-handle-row safe-pad-bottom" onPointerDown={startDrag}>
        <div className="bs-handle" aria-hidden="true" />
        {header}
      </div>
      <div className="bs-content">{children}</div>
    </div>
  );
}
