import numpy as np, zlib, struct, json, math, glob, h5py
z=np.load('comp1720.npz'); near_dbz=z['near_dbz']; cover=z['cover']; near_d=z['near_d']
rv=np.load('rv1720.npy')
# px250 echo threshold
e=near_dbz[np.isfinite(near_dbz)&(near_dbz>-39)]
print('px250 echo dBZ min/p1/p5/median:', e.min().round(2), np.percentile(e,[1,5,50]).round(2), 'count', e.size)
# approach B: anchored downscaling
def zr(dbz,a=256.0,b=1.42): return np.where(np.isfinite(dbz)&(dbz>-39),(10**(dbz/10)/a)**(1/b),0.0).astype(np.float32)
R=zr(near_dbz); R4=R.reshape(1200,4,1100,4); C4=cover.reshape(1200,4,1100,4)
csum=C4.sum(axis=(1,3)); rsum=(R4*C4).sum(axis=(1,3))
mean=np.where(csum>0, rsum/np.maximum(csum,1), 0)
rvw=np.nan_to_num(rv,nan=0.0)
w=np.ones_like(R)
has=(mean>0)[:,None,:,None]&C4
w4=np.where(has, R4/np.maximum(mean[:,None,:,None],1e-9), 1.0)
out=(rvw[:,None,:,None]*w4).reshape(4800,4400).astype(np.float32)
# checks
m1=out.reshape(1200,4,1100,4).mean(axis=(1,3))
print('anchor exact: max |mean250 - rv| =', np.nanmax(np.abs(m1-rvw)).round(5))
wet1=rvw>=0.06
print('1-km wet cells', wet1.sum(), 'with px structure', (wet1&(mean>0)).sum(), 'flat fallback', (wet1&(mean==0)).sum())
print('250m wet cells', (out>=0.06).sum(), 'max value', out.max().round(1), 'cells>200', (out>200).sum(), 'ratio max/rv p99', np.percentile(w4[has],99).round(2), 'p99.9', np.percentile(w4[has],99.9).round(2))
# encode tiles (log u8) and measure PNG size
LOGMIN,LOGMAX,STEPS=0.06,200,254; span=math.log(LOGMAX/LOGMIN)
u=np.where(out>=LOGMIN, 1+np.round(STEPS*np.log(np.maximum(out,LOGMIN)/LOGMIN)/span), 0).clip(0,255).astype(np.uint8)
def png(w,h,data):
    raw=b''.join(b'\x00'+data[r].tobytes() for r in range(h))
    def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,0,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b'')
tot=0; n=0; sizes=[]
for ty in range(4):
    for tx in range(4):
        t=u[ty*1200:(ty+1)*1200, tx*1100:(tx+1)*1100]
        if not t.any(): continue
        b=png(1100,1200,t); sizes.append((tx,ty,len(b))); tot+=len(b); n+=1
print('tiles wet', n, 'total bytes', tot, 'sizes', sorted(s[2] for s in sizes))
# compare: 1-km frame log png
u1=np.where(rvw>=LOGMIN, 1+np.round(STEPS*np.log(np.maximum(rvw,LOGMIN)/LOGMIN)/span),0).clip(0,255).astype(np.uint8)
print('1-km log png bytes', len(png(1100,1200,u1)))
np.save('out1720.npy', out)
