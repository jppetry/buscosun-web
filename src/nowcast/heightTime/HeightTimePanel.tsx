/**
 * Phase HZS: the lazily loaded entry of the height-time section (data hook + chart in one chunk, so the deck only
 * carries the `import()`). Mounted only while the view "Karte + Höhe" / the mobile tab "Höhe" is open (`?hzs=1`).
 */
import type { Country } from '../../types';
import HeightTimeChart from './HeightTimeChart';
import { useHeightTime } from './useHeightTime';

export interface HeightTimePanelProps {
  point: { lat: number; lon: number; country: Country; name: string };
  sliderMs: number | null;
  variant: 'desktop' | 'mobile';
}

export default function HeightTimePanel({ point, sliderMs, variant }: HeightTimePanelProps) {
  const data = useHeightTime(point, true);
  return <HeightTimeChart data={data} place={point.name.split(',')[0]} sliderMs={sliderMs} variant={variant} />;
}
