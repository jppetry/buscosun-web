/**
 * Teilen · das Sheet (Phase SH2) — Popover auf dem Desktop, Bottom-Sheet mobil.
 *
 * Inhalt in dieser Reihenfolge, weil sie der Frage des Nutzers folgt
 * („Was verschicke ich? — Wohin?"):
 *   1. Titel und Beschreibung, wie sie beim Empfänger ankommen;
 *   2. **die vollständige URL** — sie ist der Vertrauensanker (Jans Vorgabe),
 *      gekürzt wird erst ab 90 Zeichen und dann mittig, nie am Ende;
 *   3. offene Hinweise (alter Zeitpunkt, unauflösbarer Ort, zu langer Link);
 *   4. die Kanäle.
 *
 * Barrierefreiheit: `role="dialog"` mit `aria-modal`, Fokus beim Öffnen auf das
 * erste Ziel, Tab-Falle innerhalb des Sheets, `Escape` schließt und gibt den
 * Fokus an den Auslöser zurück (das erledigt `ShareButton`), Klick daneben
 * schließt ebenfalls. Alle Ziele sind echte `<a>`/`<button>` mit ≥ 44 px.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../mobile/useIsMobile';
import { shareTargets, copyText, type ShareTarget } from './shareTargets';
import { previewUrl, type ShareSnapshot } from './shareOpen';
import './share.css';

interface Props {
  snapshot: ShareSnapshot;
  /** Rechteck des Auslösers — nur für die Desktop-Positionierung. */
  anchor: DOMRect | null;
  onClose: () => void;
  /**
   * V-SH-12: `dark` tauscht die Palette (`.sh-sheet--dark`) — eine
   * Variablenschicht in `share.css`, keine zweite Optik. Gebraucht nur vom
   * Globus, der einzigen dunklen Oberfläche im Repo.
   */
  tone?: 'light' | 'dark';
}

const FOCUSABLE = 'a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])';

function IconFor({ channel }: { channel: ShareTarget['channel'] }) {
  const p = { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (channel === 'whatsapp') {
    return (<svg {...p}><path d="M3.2 16.8 4.3 13a7 7 0 1 1 2.7 2.7l-3.8 1.1Z" /><path d="M7.6 7.6c.2 1.6 1.3 3.4 3.2 4.3.6.3 1.1.2 1.4-.2l.5-.7 1.6.9-.4 1c-.3.6-1 .9-1.8.7-2.9-.6-5.2-3-5.7-5.9-.1-.7.2-1.4.8-1.6l1-.4.8 1.6-.7.5c-.4.3-.5.6-.4.9Z" /></svg>);
  }
  if (channel === 'gmail' || channel === 'mail') {
    return (<svg {...p}><rect x="2.5" y="4.5" width="15" height="11" rx="1.6" /><path d="m2.9 5.4 7.1 5.1 7.1-5.1" /></svg>);
  }
  return (<svg {...p}><rect x="7" y="7" width="9.5" height="9.5" rx="1.8" /><path d="M13 4.5H4.5a1 1 0 0 0-1 1V13" /></svg>);
}

export default function ShareSheet({ snapshot, anchor, onClose, tone = 'light' }: Props) {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const targets = useMemo(
    () => shareTargets({ url: snapshot.url, title: snapshot.copy.title, description: snapshot.copy.description, message: snapshot.message }, isMobile),
    [snapshot, isMobile],
  );

  // Fokus hinein, Escape hinaus, Tab bleibt drin.
  useEffect(() => {
    // Fokus auf das ERSTE ZIEL, nicht auf „Schließen": wer das Sheet öffnet,
    // will teilen — ein Enter darf nicht ausgerechnet wieder zumachen.
    const first = ref.current?.querySelector<HTMLElement>('.sh-target') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const onCopy = useCallback(async () => {
    const ok = await copyText(snapshot.url);
    setCopied(ok ? 'ok' : 'fail');
    window.setTimeout(() => setCopied('idle'), 2200);
  }, [snapshot.url]);

  // Desktop: unter dem Auslöser, am rechten Rand ausgerichtet und im Bild gehalten.
  const style = !isMobile && anchor
    ? {
      top: Math.round(Math.min(anchor.bottom + 8, window.innerHeight - 120)),
      right: Math.round(Math.max(12, window.innerWidth - anchor.right)),
    }
    : undefined;

  const preview = previewUrl(snapshot.url);
  /*
   * Hinweise nur, wenn sie hier auch auftreten KÖNNEN.
   *
   * `timePast` kann: eine Seite, die lange offen liegt, ohne dass jemand die
   * Karte bewegt, trägt irgendwann ein `t` aus der Vergangenheit — geteilt
   * würde dann „jetzt", und das muss dastehen, bevor jemand auf Senden drückt.
   *
   * `placeUnresolved` kann hier NICHT: die Seiten-Wrapper schreiben einen
   * unauflösbaren Ort-Slug schon beim Ankommen per `replace` aus der URL
   * (am Preview nachgeprüft). Das Feld bleibt am Schnappschuss — die OG-Meta
   * der Edge Function (SH6) liest dieselbe URL OHNE diese Bereinigung —, aber
   * eine Meldung, die nie erscheinen kann, gehört nicht ins Sheet.
   */
  const notes: string[] = [];
  if (snapshot.timePast) notes.push('Der Zeitpunkt dieses Links liegt in der Vergangenheit — geteilt wird die Ansicht für „jetzt".');
  if (snapshot.verdict === 'too-long') notes.push('Dieser Link ist sehr lang und wird in manchen Messengern abgeschnitten. Weniger Layer oder kein Ausschnitt machen ihn kürzer.');
  else if (snapshot.verdict === 'long') notes.push('Dieser Link ist länger als üblich — er funktioniert, sieht in der Vorschau aber gedrängt aus.');

  /*
   * Portal an den Body — und zwar nicht aus Bequemlichkeit:
   *
   * Der Knopf sitzt in der Deck-Leiste, und die Decks setzen dort eigene
   * Layout-Regeln. `.mdk-m-topfloat > div { display: flex }` (Karte, mobil) hat
   * das Sheet beim ersten Versuch in eine Zeile zerlegt — Titel, URL und Ziele
   * nebeneinander, jedes Ziel 134 x 153 px. Ein `position: fixed` schützt davor
   * nicht: es nimmt das Element aus dem Fluss, aber nicht aus der Vererbung.
   * Dazu kommt die zweite Falle: ein Vorfahr mit `transform` oder `filter`
   * macht `fixed` relativ zu SICH — dann klebte das Sheet an der Leiste statt
   * am Fenster. Am Body kann beides nicht passieren.
   */
  return createPortal(
    <>
      <div className="sh-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={`sh-sheet${isMobile ? ' sh-sheet--mobile' : ''}${tone === 'dark' ? ' sh-sheet--dark' : ''}`}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label="Diese Ansicht teilen"
      >
        <div className="sh-head">
          <span className="sh-eyebrow">Teilen</span>
          <button type="button" className="sh-close" onClick={onClose} aria-label="Schließen">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        <p className="sh-title">{snapshot.copy.title}</p>
        <p className="sh-desc">{snapshot.copy.description}</p>

        <div className="sh-urlrow">
          <code className="sh-url" title={snapshot.url}>{preview}</code>
        </div>

        {notes.map((n) => (<p className="sh-note" key={n}>{n}</p>))}

        <div className="sh-targets">
          {targets.map((t) => (t.href
            ? (
              <a
                key={t.channel}
                className="sh-target"
                href={t.href}
                target={t.sameTab ? undefined : '_blank'}
                rel={t.sameTab ? undefined : 'noopener noreferrer'}
                onClick={() => window.setTimeout(onClose, 120)}
              >
                <IconFor channel={t.channel} /><span>{t.label}</span>
              </a>
            )
            : (
              <button key={t.channel} type="button" className="sh-target" onClick={() => { void onCopy(); }}>
                <IconFor channel={t.channel} />
                <span>{copied === 'ok' ? 'Link kopiert' : copied === 'fail' ? 'Kopieren ging nicht' : t.label}</span>
              </button>
            )
          ))}
        </div>

        <p className="sh-foot">Der Link trägt den ganzen Zustand — kein Konto, kein Tracker, keine Kennung des Empfängers.</p>
        <span className="sh-live" role="status" aria-live="polite">
          {copied === 'ok' ? 'Link in die Zwischenablage kopiert.' : copied === 'fail' ? 'Kopieren nicht möglich — Link von Hand markieren.' : ''}
        </span>
      </div>
    </>,
    document.body,
  );
}
