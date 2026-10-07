const z=require("zlib"),fs=require("fs");
const files=fs.readdirSync(".").filter(f=>f.endsWith(".json.gz")).sort();
const st={A:{},C:{},D:{},Z:{}};let fr=0,frLeft=[],ice=[],zeroNear=0;
const add=(m,id,n)=>{m[id]=(m[id]||0)+1};
for(const f of files){const j=JSON.parse(z.gunzipSync(fs.readFileSync(f)));
 for(const[id,s]of Object.entries(j.stations)){const k=s.k||"";for(let i=0;i<k.length;i++){if(k[i]==="-")continue;
  const rs=s.rs?.[i],ta=s.ta?.[i],td=s.td?.[i];if(rs==null)continue;
  const A=ta!=null&&rs<ta-12, B=ta!=null&&td!=null&&rs===ta&&ta===td, C=ta!=null&&rs>ta+30;
  const D=(rs===0||rs===-1)&&ta!=null&&ta-rs>=5;
  if(rs===0&&ta!=null&&Math.abs(ta)<3)zeroNear++;
  if(A)add(st.A,id+":"+s.n);if(C)add(st.C,id+":"+s.n);if(D)add(st.D,id+":"+s.n);if(rs===0)add(st.Z,id);
  if(k[i]==="i")ice.push([id,s.n,j.slots[i],rs,ta,td]);
  if(k[i]==="f"||k[i]==="i"){fr++;if(!(A||B||D))frLeft.push([id,s.n,j.slots[i],rs,ta,td])}}}}
const top=(m)=>Object.entries(m).sort((a,b)=>b[1]-a[1]);
console.log("A (rs<ta-12) stations",top(st.A).length,JSON.stringify(top(st.A).slice(0,12)));
console.log("C (rs>ta+30) stations",top(st.C).length,JSON.stringify(top(st.C).slice(0,12)));
console.log("D (rs exactly 0/-1, air>=5K warmer) stations",top(st.D).length,"hits",top(st.D).reduce((a,b)=>a+b[1],0),JSON.stringify(top(st.D).slice(0,12)));
console.log("rs exactly 0.0 at |air|<3:",zeroNear,"(would stay)");
console.log("ice",JSON.stringify(ice));console.log("frost/ice",fr,"left after A|B|D",frLeft.length,JSON.stringify(frLeft));
