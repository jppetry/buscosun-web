/**
 * GL-5 — what the situation page adds to the readout: the change feed "Was sich verändert hat" (every line with origin, source and time), the followed glaciers
 * with what is new since the last visit, and the official "vanished" statements with the authority's own criterion. Nothing here is computed from a model:
 * the feed document says what it is made of (`glacierFeedContract.ts`), a follow list is the visitor's own, a status is quoted.
 */
import { OriginChip } from './GlacierParts';
import { displayName, fmtKm2 } from './glacierView';
import type { GlacierCatalogEntry, GlacierOfficialItem } from './glacierContract';
import type { GlacierFeedEvent } from './glacierFeedContract';

const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

export function FeedList({ events, limit = 8, onPick, cardUrl, cardWeek }: { events: readonly GlacierFeedEvent[]; limit?: number; onPick?: (glacierId: string) => void; cardUrl?: string | null; cardWeek?: string | null }) {
  if (!events.length) return null;
  return (
    <>
      <h3 className="gl-h3">Was sich verändert hat</h3>
      {cardUrl && cardWeek && <p className="gl-fine gl-card-link"><a href={cardUrl} target="_blank" rel="noopener noreferrer">Wochenkarte {cardWeek.replace(/^(\d{4})-W(\d{2})$/, 'KW $2 / $1')} (Bild, teilbar)</a></p>}
      <ol className="gl-feed gl-changes" aria-label="Änderungen, neueste zuerst" data-count={events.length}>
        {events.slice(0, limit).map((e) => (
          <li key={e.id} data-id={e.id} data-type={e.type}>
            <time dateTime={e.at}>{dm(e.at)}</time>
            <span>
              {e.glacier && onPick ? <button type="button" className="gl-linkish" onClick={() => onPick(e.glacier!)}>{e.text}</button> : e.text}{' '}
              <OriginChip origin={e.origin} />
              <small>{e.source}{e.url ? <> · <a href={e.url} target="_blank" rel="noopener noreferrer">Quelle</a></> : null}</small>
            </span>
          </li>
        ))}
      </ol>
      {events.length > limit && <p className="gl-fine">{events.length - limit} weitere Ereignisse der letzten zwei Wochen sind im Feed.</p>}
    </>
  );
}

export function FollowList({ ids, byId, valueText, onPick, onUnfollow, fresh }: {
  ids: readonly string[]; byId: ReadonlyMap<string, GlacierCatalogEntry>; valueText: (id: string) => { text: string; origin: 'measured' | 'satellite' | 'model' | 'official'; label: string } | null;
  onPick: (id: string) => void; onUnfollow: (id: string) => void; fresh: readonly GlacierFeedEvent[];
}) {
  const list = ids.map((id) => byId.get(id)).filter((g): g is GlacierCatalogEntry => !!g);
  if (!list.length) return null;
  return (
    <>
      <h3 className="gl-h3">Meine Gletscher</h3>
      {fresh.length > 0 && (
        <div className="gl-card gl-new" role="status" aria-label="Neu seit deinem letzten Besuch">
          <div className="gl-card-head"><b>Neu seit deinem letzten Besuch</b><span className="gl-num">{fresh.length}</span></div>
          <ul className="gl-feed">{fresh.slice(0, 4).map((e) => <li key={e.id}><time dateTime={e.at}>{dm(e.at)}</time><span>{e.text} <OriginChip origin={e.origin} /></span></li>)}</ul>
        </div>
      )}
      <ul className="gl-fav" aria-label="Gefolgte Gletscher">
        {list.map((g) => {
          const v = valueText(g.id);
          return (
            <li key={g.id}>
              <button type="button" className="gl-fav-main" onClick={() => onPick(g.id)}><b>{displayName(g)}</b><span>{g.country} · {fmtKm2(g.area.km2)}{v ? ` · ${v.label}: ` : ''}{v ? <span className="gl-num" data-origin={v.origin}>{v.text}</span> : null}</span></button>
              <button type="button" className="gl-star is-on" aria-pressed="true" aria-label={`${displayName(g)} nicht mehr folgen`} onClick={() => onUnfollow(g.id)}>★</button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The official "vanished" statements with the authority's own criterion — the only place the word stands (plan §11, never from a satellite image). */
export function StatusList({ items }: { items: readonly GlacierOfficialItem[] }) {
  const st = items.filter((i) => i.kind === 'status' && i.criterion);
  if (!st.length) return null;
  return (
    <>
      <h3 className="gl-h3">Als verschwunden geführt — amtlich</h3>
      <ul className="gl-feed" aria-label="Amtliche Statusmeldungen">
        {st.map((i) => (
          <li key={i.id}>
            <time dateTime={i.date}>{dm(i.date)}</time>
            <span>
              <blockquote className="gl-quote" cite={i.url}>{i.quote}</blockquote>
              <small>Kriterium: {i.criterion} · {i.source.split(',')[0]} · <a href={i.url} target="_blank" rel="noopener noreferrer">Quelle</a></small>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
