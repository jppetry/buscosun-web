/**
 * Phase HDR (Jan 04.11.2026): the radar attribution DE · AT · CH, visible, from the existing constants
 * (`sources/radarAttribution.ts`) — each source as a link, the licence as text. Inline element; the caller
 * places it (readout footer, quality list, layer card).
 */
import { Fragment } from 'react';
import { RADAR_ATTRIBUTIONS, parseRadarAttribution } from '../sources/radarAttribution';

export function RadarAttribution({ className }: { className?: string }) {
  return (
    <span className={className}>
      {RADAR_ATTRIBUTIONS.map((html, i) => {
        const p = parseRadarAttribution(html);
        return (
          <Fragment key={p.href}>
            {i > 0 && ' · '}
            <a href={p.href} target="_blank" rel="noopener">{p.name}</a>
            {p.rest ? ` ${p.rest}` : ''}
          </Fragment>
        );
      })}
    </span>
  );
}
