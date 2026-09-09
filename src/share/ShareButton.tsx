/**
 * Teilen · der Knopf (Phase SH2).
 *
 * Bewusst winzig und **ohne jeden schweren Import**: Adapter, Ortstabelle,
 * Kanäle und das Sheet kommen erst beim ersten Klick (dynamischer Import).
 * Der Erstbild-Pfad der Karte (LZ1: Klick → Bild ≈ 200 ms) bleibt unberührt —
 * solange niemand teilt, kostet dieses Bauteil nur den Knopf selbst.
 *
 * Auf Mobilgeräten mit `navigator.share` öffnet der Klick das **native**
 * Teilen-Blatt; das eigene Menü ist der Rückfall (Jans Vorgabe). Bricht der
 * Nutzer das native Blatt ab, erscheint KEIN zweites Fenster — ein Abbruch ist
 * eine Entscheidung, keine Fehlfunktion.
 *
 * Die Optik erbt der Knopf vom jeweiligen Deck: die Grundform steht in
 * `share.css` (`.sh-btn`), die Einpassung kommt als `className` von außen —
 * dasselbe Muster wie `FeatureRail` (`navClass`/`btnClass`).
 *
 * V-SH-12: `tone="dark"` gibt das an das Sheet weiter. Nötig für genau eine
 * Seite — den Globus, die einzige dunkle Oberfläche im Repo.
 */
import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import type { ShareSnapshot } from './shareOpen';
import './share.css';

const ShareSheet = lazy(() => import('./ShareSheet'));

export interface ShareButtonProps {
  /** Zusätzliche Klasse für die Einpassung ins Deck (Abstände, Farbe). */
  className?: string;
  /** Beschriftung für Screenreader und Tooltip. */
  label?: string;
  /** Sichtbarer Text neben dem Symbol (Mobil-Leisten haben ihn, Topbars nicht). */
  text?: string;
  /** Kleinere Variante für gedrängte Leisten. */
  compact?: boolean;
  /**
   * Auf welcher Art Oberfläche sitzt der Knopf (V-SH-12)? Der Ton wird an das
   * Sheet weitergegeben; `light` ist überall richtig außer auf dem Globus.
   */
  tone?: 'light' | 'dark';
}

function IconShare({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="15" cy="4.5" r="2.2" /><circle cx="5" cy="10" r="2.2" /><circle cx="15" cy="15.5" r="2.2" />
      <line x1="6.95" y1="8.95" x2="13.05" y2="5.55" /><line x1="6.95" y1="11.05" x2="13.05" y2="14.45" />
    </svg>
  );
}

export default function ShareButton({ className, label = 'Diese Ansicht teilen', text, compact, tone = 'light' }: ShareButtonProps) {
  const [snap, setSnap] = useState<ShareSnapshot | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setSnap(null);
    // Fokus zurück auf den Auslöser — sonst landet er am Seitenanfang.
    btnRef.current?.focus();
  }, []);

  const onClick = useCallback(async () => {
    if (snap) { close(); return; }
    if (busy) return;

    // `busy` deckt NUR den Nachladevorgang ab — nicht das Warten auf das native
    // Teilen-Blatt. Dessen Zusage kann hängen bleiben (in manchen Umgebungen
    // löst sie nie auf, hier am emulierten Gerät beobachtet); läge der Knopf
    // dann noch auf „beschäftigt", wäre er für den Rest der Sitzung tot.
    setBusy(true);
    let mod: typeof import('./shareOpen');
    try {
      mod = await import('./shareOpen');
    } catch {
      return;                                      // Nachladen gescheitert: Seite bleibt heil
    } finally {
      setBusy(false);
    }

    const s = mod.shareSnapshot();
    if (!s) return;                                // Seite (noch) nicht teilbar
    if (mod.canNativeShare() && window.matchMedia('(max-width: 767px)').matches) {
      const r = await mod.tryNativeShare(s);
      if (r === 'shared' || r === 'cancelled') return;
    }
    setAnchor(btnRef.current?.getBoundingClientRect() ?? null);
    setSnap(s);
  }, [snap, busy, close]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`sh-btn${compact ? ' sh-btn--compact' : ''}${text ? ' sh-btn--text' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => { void onClick(); }}
        aria-haspopup="dialog"
        aria-expanded={!!snap}
        aria-label={text ? undefined : label}
        title={label}
        data-busy={busy || undefined}
      >
        <IconShare size={compact ? 15 : 17} />
        {text ? <span>{text}</span> : null}
      </button>
      {snap && (
        <Suspense fallback={null}>
          <ShareSheet snapshot={snap} anchor={anchor} onClose={close} tone={tone} />
        </Suspense>
      )}
    </>
  );
}
