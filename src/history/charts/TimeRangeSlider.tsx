/**
 * Zeitraum-Slider (US-3.5): Dual-Handle-Bereichswähler über die verfügbaren
 * Jahre, direkt unter dem Chart. Spiegelt den aktuellen Bereich (bidirektional)
 * und grenzt ihn per Ziehen ein.
 */

import { useRef } from 'react';

interface Props { min: number; max: number; start: number; end: number; onChange: (start: number, end: number) => void }

export default function TimeRangeSlider({ min, max, start, end, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  if (max <= min) return null;
  const pct = (y: number) => ((y - min) / (max - min)) * 100;

  function yearAt(clientX: number): number {
    const el = trackRef.current; if (!el) return start;
    const r = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round(min + f * (max - min));
  }

  function drag(which: 'start' | 'end', e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => {
      const y = yearAt(ev.clientX);
      if (which === 'start') onChange(Math.min(y, end), end);
      else onChange(start, Math.max(y, start));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  return (
    <div className="hi-rangeslider">
      <span className="hi-range-end">{min}</span>
      <div className="hi-range-track" ref={trackRef}>
        <div className="hi-range-fill" style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }} />
        <button type="button" className="hi-range-handle" style={{ left: `${pct(start)}%` }} onPointerDown={(e) => drag('start', e)}
          role="slider" aria-label="Startjahr" aria-valuemin={min} aria-valuemax={end} aria-valuenow={start}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') onChange(Math.max(min, start - 1), end); if (e.key === 'ArrowRight') onChange(Math.min(end, start + 1), end); }}>
          <span className="hi-range-bubble">{start}</span>
        </button>
        <button type="button" className="hi-range-handle" style={{ left: `${pct(end)}%` }} onPointerDown={(e) => drag('end', e)}
          role="slider" aria-label="Endjahr" aria-valuemin={start} aria-valuemax={max} aria-valuenow={end}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') onChange(start, Math.max(start, end - 1)); if (e.key === 'ArrowRight') onChange(start, Math.min(max, end + 1)); }}>
          <span className="hi-range-bubble">{end}</span>
        </button>
      </div>
      <span className="hi-range-end">{max}</span>
    </div>
  );
}
