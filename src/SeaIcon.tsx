/**
 * Wave glyph of the Seewetter tile on the start page, in the reduced style of the flame (src/FireIcon.tsx)
 * and the glacier (src/GlacierIcon.tsx): one breaking wave in the middle, flanked by a dune with a
 * lighthouse on the left and two smaller waves on the right. Pure SVG + CSS (.tile-coast-*): the wave
 * surges, its inner layer swells out of phase, spray rises off the crest, the swells bob and the lamp
 * blinks. No JS, no per-frame work.
 */
const GROUND = 58;

/** Breaking wave in its own 64×64 box (base on y 58): body, light inner layer and foam band inside the crest. */
const WAVE_OUTER = 'M4 58C12 51 18 38 26 28C32 20 40 13 49 13C56 13 60 18 58 23.5C56.5 27.5 51.5 28 50 24.5C49 22 45.5 21.5 43.5 25C40 31 44 42 52 48.5C55.5 51.5 58.5 54.5 60 58Z';
const WAVE_INNER = 'M15 58C20 50 24 41 30 33C34.5 27 40 22 46 20.5C42 25 39.5 31 40.5 38C41.5 45 46 51 50 58Z';
const WAVE_FOAM = 'M29 27.5C34.5 20.5 41.5 16 48.5 15.8C53.5 15.6 56.6 18.4 56.2 21.8';

/** A smaller copy of the wave standing on the ground line at x (like the smaller trees beside the flame). */
function miniWave(x: number, scale: number, cls: string) {
  return (
    <g transform={`translate(${x} ${GROUND - GROUND * scale}) scale(${scale})`}>
      {/* The CSS animation sits on the inner group so it does not replace the placement transform. */}
      <g className={cls}>
        <path fill="url(#coast-wave-outer)" d={WAVE_OUTER} />
        <path fill="url(#coast-wave-inner)" d={WAVE_INNER} />
        <path className="tile-coast-minifoam" d={WAVE_FOAM} />
      </g>
    </g>
  );
}

export default function SeaIcon() {
  return (
    <svg className="tile-coast-svg" width="148" height="64" viewBox="0 0 148 64" aria-hidden="true">
      <defs>
        <linearGradient id="coast-wave-outer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A9AA6" />
          <stop offset="1" stopColor="#1C5F6B" />
        </linearGradient>
        <linearGradient id="coast-wave-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A9DCE0" />
          <stop offset="1" stopColor="#2A9AA6" />
        </linearGradient>
        <radialGradient id="coast-glow" cx="50%" cy="60%" r="50%">
          <stop offset="0" stopColor="#7FC4CC" stopOpacity="0.38" />
          <stop offset="1" stopColor="#7FC4CC" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Own viewport keeps the wave's 64×64 coordinates (CSS transform-origin) unchanged, like the flame. */}
      <svg x="42" y="0" width="64" height="64" viewBox="0 0 64 64" overflow="visible">
        <circle className="tile-coast-glow" cx="32" cy="36" r="30" fill="url(#coast-glow)" />
        <path
          className="tile-coast-outer"
          fill="url(#coast-wave-outer)"
          d={WAVE_OUTER}
        />
        <path
          className="tile-coast-inner"
          fill="url(#coast-wave-inner)"
          d={WAVE_INNER}
        />
        <path className="tile-coast-foam" d={WAVE_FOAM} />
        <circle className="tile-coast-drip" cx="51" cy="28" r="1" />
        <circle className="tile-coast-spray" cx="52" cy="11" r="1.3" />
        <circle className="tile-coast-spray tile-coast-spray-b" cx="58" cy="15" r="1" />
        <circle className="tile-coast-spray tile-coast-spray-c" cx="45" cy="10" r="1.1" />
      </svg>
      {/* Left: dune with beach grass and a lighthouse */}
      <path className="tile-coast-dune" d={`M4 ${GROUND}C10 50 18 46 26 46C32 46 37 51 40 ${GROUND}Z`} />
      <path className="tile-coast-grass" d="M10 51l-1.5-3.6M12 49.6l.4-4M30 47l1.6-3.6M33 48.4l2-3" />
      <path className="tile-coast-tower" d="M18.6 46.6L19.8 30h4.4l1.2 16.6z" />
      <path className="tile-coast-band" d="M19.4 35h5.2l.3 3.6h-5.8zM19 41.6h6l.3 3.4h-6.6z" />
      <path className="tile-coast-gallery" d="M18.8 29.4h6.4v1.2h-6.4z" />
      <rect className="tile-coast-lamp" x="20.4" y="25.6" width="3.2" height="3.8" rx="0.6" />
      <path className="tile-coast-roof" d="M19.6 25.8L22 23.2l2.4 2.6z" />
      {/* Right: two smaller waves, the far one paler */}
      {miniWave(126, 0.32, 'tile-coast-swell tile-coast-swell-back')}
      {miniWave(108, 0.46, 'tile-coast-swell')}
      <path className="tile-coast-ground" d={`M2 ${GROUND + 0.5}H146`} />
    </svg>
  );
}
