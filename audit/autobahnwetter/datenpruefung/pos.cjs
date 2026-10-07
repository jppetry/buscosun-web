const o=require("./obs.json"),cat=require("./stations.json").stations,cor=require("./corridors.json").corridors;
const K=111.2;
const segD=(pt,A,B)=>{const kx=K*Math.cos(pt[1]*Math.PI/180);const ax=(B[0]-A[0])*kx,ay=(B[1]-A[1])*K,px=(pt[0]-A[0])*kx,py=(pt[1]-A[1])*K;const L=ax*ax+ay*ay;let t=L?(px*ax+py*ay)/L:0;t=Math.max(0,Math.min(1,t));return Math.hypot(px-t*ax,py-t*ay)};
const lineD=(pt,line)=>{let m=1e9;for(let i=1;i<line.length;i++)m=Math.min(m,segD(pt,line[i-1],line[i]));return m};
const roadD=(pt,road)=>{let m=1e9;for(const c of cor)if(c.road===road)m=Math.min(m,lineD(pt,c.line));return m};
const hav=(a,b,c,d)=>{const r=Math.PI/180;const h=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(h))};
const rows=[];
for(const p of o.points){const c=cat[p.id];if(!c||c.lat==null)continue;const d=hav(p.lat,p.lon,c.lat,c.lon);if(d<=2)continue;
 const road=p.road||c.road;let dm=null,dc=null;if(road&&road.startsWith("A")&&cor.some(x=>x.road===road)){dm=roadD([p.lon,p.lat],road);dc=roadD([c.lon,c.lat],road)}
 rows.push({id:p.id,n:p.n,cn:c.n,road,kind:p.kind,d,dm,dc,mlat:p.lat,mlon:p.lon,clat:c.lat,clon:c.lon,dec:(String(c.lat).split(".")[1]||"").length});}
rows.sort((a,b)=>b.d-a.d);
const A=rows.filter(r=>r.dm!=null);
const win=(r)=>r.dm<0.5&&r.dc>=0.5?"Meldung":r.dc<0.5&&r.dm>=0.5?"Katalog":r.dm<0.5&&r.dc<0.5?"beide":"keine";
const cnt={};for(const r of A){const w=win(r);cnt[w]=(cnt[w]||0)+1}
console.log("stations >2km:",rows.length,"on motorway with axis:",A.length,"winner (<0.5 km from own motorway axis):",cnt);
for(const r of A)console.log(win(r).padEnd(8),r.id,r.road,(r.n+"/"+r.cn).padEnd(36),"Abstand",r.d.toFixed(1),"| Meldung→Achse",r.dm.toFixed(2),"| Katalog→Achse",r.dc.toFixed(2),"| Katalog-Nachkommastellen",r.dec);
console.log("--- ohne Autobahnachse:",rows.length-A.length,"kinds",JSON.stringify(rows.filter(r=>r.dm==null).reduce((m,r)=>(m[r.kind]=(m[r.kind]||0)+1,m),{})));
require("fs").writeFileSync("pos-rows.json",JSON.stringify(rows));
