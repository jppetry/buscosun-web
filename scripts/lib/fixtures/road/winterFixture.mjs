/**
 * V-AW-27 (audit/autobahnwetter.md §18) — a SYNTHETIC winter run of corridor a8 for `verify:road-ui`, derived
 * deterministically from the real run `fc-a8-2610040905.json` (a mild, dry October day). No frost run exists yet
 * (first one expected in November); until then the page's winter rendering — the blue air bands, rain/sleet/snow marks
 * and the snow words of tiles and rows — is checked on this transform. It is NOT a forecast and never leaves the
 * verifier; replace it by a real frost run when one is in the archive (`buscosun-archiv/road/fc/v1`).
 *
 * Transform per point k (in the contract's integer coding, values stay inside `ROAD_FC_RANGE`):
 *   t, td   −18 … −22 K (k mod 5), td a further −0.5 K      ⇒ the three air bands (≤ 0 · bis +3 · darüber) all occur
 *                                                             (the source day reached +18 … +20 °C in the afternoon)
 *   steps 1…12 at two of three points (k mod 3 ≠ 0): pp 80 %, rr 1.2 mm/h, snow share 90 % (k mod 3 = 1) or 50 % (= 2)
 *                                                             ⇒ snow and sleet marks, rain-free points between them
 */
export const WINTER_FIXTURE_NOTE = 'synthetisch (V-AW-27): echter Lauf a8 vom 04.10.2026, Luft −18…−22 K, Schnee/Schneeregen in den Stunden 1–12';

export function winterRun(real) {
  const points = real.points.map((p, k) => {
    const shift = -180 - (k % 5) * 10;
    const wet = (i) => i >= 1 && i <= 12 && k % 3 !== 0;
    const v = {
      ...p.v,
      t: p.v.t.map((x) => (x == null ? null : x + shift)),
      td: p.v.td.map((x) => (x == null ? null : x + shift - 5)),
      pp: p.v.pp.map((x, i) => (wet(i) ? 80 : x)),
      rr: p.v.rr.map((x, i) => (wet(i) ? 120 : x)),
      sn: p.v.sn.map((x, i) => (wet(i) ? (k % 3 === 1 ? 90 : 50) : x)),
    };
    return { ...p, v };
  });
  return { ...real, points, synthetic: WINTER_FIXTURE_NOTE };
}
