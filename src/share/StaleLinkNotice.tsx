/**
 * V-SH-2 / V-SH-13 — der Hinweis auf der **Empfängerseite**.
 *
 * Zwei Gründe, warum der Empfänger etwas anderes sieht als der Absender:
 *  · `past`    — der geteilte Zeitpunkt ist vorbei (V-SH-2);
 *  · `horizon` — er liegt jenseits dessen, was die Ansicht hier tragen kann,
 *                die Karte hat auf das Ende gekürzt und sagt es (V-SH-13).
 *
 * Der Horizont-Fall nennt bewusst **keine** Ersatzzeit. Der erste Entwurf tat
 * es („Angezeigt wird Do. 10.09. 14:20") — und lag daneben: das war die
 * SCHIEBER-Stunde, während das Deck daneben ehrlich „Stand · Do 02:00" zeigte,
 * weil der Windlayer nur so weit reicht. Zwei Zeiten nebeneinander, von denen
 * eine falsch ist, sind schlechter als eine Aussage ohne Zahl; die genaue Zeit
 * steht ohnehin im Zeit-Deck.
 *
 * ── Der Defekt ──────────────────────────────────────────────────────────────
 * Ein geteilter Link trägt einen absoluten Zeitpunkt (`t=2026-09-12T15:00Z`).
 * Öffnet ihn jemand am nächsten Tag, klemmt jede Seite auf „jetzt" bzw. „heute"
 * — richtig gerechnet, aber **stumm**. Absender und Empfänger sahen
 * Verschiedenes, ohne dass es irgendwo stand. Das Sheet des Absenders warnte
 * seit SH2; die Seite des Empfängers sagte nichts.
 *
 * Jans Vorgabe zu Teil 1 nennt genau das: „eine definierte Rückfallstrategie,
 * wenn der geteilte Modelllauf nicht mehr existiert — nächstliegender
 * verfügbarer Lauf plus ein dezenter UI-Hinweis".
 *
 * ── Warum er von selbst verschwindet ────────────────────────────────────────
 * Nach zwölf Sekunden geht er weg (oder sofort per Kreuz). Das ist keine
 * Bequemlichkeit, sondern der Kern der Sache: sobald der Empfänger die Zeit
 * selbst verstellt, wäre die Aussage „angezeigt wird die aktuelle Lage"
 * **falsch** — und ein falscher Hinweis ist schlimmer als keiner. Ein
 * Zustandsanzeiger, der zur Lüge werden kann, gehört nicht dauerhaft ins Bild;
 * die Sekunden nach dem Ankommen sind genau die, in denen jemand sich fragt,
 * warum er etwas anderes sieht als versprochen.
 *
 * ── Zwei Lehren aus SH2, die hier wieder gelten ─────────────────────────────
 *  1. **Portal an den Body.** Die Decks setzen in ihren Leisten eigene
 *     Layout-Regeln (`display: flex` auf den direkten Kindern); ein `position:
 *     fixed` nimmt aus dem Fluss, aber nicht aus der Vererbung. Das Sheet wurde
 *     daran einmal zerlegt.
 *  2. **Einmal fassen, nicht mitlaufen.** Die Seiten-Wrapper schreiben die URL
 *     beim Ankommen um; `wantedAtMs` ist danach weg. Der Hinweis merkt sich den
 *     Zeitpunkt deshalb im ersten Render und liest ihn nie wieder aus der URL.
 *     Beim Horizont-Fall kommt der Zeitpunkt dagegen NACH dem ersten Render
 *     (die Karte merkt die Kürzung erst, wenn ihre Zeitbasis steht) — dafür
 *     nimmt der Hinweis eine Änderung von `at` einmal an, danach nie wieder.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDay, formatWhen } from './shareText';
import './share.css';

/** Wie lange der Hinweis steht, bevor er sich selbst zurücknimmt. */
export const STALE_NOTICE_MS = 12_000;

export interface StaleLinkNoticeProps {
  /**
   * Der geteilte Zeitpunkt in ms — `null`/`undefined` heißt: der Link war
   * aktuell, es gibt nichts zu sagen. Wird EINMAL gelesen.
   */
  at: number | null | undefined;
  /** Trug der Link eine Uhrzeit oder nur einen Tag? (Waldbrand: Tagesachse.) */
  kind?: 'time' | 'day';
  /** Was jetzt stattdessen gilt — ein Halbsatz, der die Seite ehrlich beschreibt. */
  shows?: string;
  /** V-SH-12: auf dunkler Oberfläche (Globus) dieselbe Palette wie das Sheet. */
  tone?: 'light' | 'dark';
  /**
   * Warum der Empfänger etwas anderes sieht (V-SH-13). `past` ist der
   * Standard; bei `horizon` nennt der Hinweis, was stattdessen erreichbar war.
   */
  reason?: 'past' | 'horizon';
}

export default function StaleLinkNotice({
  at, kind = 'time', shows = 'die aktuelle Lage', tone = 'light', reason = 'past',
}: StaleLinkNoticeProps) {
  // Einmal fassen: der erste Zeitpunkt, der ÜBERHAUPT kommt, entscheidet —
  // beim Vergangenheitsfall ist das das erste Render, beim Horizont-Fall die
  // Meldung der Karte kurz danach. Danach ändert ihn nichts mehr (die Wrapper
  // schreiben die URL um, und ein späterer Slider-Zug ist keine Nachricht).
  const captured = useRef<number | null>(at ?? null);
  const [shown, setShown] = useState<number | null>(captured.current);
  useEffect(() => {
    if (captured.current != null || at == null) return;
    captured.current = at;
    setShown(at);
  }, [at]);

  const [dismissed, setDismissed] = useState(false);
  const open = shown != null && !dismissed;
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setDismissed(true), STALE_NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open || shown == null || typeof document === 'undefined') return null;

  const when = kind === 'day' ? formatDay(shown) : formatWhen(shown);
  if (!when) return null;

  return createPortal(
    <div className={`sh-stale${tone === 'dark' ? ' sh-stale--dark' : ''}`} role="status" aria-live="polite">
      <span className="sh-stale-txt">
        <strong>{kind === 'day' ? 'Geteilter Tag' : 'Geteilter Zeitpunkt'}: {when}</strong>
        {reason === 'horizon'
          ? <> — so weit reicht diese Ansicht nicht. Angezeigt wird das Ende des Zeitfensters.</>
          : <> — vorbei. Angezeigt wird {shows}.</>}
      </span>
      <button type="button" className="sh-stale-x" onClick={() => setDismissed(true)} aria-label="Hinweis schließen">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
