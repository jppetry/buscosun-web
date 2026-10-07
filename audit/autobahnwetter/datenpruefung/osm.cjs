const rows=require("./pos-rows.json").filter(r=>r.dm==null);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const num=(road)=>road?road.replace(/^[A-Z]+0*/,""):null;
async function refsAt(lat,lon){
  const q=`[out:json][timeout:25];way(around:300,${lat},${lon})[highway][ref];out tags;`;
  for(let t=0;t<3;t++){try{const r=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:"data="+encodeURIComponent(q),headers:{"User-Agent":"buscosun-audit"}});if(r.ok){const j=await r.json();return [...new Set(j.elements.map(e=>e.tags.ref))]}}catch{} await sleep(3000)}
  return null}
(async()=>{for(const r of rows){const n=num(r.road);const m=await refsAt(r.mlat,r.mlon);await sleep(1200);const c=await refsAt(r.clat,r.clon);await sleep(1200);
  const hit=(refs)=>refs==null?"?":refs.some(x=>n&&x.split(/[;\s]/).some(y=>y.replace(/^[A-Z]+\s*0*/,"")===n))?"JA":"nein";
  console.log(r.id.padEnd(5),(r.road||"-").padEnd(6),(r.n+"/"+r.cn).padEnd(34),"Abstand",r.d.toFixed(1).padStart(5),"| Meldung an Straße:",hit(m),JSON.stringify(m),"| Katalog an Straße:",hit(c),JSON.stringify(c))}})();
