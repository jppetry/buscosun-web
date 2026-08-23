/**
 * Barrierefreiheit beim Routenwechsel: Screenreader bekommen den neuen Titel
 * über eine `aria-live`-Region angesagt, der Fokus springt auf die erste
 * Überschrift der neuen Seite (tabIndex −1, damit sie fokussierbar ist, ohne in
 * der Tab-Reihenfolge zu stehen). Beim ersten Render passiert nichts — der
 * Einstieg soll sich wie ein normaler Seitenaufruf anfühlen.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { titleFor } from './RouteMeta';

const SR_ONLY: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

export default function RouteAnnouncer() {
  const { pathname } = useLocation();
  const [text, setText] = useState('');
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    setText(titleFor(pathname));
    // Nach dem Paint der neuen Route: Fokus auf H1. Die Karten-Decks haben keine
    // H1 (Eyebrow/Title-Spans) — dann auf <main> bzw. den Wurzelknoten, damit der
    // Fokus nicht im Body verbleibt. Lazy-Chunks brauchen ggf. ~1 s, daher bis 90 Frames.
    let tries = 0;
    let raf = 0;
    const focus = () => {
      const h1 = document.querySelector<HTMLElement>('main h1, h1');
      const target = h1 ?? (tries >= 60 ? (document.querySelector<HTMLElement>('main') ?? document.getElementById('root')) : null);
      if (target) {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        return;
      }
      if (++tries < 90) raf = requestAnimationFrame(focus);
    };
    raf = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(raf);
  }, [pathname]);
  return <div aria-live="polite" aria-atomic="true" style={SR_ONLY}>{text}</div>;
}
