const z=require("zlib"),fs=require("fs");
const files=fs.readdirSync(".").filter(f=>f.endsWith(".json.gz")).sort();
let slots=0,cells=0,cls={},frost=[],obsRule={},obsSt={};
const R={A:0,B:0,C:0,AorB:0}, fr={total:0,A:0,B:0,AB:0,rest:[]};
for(const f of files){const j=JSON.parse(z.gunzipSync(fs.readFileSync(f)));slots+=j.slots.length;
 for(const[id,s]of Object.entries(j.stations)){const k=s.k||"";for(let i=0;i<k.length;i++){const c=k[i];if(c==="-")continue;cells++;cls[c]=(cls[c]||0)+1;
  const rs=s.rs?.[i],ta=s.ta?.[i],td=s.td?.[i];
  const A=rs!=null&&ta!=null&&rs<ta-12;               // road far below own air
  const B=rs!=null&&ta!=null&&td!=null&&rs===ta&&ta===td; // fill triple
  const C=rs!=null&&ta!=null&&rs>ta+30;
  if(A)R.A++;if(B)R.B++;if(C)R.C++;if(A||B)R.AorB++;
  if(c==="f"||c==="i"){fr.total++;if(A)fr.A++;if(B)fr.B++;if(A||B)fr.AB++;else fr.rest.push([id,j.slots[i],rs,ta,td,c])}}}
 for(const[sl,es]of Object.entries(j.quarantine||{}))for(const e of es)if(e.observe&&e.rule!=="catalog"){obsRule[e.rule]=(obsRule[e.rule]||0)+1;(obsSt[e.rule]??=new Set()).add(e.id)}}
console.log("half-days",files.length,"slots",slots,"station-slots",cells);console.log("classes",cls);
console.log("rule hits (station-slots): A rs<ta-12:",R.A," B rs=ta=td:",R.B," C rs>ta+30:",R.C);
console.log("frost/ice slots",fr.total,"caught by A",fr.A,"by B",fr.B,"by A|B",fr.AB);
const by={};for(const r of fr.rest){(by[r[0]]??=[]).push(r)}for(const[id,v]of Object.entries(by))console.log(" rest",id,v.length,"e.g.",JSON.stringify(v.slice(0,3).map(r=>r.slice(1))));
console.log("observe hits",obsRule,"stations",Object.fromEntries(Object.entries(obsSt).map(([k,v])=>[k,v.size])));
