/**
 * FavoriteStar — der eine Auslöser, mit dem ein Ort gespeichert wird (V-04).
 *
 * Vorbefund: `favorites.ts` bot `addFavorite`/`toggleFavorite` an, hatte dafür
 * aber **keinen einzigen Aufrufer** — die Startseite konnte gespeicherte Orte
 * nur anzeigen und löschen. Gleichzeitig schrieb die Historie in einen eigenen
 * Key, dessen Leser (`historyState.getFavorites`) ebenfalls keinen Konsumenten
 * hatte: dort angelegte Orte waren unsichtbar. Zwei Hälften eines Features, die
 * sich nie trafen.
 *
 * Bewusst eine eigene Datei statt eines Exports aus `SearchPage.tsx`: der
 * Punktforecast soll den Stern benutzen können, ohne die gesamte Startseite
 * (Hero, Palette, Intro-Tour …) mitzuziehen.
 *
 * Command-Deck-konform (D-27): keine eigene Farbe, nur vorhandene Tokens.
 */
import { useEffect, useState } from 'react';
import type { Location } from './types';
import { FAVORITES_MAX, favoritesFull, isFavorite, subscribeFavorites, toggleFavorite } from './favorites';

interface Props {
  loc: Location;
  /** Zusätzliche Klasse für die aufrufende Fläche (Suchzeile vs. Panel-Kopf). */
  className?: string;
  /** Beschriftung neben dem Stern (Panel-Kopf); ohne sie nur das Symbol. */
  withLabel?: boolean;
}

export default function FavoriteStar({ loc, className, withLabel = false }: Props) {
  const [fav, setFav] = useState(() => isFavorite(loc));

  // Derselbe Ort kann an mehreren Stellen gleichzeitig sichtbar sein
  // (Suchergebnis + Chip-Leiste + Punktforecast) — alle müssen mitziehen.
  useEffect(() => {
    setFav(isFavorite(loc));
    return subscribeFavorites(() => setFav(isFavorite(loc)));
  }, [loc.lat, loc.lon]);

  const short = loc.name.split(',')[0];
  // Ehrlich statt bequem (D-04): Bei vollem Speicher verdrängt `addFavorite`
  // den ältesten Eintrag. Das wird angesagt, statt es stillschweigend zu tun.
  const willEvict = !fav && favoritesFull();
  const label = fav
    ? `${short} aus gespeicherten Orten entfernen`
    : willEvict
      ? `${short} speichern — ältester Ort weicht (max. ${FAVORITES_MAX})`
      : `${short} speichern`;

  return (
    <button
      type="button"
      className={`fav-star${fav ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={fav}
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); setFav(toggleFavorite(loc).isFav); }}
    >
      <span className="fav-star-glyph" aria-hidden="true">{fav ? '★' : '☆'}</span>
      {withLabel && <span className="fav-star-label">{fav ? 'Gespeichert' : 'Speichern'}</span>}
    </button>
  );
}
