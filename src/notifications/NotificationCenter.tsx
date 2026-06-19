/**
 * Benachrichtigungs-Center: Glocke (mit Ungelesen-Zähler) + Drawer.
 *
 * Bündelt die Querschnitts-Themen des Epics:
 *  • Inbox aller zugestellten Hinweise (PUSH-US2/US3 sichtbar).
 *  • Globale Steuerung gegen Überflutung (PUSH-US4): alles pausieren, Limit
 *    pro Tag, Mindestabstand.
 *  • Übersicht & Verwaltung aller aktiven Subscriptions (PUSH-US1).
 *  • „Jetzt prüfen" — wertet alle Subscriptions sofort neu aus (simuliert den
 *    künftigen Backend-Cron-Job).
 */

import { useState } from 'react';
import { useNotifications } from './useNotifications';
import { kindMeta, type Subscription, type DeliveredNotification } from './notificationModel';
import { IconBell } from '../event/eventIcons';
import './notifications.css';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export default function NotificationCenter() {
  const n = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="nf-bell"
        aria-label={`Benachrichtigungen${n.unreadCount ? ` (${n.unreadCount} ungelesen)` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true"><IconBell size={18} /></span>
        {n.unreadCount > 0 && <span className="nf-bell-badge">{n.unreadCount > 9 ? '9+' : n.unreadCount}</span>}
      </button>

      {open && (
        <>
          <div className="nf-scrim" onClick={() => setOpen(false)} />
          <aside className="nf-drawer" role="dialog" aria-label="Benachrichtigungen">
            <header className="nf-drawer-head">
              <strong>Benachrichtigungen</strong>
              <button type="button" className="nf-drawer-close" aria-label="Schließen" onClick={() => setOpen(false)}>×</button>
            </header>

            <div className="nf-drawer-body">
              <GlobalControls />
              <Subscriptions />
              <Inbox />
            </div>
          </aside>
        </>
      )}
    </>
  );
}

/** PUSH-US4 — globale Flut-Schutz-Regeln. */
function GlobalControls() {
  const n = useNotifications();
  const pausedAll = n.settings.pausedUntil != null && n.settings.pausedUntil > Date.now();
  return (
    <section className="nf-section">
      <div className="nf-section-head">
        <span className="rt-eyebrow">Steuerung</span>
        <button type="button" className="nf-btn nf-btn-ghost nf-check" disabled={n.checking || !n.subscriptions.length} onClick={() => void n.checkAll()}>
          {n.checking ? 'Prüfe …' : '↻ Jetzt prüfen'}
        </button>
      </div>

      <div className={`nf-pauseall${pausedAll ? ' is-paused' : ''}`}>
        {pausedAll ? (
          <>
            <span>⏸ Alle Hinweise pausiert{n.settings.pausedUntil ? ` bis ${formatTime(n.settings.pausedUntil)}` : ''}</span>
            <button type="button" className="nf-btn nf-btn-primary" onClick={() => n.pauseAll(null)}>Fortsetzen</button>
          </>
        ) : (
          <>
            <span>Zu viel des Guten?</span>
            <span className="nf-pause-actions">
              <button type="button" className="nf-btn nf-btn-ghost" onClick={() => n.pauseAll(Date.now() + 8 * HOUR_MS)}>8 h Ruhe</button>
              <button type="button" className="nf-btn nf-btn-ghost" onClick={() => n.pauseAll(Date.now() + DAY_MS)}>24 h Ruhe</button>
            </span>
          </>
        )}
      </div>

      <div className="nf-limits">
        <label className="nf-limit">
          <span>Höchstens pro Tag</span>
          <select value={n.settings.maxPerDay} onChange={(e) => n.updateSettings({ maxPerDay: Number(e.target.value) })}>
            {[2, 3, 5, 8, 12].map((v) => <option key={v} value={v}>{v} Hinweise</option>)}
          </select>
        </label>
        <label className="nf-limit">
          <span>Mindestabstand</span>
          <select value={n.settings.minHoursBetween} onChange={(e) => n.updateSettings({ minHoursBetween: Number(e.target.value) })}>
            {[1, 3, 6, 12, 24].map((v) => <option key={v} value={v}>{v} h</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}

/** PUSH-US1 — Übersicht aller aktiven Anmeldungen. */
function Subscriptions() {
  const n = useNotifications();
  if (!n.subscriptions.length) {
    return (
      <section className="nf-section">
        <span className="rt-eyebrow">Aktive Anmeldungen</span>
        <p className="nf-empty">Noch keine. Aktiviere Hinweise auf einer Event-Ergebnisseite.</p>
      </section>
    );
  }
  return (
    <section className="nf-section">
      <span className="rt-eyebrow">Aktive Anmeldungen · {n.subscriptions.length}</span>
      <ul className="nf-sub-list">
        {n.subscriptions.map((s) => <SubscriptionRow key={s.id} sub={s} />)}
      </ul>
    </section>
  );
}

function SubscriptionRow({ sub }: { sub: Subscription }) {
  const n = useNotifications();
  const paused = sub.pausedUntil != null && sub.pausedUntil > Date.now();
  const kinds = sub.kinds.map((k) => kindMeta(k).emoji).join(' ');
  return (
    <li className={`nf-sub${paused ? ' is-paused' : ''}`}>
      <div className="nf-sub-main">
        <span className="nf-sub-title">{sub.query.activity.emoji} {sub.query.activity.label}</span>
        <span className="nf-sub-sub">{shortPlace(sub.query.location.name)} · {kinds || 'keine Art aktiv'}{paused ? ' · pausiert' : ''}</span>
      </div>
      <div className="nf-sub-actions">
        {paused ? (
          <button type="button" className="nf-icon-btn" title="Fortsetzen" onClick={() => n.pauseSubscription(sub.id, null)}>▶</button>
        ) : (
          <button type="button" className="nf-icon-btn" title="24 h pausieren" onClick={() => n.pauseSubscription(sub.id, Date.now() + DAY_MS)}>⏸</button>
        )}
        <button type="button" className="nf-icon-btn nf-icon-danger" title="Entfernen" onClick={() => n.unsubscribe(sub.id)}>🗑</button>
      </div>
    </li>
  );
}

function Inbox() {
  const n = useNotifications();
  return (
    <section className="nf-section">
      <div className="nf-section-head">
        <span className="rt-eyebrow">Verlauf</span>
        {n.delivered.length > 0 && (
          <span className="nf-inbox-actions">
            <button type="button" className="nf-link" onClick={n.markAllRead}>Alle gelesen</button>
            <button type="button" className="nf-link" onClick={n.clearInbox}>Leeren</button>
          </span>
        )}
      </div>
      {n.delivered.length === 0 ? (
        <p className="nf-empty">Noch keine Hinweise. Sobald sich etwas Relevantes ändert, erscheint es hier.</p>
      ) : (
        <ul className="nf-inbox">
          {n.delivered.map((d) => <InboxItem key={d.id} item={d} onRead={() => n.markRead(d.id)} />)}
        </ul>
      )}
    </section>
  );
}

function InboxItem({ item, onRead }: { item: DeliveredNotification; onRead: () => void }) {
  const meta = kindMeta(item.kind);
  return (
    <li className={`nf-inbox-item${item.read ? '' : ' is-unread'}`} onClick={onRead}>
      <span className="nf-inbox-icon" aria-hidden="true">{meta.emoji}</span>
      <div className="nf-inbox-text">
        <strong className="nf-inbox-title">{item.title}</strong>
        <span className="nf-inbox-body">{item.body}</span>
        <span className="nf-inbox-time">{formatRelative(item.createdAt)}</span>
      </div>
      {!item.read && <span className="nf-inbox-dot" aria-label="ungelesen" />}
    </li>
  );
}

// --- Helfer ------------------------------------------------------------------

function shortPlace(name: string): string {
  return name.split(',')[0];
}
function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'gerade eben';
  if (diff < HOUR_MS) return `vor ${Math.round(diff / 60_000)} min`;
  if (diff < DAY_MS) return `vor ${Math.round(diff / HOUR_MS)} h`;
  return new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
