/**
 * Phase SU — "Böen über X kn: in etwa n von 10 vergleichbaren Lagen" with ten dots (`audit/seewetter-bandbreite.md`).
 * One hour, the profile's gust limit, no percent value and no traffic light: n dots are filled in the colour of the
 * limit line. Outside the span q10–q90 the dots show only the side — none filled and the first one faint ("seltener
 * als 1 von 10"), nine filled and the tenth ringed ("häufiger als 9 von 10").
 * `where`: `readout` = the line below the hour's tiles (the legend "meist = 8 von 10 Fällen" stands in the note right
 * below it), `bar` = the strip on the phone's bottom bar. Both carry the dots and the sentence, nothing else.
 */
import { overDots, overSentence, type SeaOver } from './windBand';

export default function SeaGustOdds({ over, limitKn, where }: { over: SeaOver; limitKn: number; where: 'readout' | 'bar' }) {
  const n = overDots(over);
  const dot = (i: number) => (i < n ? 'is-on' : over.kind === 'often' && i === 9 ? 'is-more' : over.kind === 'rare' && i === 0 ? 'is-less' : '');
  return (
    <p className={`sw-odds is-${where}`} data-over={over.kind === 'tenths' ? over.tenths : over.kind}>
      <span className="sw-odds-dots" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} className={dot(i)} />)}</span>
      <span className="sw-odds-tx">{overSentence(over, limitKn)}</span>
    </p>
  );
}
