/** Phase TE: the views of the new mobile result (bottom bar). Ids are the `tab` state of `TourView`. */
import type { DeckBarItem } from './RouteDeck';

export type ResultTab = 'map' | 'pos' | 'wind' | 'chg' | 'start';

export const RESULT_TABS: readonly DeckBarItem[] = [
  { id: 'map', label: 'Karte', icon: <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7 9 4zM9 4v13M15 7v12.5" /> },
  { id: 'pos', label: 'Hier', icon: <><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></> },
  { id: 'wind', label: 'Wind', icon: <path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8" /> },
  { id: 'chg', label: 'Wechsel', icon: <path d="M4 7h13l-3-3M20 17H7l3 3" /> },
  { id: 'start', label: 'Start', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
];
