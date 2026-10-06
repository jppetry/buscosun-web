/**
 * V-AW-12 (audit/autobahnwetter.md §18): a route behind a visitor flag (`?road=0|1`, `localStorage.road`, default
 * `ROAD_LIVE`, `src/road/roadFlag.ts`). Its static shell carries the route's H1 and lead for crawlers; for a visitor with
 * the flag off the app then answers "nicht gefunden" — and the lead flashed for a moment before. This inline script runs
 * right after `#root` while the HTML is parsed and empties it when the flag is off, with the SAME precedence as
 * `roadFlagFrom` (query beats storage beats default). `verify:road-ui` A3 checks it against `roadFlagFrom` for every case.
 */
export function flagGateScript(param, live) {
  const p = JSON.stringify(param);
  return `<script>(function(){try{var q=null;try{q=new URLSearchParams(location.search).get(${p})}catch(e){}var s=null;try{s=localStorage.getItem(${p})}catch(e){}`
    + `var on=q==='0'?false:q==='1'?true:s==='0'?false:s==='1'?true:${live ? 'true' : 'false'};`
    + `if(!on){var r=document.getElementById('root');if(r)r.innerHTML=''}}catch(e){}})()</script>`;
}
