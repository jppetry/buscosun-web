const E=require(process.argv[2]);const o=require(process.argv[3]);
for(const r of E){r.id=String(r.id).trim()}
const byId=new Map(o.points.map(p=>[p.id,p]));
const eq=(a,b,t=0.011)=>a==null&&b==null||(a!=null&&b!=null&&Math.abs(a-b)<=t);
let n=0,missing=[],diff={};const add=(k,s)=>{(diff[k]??=[]).push(s)};
const eById=new Map();for(const r of E){if(eById.has(r.id))add("dupInSource",r.id+":"+eById.get(r.id).group+"/"+r.group);eById.set(r.id,r)}
let compared=0;
for(const r of E){const p=byId.get(r.id);if(!p){missing.push(r.id+"("+r.group+")");continue}n++;
 if(p.g!==r.group){add("group",r.id);continue}
 const x=p.x||{};
 const cmp=(f,ev,t)=>{if(x[f])return; compared++; if(!eq(p[f],ev,t))add(f,`${r.id} obs=${p[f]} ec=${ev}`)};
 cmp("ta",r.ta);cmp("td",r.td);cmp("rh",r.rh);cmp("vis",r.vis,1);cmp("ws",r.ws);cmp("wg",r.wg);cmp("wd",r.wd);cmp("pr",r.pr);cmp("pt",r.pt);
 const rss=r.sensors.map(s=>s.rs).filter(v=>v!=null);
 if(!x.rs){compared++;const mn=rss.length?Math.min(...rss):null;if(!eq(p.rs,mn))add("rs",`${r.id} obs=${p.rs} ec=${mn} all=${rss}`)}
 if(!eq(p.lat,r.latitude,1e-4)||!eq(p.lon,r.longitude,1e-4))add("pos",`${r.id} ${p.lat},${p.lon} vs ${r.latitude},${r.longitude}`);
 const t=Date.UTC(r.year,r.month-1,r.day,r.hour,r.minute);if(t!==p.t)add("time",r.id);
}
console.log("eccodes stations",E.length,"matched",n,"compared values",compared,"not in obs",missing.length,missing.join(" "));
console.log("obs points not in eccodes",o.points.filter(p=>!eById.has(p.id)).map(p=>p.id+"("+p.g+")").join(" "));
for(const[k,v]of Object.entries(diff))console.log(k,v.length,v.slice(0,8).join(" | "));
