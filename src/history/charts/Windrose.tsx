/**
 * Windrose (E4.4): Häufigkeit je Windrichtungs-Sektor, radial.
 */

interface Props { data: { dir: string; share: number; meanKmh: number | null }[] }

const DIR_ANGLE: Record<string, number> = { N: -90, NO: -45, O: 0, SO: 45, S: 90, SW: 135, W: 180, NW: 225 };

export default function Windrose({ data }: Props) {
  if (!data.length || data.every((d) => d.share === 0)) return <div className="hi-chart-empty">Keine Winddaten.</div>;
  const S = 320, cx = S / 2, cy = S / 2, R = 120;
  const maxShare = Math.max(...data.map((d) => d.share)) || 1;
  const rings = [0.25, 0.5, 0.75, 1];

  const wedge = (angleDeg: number, frac: number) => {
    const half = 22; // halbe Sektorbreite
    const r = R * frac;
    const a0 = ((angleDeg - half) * Math.PI) / 180, a1 = ((angleDeg + half) * Math.PI) / 180;
    return `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
  };

  return (
    <div className="hi-chart-wrap hi-windrose-wrap">
      <svg viewBox={`0 0 ${S} ${S}`} className="hi-windrose" role="img" aria-label="Windrose: Häufigkeit je Richtung.">
        {rings.map((f) => <circle key={f} cx={cx} cy={cy} r={R * f} fill="none" stroke="#E6DCC6" />)}
        {data.map((d) => {
          const ang = DIR_ANGLE[d.dir] ?? 0;
          const intensity = d.meanKmh != null ? Math.min(1, d.meanKmh / 40) : 0.5;
          const color = `rgb(${Math.round(120 + intensity * 80)},${Math.round(150 - intensity * 40)},${Math.round(110 - intensity * 30)})`;
          return <path key={d.dir} d={wedge(ang, d.share / maxShare)} fill={color} opacity={0.85}>
            <title>{d.dir}: {Math.round(d.share * 100)}% {d.meanKmh != null ? `· Ø ${Math.round(d.meanKmh)} km/h` : ''}</title>
          </path>;
        })}
        {Object.entries(DIR_ANGLE).map(([dir, ang]) => {
          const a = (ang * Math.PI) / 180; const r = R + 16;
          return <text key={dir} x={cx + r * Math.cos(a)} y={cy + r * Math.sin(a) + 4} className="hi-axislabel" textAnchor="middle">{dir}</text>;
        })}
      </svg>
      <div className="hi-chart-foot"><span className="hi-ref-tag">Länge = Häufigkeit der Richtung · Farbe = mittlere Windstärke</span></div>
    </div>
  );
}
