/**
 * Teilen · Kanäle (Phase SH1, pur).
 *
 * WhatsApp, Gmail, ein beliebiger Mail-Client, Zwischenablage. Reiner URL-Bau —
 * das Anklicken macht die UI (SH2).
 *
 * ── Die Falle: Doppel-Encoding ───────────────────────────────────────────────
 * Aus einem lesbaren Link wird Prozentsalat, wenn man ihn zweimal kodiert. Die
 * Regel hier ist einfach: **`buildShareUrl` liefert eine fertige, RFC-korrekte
 * URL; die wird genau EINMAL für den Ziel-Parameter kodiert** und sonst nie
 * angefasst.
 *
 * Vorsicht bei der Prüfung: Ein `%25` im Ziel-Link ist **kein** Beweis für
 * doppeltes Kodieren. Enthält die geteilte URL selbst ein Prozentzeichen (etwa
 * `M%C3%BCnchen`), MUSS daraus im `text=`-Parameter `M%2525…` … nein: genau
 * einmal `%25C3%25BC` werden — der Empfänger dekodiert einmal und hat die
 * Original-URL zurück. Der belastbare Test ist deshalb der Rundlauf:
 * `new URL(ziel).searchParams.get('text') === nachricht`. Genau den führt
 * `verifyShareTargets()`.
 */

export type ShareChannel = 'whatsapp' | 'gmail' | 'mail' | 'copy';

export interface ShareTargetInput {
  /** Die fertige, bereits korrekt kodierte App-URL (mit Origin). */
  url: string;
  /** Betreffzeile (Mail) bzw. Titel. */
  title: string;
  /** Fließtext (Mail-Body); die URL wird angehängt. */
  description: string;
  /** Was in einer Chat-Nachricht steht (Titel + URL). */
  message: string;
}

export interface ShareTarget {
  channel: ShareChannel;
  label: string;
  /** `null` für „copy" — das erledigt die Clipboard-API, nicht ein Link. */
  href: string | null;
  /** Im selben Tab öffnen? `mailto:`/`whatsapp:` ja, Web-Ziele nein. */
  sameTab: boolean;
}

/**
 * Praxisgrenzen für `mailto:` — Windows-Shell rund 2 048 Zeichen, ältere
 * Outlook-Versionen rund 1 800, iOS/Android unkritisch. Unsere Nachrichten
 * liegen bei 120–250 Zeichen; darüber wird Mail ausgeblendet, statt einen Link
 * zu erzeugen, der beim Empfänger abgeschnitten ankommt.
 */
export const MAILTO_SAFE_MAX = 1800;

const enc = encodeURIComponent;

/** Ein Ziel bauen. `mobile` unterscheidet nur WhatsApp (App-Schema vs. wa.me). */
export function shareTarget(channel: ShareChannel, s: ShareTargetInput, mobile: boolean): ShareTarget {
  const body = `${s.description}\n\n${s.url}`;
  switch (channel) {
    case 'whatsapp':
      return {
        channel, label: 'WhatsApp', sameTab: mobile,
        href: mobile ? `whatsapp://send?text=${enc(s.message)}` : `https://wa.me/?text=${enc(s.message)}`,
      };
    case 'gmail':
      return {
        channel, label: 'Gmail', sameTab: false,
        href: `https://mail.google.com/mail/?view=cm&fs=1&su=${enc(s.title)}&body=${enc(body)}`,
      };
    case 'mail':
      return { channel, label: 'E-Mail', sameTab: true, href: `mailto:?subject=${enc(s.title)}&body=${enc(body)}` };
    case 'copy':
      return { channel, label: 'Link kopieren', sameTab: true, href: null };
  }
}

/** Welche Ziele angeboten werden — Mail fällt bei zu langer Nachricht weg. */
export function shareTargets(s: ShareTargetInput, mobile: boolean): ShareTarget[] {
  const all: ShareChannel[] = ['whatsapp', 'gmail', 'mail', 'copy'];
  return all
    .filter((c) => c !== 'mail' || (`mailto:?subject=${enc(s.title)}&body=${enc(`${s.description}\n\n${s.url}`)}`).length <= MAILTO_SAFE_MAX)
    .map((c) => shareTarget(c, s, mobile));
}

/**
 * Text in die Zwischenablage — mit Rückfall für unsichere Kontexte
 * (`navigator.clipboard` gibt es nur unter HTTPS/localhost). Löst V-SH-5: die
 * vier vorhandenen Kopier-Stellen im Repo haben jede ihren eigenen Code und
 * keine einzige einen Rückfall.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* weiter zum Rückfall */ }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface ShareTargetCheck { name: string; ok: boolean; detail?: string }

export function verifyShareTargets(): { checks: ShareTargetCheck[]; passed: number; failed: number } {
  const checks: ShareTargetCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Eine URL MIT Prozentzeichen — genau der Fall, an dem Doppel-Encoding auffliegt.
  const url = 'https://buscosun.com/wetterkarte/wind/feldberg-schwarzwald?ort=Feldberg%20(Schwarzwald)&t=2026-09-12T15:00Z';
  const s: ShareTargetInput = {
    url,
    title: 'Wetterkarte Feldberg — Wind (10 m), Fr 12.09. 15:00',
    description: 'Wind für Feldberg · Stand Fr 12.09. 15:00 · aus amtlichen Quellen.',
    message: 'Wetterkarte Feldberg — Wind (10 m), Fr 12.09. 15:00\n' + url,
  };

  const wa = shareTarget('whatsapp', s, false);
  add('WhatsApp Desktop nutzt wa.me', wa.href!.startsWith('https://wa.me/?text='));
  add('WhatsApp Mobil nutzt das App-Schema', shareTarget('whatsapp', s, true).href!.startsWith('whatsapp://send?text='));
  // DER Test: einmal dekodieren muss die Nachricht Zeichen für Zeichen zurückgeben.
  add('WhatsApp: genau EINMAL kodiert (Rundlauf über den Standard-Parser)',
    new URL(wa.href!).searchParams.get('text') === s.message,
    (new URL(wa.href!).searchParams.get('text') ?? '').slice(0, 60));
  add('WhatsApp Mobil: derselbe Rundlauf',
    decodeURIComponent(shareTarget('whatsapp', s, true).href!.slice('whatsapp://send?text='.length)) === s.message);

  const gm = new URL(shareTarget('gmail', s, false).href!);
  add('Gmail trägt Betreff und Text unverändert',
    gm.searchParams.get('su') === s.title && gm.searchParams.get('body') === `${s.description}\n\n${url}`);
  add('Gmail nutzt den Compose-Modus', gm.searchParams.get('view') === 'cm' && gm.searchParams.get('fs') === '1');

  const mailto = shareTarget('mail', s, false).href!;
  add('mailto trägt Betreff und Text unverändert',
    new URLSearchParams(mailto.slice(mailto.indexOf('?') + 1)).get('subject') === s.title
    && new URLSearchParams(mailto.slice(mailto.indexOf('?') + 1)).get('body') === `${s.description}\n\n${url}`);

  // Die URL selbst darf in KEINEM Ziel doppelt kodiert auftauchen.
  add('die geteilte URL überlebt jedes Ziel unverändert',
    [wa.href!, gm.toString(), mailto].every((h) => {
      const q = new URLSearchParams(h.slice(h.indexOf('?') + 1));
      return [...q.values()].some((v) => v.includes(url));
    }));
  add('kein Ziel enthält %2525 (das wäre echtes Doppel-Encoding)',
    ![wa.href!, gm.toString(), mailto].some((h) => h.includes('%2525')));

  add('copy hat kein href', shareTarget('copy', s, false).href === null);
  add('vier Ziele bei normaler Länge', shareTargets(s, false).length === 4);
  const huge = { ...s, description: 'x'.repeat(MAILTO_SAFE_MAX) };
  add('zu lange Nachricht ⇒ Mail wird weggelassen, nicht abgeschnitten',
    !shareTargets(huge, false).some((t) => t.channel === 'mail') && shareTargets(huge, false).length === 3);

  add('Zielreihenfolge ist stabil', shareTargets(s, false).map((t) => t.channel).join(',') === 'whatsapp,gmail,mail,copy');

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
