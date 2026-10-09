import h5py, numpy as np, glob, re, math, json
A=6378137.0; E=0.081819190842622; LON0=math.radians(10); PHIC=math.radians(60)
def psT(phi): es=E*math.sin(phi); return math.tan(math.pi/4-phi/2)*((1+es)/(1-es))**(E/2)
def psM(phi): return math.cos(phi)/math.sqrt(1-E*E*math.sin(phi)**2)
TC=psT(PHIC); MC=psM(PHIC)
def fwd(lon,lat):
    phi=math.radians(lat); lam=math.radians(lon); rho=A*MC*psT(phi)/TC
    return rho*math.sin(lam-LON0), -rho*math.cos(lam-LON0)
def off(pd): return float(re.search(r'\+x_0=([-\d.e]+)',pd).group(1)), float(re.search(r'\+y_0=([-\d.e]+)',pd).group(1))
RVX0,RVY0=543196.83521776402,3622588.8619310022
W,H=4400,4800
near_dbz=np.full((H,W),np.nan,np.float32); near_d=np.full((H,W),np.inf,np.float32); near_id=np.full((H,W),-1,np.int16)
max_dbz=np.full((H,W),np.nan,np.float32)
cover=np.zeros((H,W),bool)
sites=[]
for n,p in enumerate(sorted(glob.glob('all/*.h5'))):
    with h5py.File(p,'r') as f:
        w=f['where'].attrs; sx0,sy0=off(w['projdef'].decode()); d=f['dataset1/data1/data'][...]; wh=f['dataset1/data1/what'].attrs
        valid=d!=65535; dbz=np.where(valid, d.astype(np.float32)*np.float32(wh['gain'])+np.float32(wh['offset']), np.nan); dbz[d==0]=-40.0
        kx=(RVX0-sx0+375)/250; ly=(sy0-RVY0+375)/250
        dk=int(round(kx)); dl=int(round(ly))
        sX,sY=fwd(float(w['lon']),float(w['lat']))
        sites.append(dict(id=p[4:7],dk=dk,dl=dl,fracx=kx-dk,fracy=ly-dl,X=sX,Y=sY,lon=float(w['lon']),lat=float(w['lat']),valid=float(valid.mean())))
        # paste into target
        a0=max(0,-dk); a1=min(1600,W-dk); b0=max(0,-dl); b1=min(1600,H-dl)
        if a1<=a0 or b1<=b0: continue
        sub=dbz[b0:b1,a0:a1]; vsub=valid[b0:b1,a0:a1]
        ks=np.arange(a0+dk,a1+dk); ls=np.arange(b0+dl,b1+dl)
        Xt=(250*ks-375-RVX0)[None,:]; Yt=(-250*ls+375-RVY0)[:,None]
        dist=np.sqrt((Xt-sX)**2+(Yt-sY)**2).astype(np.float32)
        tgt=(slice(b0+dl,b1+dl),slice(a0+dk,a1+dk))
        better=vsub & (dist<near_d[tgt])
        near_d[tgt]=np.where(better,dist,near_d[tgt]); near_dbz[tgt]=np.where(better,sub,near_dbz[tgt]); near_id[tgt]=np.where(better,n,near_id[tgt])
        cover[tgt]|=vsub
        cur=max_dbz[tgt]; max_dbz[tgt]=np.where(vsub & (np.isnan(cur) | (sub>cur)), sub, cur)
print(json.dumps(sites[:3]))
near_d[~cover]=np.nan
def zr(dbz,a=256.0,b=1.42):
    r=np.where(np.isfinite(dbz)&(dbz>-39), (10**(dbz/10)/a)**(1/b), 0.0); return r.astype(np.float32)
Rn=zr(near_dbz); Rm=zr(max_dbz)
rv=np.load('rv1720.npy')
def block(a): return a.reshape(1200,4,1100,4).mean(axis=(1,3))
Rn1=block(Rn); Rm1=block(Rm); cov1=block(cover.astype(np.float32))>0.99
ok=cov1 & np.isfinite(rv)
print('cells compared', ok.sum())
for name,R1 in [('nearest',Rn1),('max',Rm1)]:
    wet_rv=rv>=0.06; wet_px=R1>=0.06
    both=ok&wet_rv&wet_px; onlyrv=ok&wet_rv&~wet_px; onlypx=ok&~wet_rv&wet_px
    lr=np.log10(np.maximum(R1[both],0.01)); lv=np.log10(np.maximum(rv[both],0.01))
    print(name, 'wet both',both.sum(),'only RV',onlyrv.sum(),'only px',onlypx.sum(), 'corr log', np.corrcoef(lr,lv)[0,1].round(3), 'median ratio px/rv', np.median(R1[both]/rv[both]).round(3), 'mean px',R1[both].mean().round(3),'mean rv',rv[both].mean().round(3))
    # by rv intensity class
    for lo,hi in [(0.06,0.5),(0.5,2),(2,5),(5,10),(10,100)]:
        m=both&(rv>=lo)&(rv<hi)
        if m.sum(): print('   rv %g-%g: n=%d median ratio %.2f corr %.2f'%(lo,hi,m.sum(),np.median(R1[m]/rv[m]),np.corrcoef(np.log10(R1[m]),np.log10(rv[m]))[0,1]))
# clutter candidates: only-px by distance to nearest site
d1=block(np.nan_to_num(near_d,nan=1e9))/1000
onlypx=ok&~(rv>=0.06)&(Rn1>=0.06)
for lo,hi in [(0,10),(10,20),(20,40),(40,80),(80,200)]:
    m=(d1>=lo)&(d1<hi)&ok; print('dist %d-%d km: cells %d, only-px wet %d (%.2f%%), only-rv %d, both %d'%(lo,hi,m.sum(),(m&onlypx).sum(),100*(m&onlypx).sum()/max(1,m.sum()),(m&(rv>=0.06)&~(Rn1>=0.06)).sum(),(m&(rv>=0.06)&(Rn1>=0.06)).sum()))
# nearest-site distance distribution over covered cells (250 m)
dd=near_d[cover]/1000
print('nearest-site distance km quantiles 10/25/50/75/90/max:', np.percentile(dd,[10,25,50,75,90,100]).round(1))
print('tangential bin width m at those (r*tan1deg):', (np.percentile(dd,[10,25,50,75,90,100])*1000*math.tan(math.radians(1))).round(0))
print('fraction of covered cells with nearest site <=14.3 km (250 m tangential):', (dd<=14.3).mean().round(4), '<=28.6 km (500 m):',(dd<=28.6).mean().round(4),'<=57 km (1 km):',(dd<=57.3).mean().round(4))
# sub-km structure: within RV-wet 1-km cells, variability of the 16 subcells
sub=Rn.reshape(1200,4,1100,4)
m=ok&(rv>=0.5)
mx=sub.max(axis=(1,3)); mn=sub.min(axis=(1,3)); mean=sub.mean(axis=(1,3))
print('within 1-km cells (rv>=0.5, n=%d): median max/mean %.2f, median min/mean %.2f, frac cells with max/mean>=2: %.3f'%(m.sum(), np.median(mx[m]/np.maximum(mean[m],1e-6)), np.median(mn[m]/np.maximum(mean[m],1e-6)), ((mx[m]/np.maximum(mean[m],1e-6))>=2).mean()))
np.savez_compressed('comp1720.npz', near_dbz=near_dbz, near_d=near_d, near_id=near_id, cover=cover)
json.dump(sites, open('sites_offsets.json','w'), indent=1)
