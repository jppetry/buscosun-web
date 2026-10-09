/**
 * Phase ZO: Haltestellen der gewählten Zelle auf der Karte — kleiner Punkt am Ort und „Dachau 14:20–14:35", Kern kräftig,
 * Rand hell, der gewählte Ort in Terrakotta. DOM-Marker (Muster Stadt-Temperaturen und Marker-Label RB): eigene Schriften,
 * keine Fremd-Glyphen (Z2 §3), kein Eingriff in Stil, Layer oder Shader. Überdecken sich Beschriftungen, bleibt bei der
 * nachrangigen nur der Punkt (Rang: dein Ort, jetzt/Kern, Rand; je nach Größe) — der Ort steht weiter in der Liste.
 */
import maplibregl from 'maplibre-gl';
import { clockHm, type CellPass } from '../radar/cellPlaces';
import './cellPlaces.css';

const RANK: Record<CellPass['kind'], number> = { now: 0, core: 0, edge: 1 };

export class CellPlaceStops {
  private markers: Array<{ m: maplibregl.Marker; el: HTMLElement; rank: number }> = [];
  private map: maplibregl.Map | null = null;
  private readonly onMove = () => this.declutter();

  set(map: maplibregl.Map | null, rows: readonly CellPass[], nowMs: number): void {
    this.clear();
    if (!map || rows.length === 0) return;
    this.map = map;
    const ranked = [...rows].sort((a, b) => Number(b.chosen) - Number(a.chosen) || RANK[a.kind] - RANK[b.kind] || (b.place.pop ?? 0) - (a.place.pop ?? 0));
    ranked.forEach((r, i) => {
      const el = document.createElement('div');
      el.className = `zo-stop is-${r.kind}${r.chosen ? ' is-chosen' : ''}`;
      const dot = document.createElement('span');
      dot.className = 'zo-stop-dot';
      const label = document.createElement('span');
      label.className = 'zo-stop-label';
      label.textContent = r.place.name;
      const time = document.createElement('b');
      time.textContent = `${r.fromMs <= nowMs ? 'jetzt' : clockHm(r.fromMs)}–${clockHm(r.toMs)}`;
      label.appendChild(time);
      el.append(dot, label);
      const m = new maplibregl.Marker({ element: el, anchor: 'left', offset: [-6, 0] }).setLngLat([r.place.lon, r.place.lat]).addTo(map);
      this.markers.push({ m, el, rank: i });
    });
    map.on('moveend', this.onMove);
    this.declutter();
  }

  clear(): void {
    this.map?.off('moveend', this.onMove);
    for (const { m } of this.markers) m.remove();
    this.markers = [];
    this.map = null;
  }

  /** Beschriftungen nach Rang setzen; überdeckte nachrangige zeigen nur den Punkt. */
  private declutter(): void {
    const taken: DOMRect[] = [];
    for (const k of this.markers) {
      k.el.classList.remove('is-compact');
      const label = k.el.querySelector('.zo-stop-label');
      const box = label?.getBoundingClientRect();
      if (!box) continue;
      const hit = taken.some((t) => box.left < t.right + 2 && box.right > t.left - 2 && box.top < t.bottom + 2 && box.bottom > t.top - 2);
      if (hit) k.el.classList.add('is-compact');
      else taken.push(box);
    }
  }
}
