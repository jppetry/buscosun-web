/**
 * PUSH-US1 — Benachrichtigung je Anlass + Ort ein-/abschalten.
 *
 * Wird auf der Event-Ergebnisseite eingebettet. Bietet einen Hauptschalter für
 * das aktuelle Vorhaben (Anlass + Ort + Fenster) und — wenn aktiv — die einzelnen
 * Arten (bester-Tag-Wechsel, klare Nacht) sowie eine Schnell-Pause (PUSH-US4).
 */

import { useNotifications } from './useNotifications';
import { NOTIFICATION_KINDS } from './notificationModel';
import type { EventQuery } from '../event/eventModel';
import { IconBell } from '../event/eventIcons';
import './notifications.css';

const DAY_MS = 86_400_000;

export default function NotificationToggle({ query }: { query: EventQuery }) {
  const n = useNotifications();
  const sub = n.subscriptionFor(query);
  const activityId = query.activity.id;

  if (!sub) {
    return (
      <div className="ev-card nf-toggle nf-toggle-off">
        <div className="nf-toggle-head">
          <span className="nf-toggle-icon" aria-hidden="true"><IconBell size={22} /></span>
          <div>
            <span className="rt-eyebrow nf-toggle-eyebrow">Benachrichtigungen</span>
            <strong className="nf-toggle-title">Bei Änderungen Bescheid bekommen</strong>
          </div>
        </div>
        <p className="nf-toggle-lead">
          Lass dich für <strong>{query.activity.label}</strong> in {shortPlace(query.location.name)} erinnern, wenn sich
          der beste Tag verschiebt{highlightsClearNight(activityId) ? ' oder eine klare Nacht aufkommt' : ''}.
        </p>
        <button type="button" className="nf-btn nf-btn-primary" onClick={() => void n.subscribe(query)}>
          Benachrichtigungen aktivieren
        </button>
        {!n.backendConfigured && (
          <p className="nf-note">
            Hinweise erscheinen, solange die App geöffnet ist (Browser-/In-App-Hinweis). Echte Push-Benachrichtigungen
            bei geschlossener App folgen, sobald das Backend steht.
          </p>
        )}
      </div>
    );
  }

  const paused = sub.pausedUntil != null && sub.pausedUntil > Date.now();
  return (
    <div className="ev-card nf-toggle nf-toggle-on">
      <div className="nf-toggle-head">
        <span className="nf-toggle-icon" aria-hidden="true"><IconBell size={22} /></span>
        <div>
          <span className="rt-eyebrow nf-toggle-eyebrow">Benachrichtigungen aktiv</span>
          <strong className="nf-toggle-title">{query.activity.label} · {shortPlace(query.location.name)}</strong>
        </div>
        <button type="button" className="nf-btn nf-btn-ghost nf-toggle-off-btn" onClick={() => n.unsubscribe(sub.id)}>
          Ausschalten
        </button>
      </div>

      <div className="nf-kinds">
        {NOTIFICATION_KINDS.map((meta) => {
          const on = sub.kinds.includes(meta.kind);
          const highlight = meta.highlightFor.includes(activityId);
          return (
            <label key={meta.kind} className={`nf-kind${on ? ' is-on' : ''}`}>
              <Switch checked={on} onChange={() => n.toggleKind(sub.id, meta.kind)} label={meta.label} />
              <span className="nf-kind-text">
                <span className="nf-kind-label">
                  {meta.emoji} {meta.label}
                  {highlight && <span className="nf-kind-badge">passend</span>}
                </span>
                <span className="nf-kind-desc">{meta.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="nf-toggle-foot">
        {paused ? (
          <button type="button" className="nf-btn nf-btn-ghost" onClick={() => n.pauseSubscription(sub.id, null)}>
            ▶ Fortsetzen (pausiert)
          </button>
        ) : (
          <button type="button" className="nf-btn nf-btn-ghost" onClick={() => n.pauseSubscription(sub.id, Date.now() + DAY_MS)}>
            ⏸ 24 h pausieren
          </button>
        )}
        <PermissionHint />
      </div>
    </div>
  );
}

function PermissionHint() {
  const n = useNotifications();
  if (n.permission === 'granted') return <span className="nf-perm nf-perm-ok">System-Hinweise aktiv</span>;
  if (n.permission === 'unsupported') return <span className="nf-perm">Nur In-App-Hinweise (Browser ohne Push)</span>;
  if (n.permission === 'denied')
    return <span className="nf-perm nf-perm-warn">System-Hinweise blockiert — nur in der App sichtbar</span>;
  return (
    <button type="button" className="nf-perm nf-perm-link" onClick={() => void n.requestPermission()}>
      System-Hinweise erlauben
    </button>
  );
}

/** Schlichter zugänglicher Umschalter. */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`nf-switch${checked ? ' is-on' : ''}`}
      onClick={onChange}
    >
      <span className="nf-switch-knob" />
    </button>
  );
}

function shortPlace(name: string): string {
  return name.split(',')[0];
}
function highlightsClearNight(activityId: string): boolean {
  return NOTIFICATION_KINDS.some((k) => k.kind === 'clear-night' && k.highlightFor.includes(activityId));
}

export { Switch };
