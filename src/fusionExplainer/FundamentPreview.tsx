/**
 * Phase FX-UI, part A — the start-page preview of buscosun Fusion. Replaces the block "Fundament · Fusion Forecast" while the
 * flag is on (`fxFlag.ts`). The whole glass tile is ONE link to `/buscosun-fusion` (a plain click stays the app's own navigation,
 * like the tool tiles); nothing inside it is interactive. Schematic, no measured data.
 */
import { FUSION_CURRENT, fusionName } from '../pointForecast/fusion/fusionRelease';
import StepPanel from './StepPanel';
import { PREVIEW as T } from './copy';
import './FundamentPreview.css';

const PATH = '/buscosun-fusion';

export default function FundamentPreview({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="deck-fundament" aria-label="Fundament">
      <a
        className="deck-fundament-inner fxp"
        href={PATH}
        aria-label={T.aria}
        onClick={(e) => {
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onOpen();
        }}
      >
        <div className="fxp-text">
          <div className="fxp-eyebrow-row">
            <span className="fxp-eyebrow">{T.eyebrow}</span>
            <span className="fxp-pill">{fusionName(FUSION_CURRENT)}</span>
          </div>
          <h2 className="deck-h2">{T.h2}</h2>
          <p className="deck-lead fxp-lead">{T.lead}</p>
          <ul className="fxp-chips" aria-hidden="true">
            {T.chips.map(([n, label]) => <li key={n} className="fxp-chip"><b>{n}</b> {label}</li>)}
          </ul>
          <span className="fxp-btn" aria-hidden="true">{T.button}</span>
        </div>

        <div className="fxp-card" aria-hidden="true">
          <div className="fxp-pair">
            <div className="fxp-col">
              <div className="fxp-col-head"><span className="fxp-col-title">{T.before}</span><span className="fxp-col-sub">{T.beforeSub}</span></div>
              <StepPanel step={1} />
            </div>
            <span className="fxp-knot">
              <svg viewBox="0 0 16 16" width="16" height="16" focusable="false"><path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <div className="fxp-col">
              <div className="fxp-col-head"><span className="fxp-col-title fxp-col-title-after">{T.after}</span><span className="fxp-col-sub">{T.afterSub}</span></div>
              <StepPanel step={5} />
            </div>
          </div>
          <div className="fxp-caption">{T.caption}</div>
        </div>
      </a>
    </section>
  );
}
