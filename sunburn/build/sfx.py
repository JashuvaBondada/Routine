"""Synthesize the cinematic SFX library (48 kHz stereo WAV)."""
import numpy as np, soundfile as sf, scipy.signal as ss, os
SR=48000; OUT=os.path.join(os.path.dirname(__file__),"..","project","sfx")
rng=np.random.default_rng(7)
def t(d): return np.arange(int(d*SR))/SR
def norm(x,db=-1): return x/np.max(np.abs(x))*10**(db/20)
def lp(x,f,o=4): return ss.sosfilt(ss.butter(o,f,'lp',fs=SR,output='sos'),x)
def hp(x,f,o=4): return ss.sosfilt(ss.butter(o,f,'hp',fs=SR,output='sos'),x)
def bp(x,a,b,o=2): return ss.sosfilt(ss.butter(o,[a,b],'bp',fs=SR,output='sos'),x)
def verb(x,dur=2.5,mix=0.35):
    n=t(dur); ir=rng.standard_normal(len(n))*np.exp(-n*3.2/dur*2.3); ir=lp(ir,6000)
    w=ss.fftconvolve(x,ir)[:len(x)+len(ir)-1]; w=norm(w,0)*np.max(np.abs(x))
    y=np.zeros(len(w)); y[:len(x)]+=x*(1-mix); return y+w*mix
def sweep_noise(d,f0,f1,q=0.5):
    """Noise through a moving bandpass, f0->f1 (log)."""
    n=rng.standard_normal(int(d*SR)); out=np.zeros_like(n); blk=512
    fs=np.geomspace(f0,f1,len(n)//blk+1)
    zi=None
    for i,f in enumerate(fs):
        s=slice(i*blk,(i+1)*blk)
        if s.start>=len(n): break
        lo,hi=max(20,f*(1-q)),min(SR/2-100,f*(1+q))
        sos=ss.butter(2,[lo,hi],'bp',fs=SR,output='sos')
        if zi is None: zi=np.zeros((sos.shape[0],2))
        out[s],zi=ss.sosfilt(sos,n[s],zi=zi)
    return out
def stereo(x,w=0.25):
    d=int(0.012*SR); r=np.concatenate([np.zeros(d),x[:-d]])
    return np.stack([x*(1-w)+r*w, r*(1-w)+x*w],1)
def save(name,x,db=-1):
    if x.ndim==1: x=stereo(x)
    x=x/np.max(np.abs(x))*10**(db/20)
    fade=int(0.004*SR); x[:fade]*=np.linspace(0,1,fade)[:,None]; x[-fade*4:]*=np.linspace(1,0,fade*4)[:,None]
    sf.write(os.path.join(OUT,name),x.astype(np.float32),SR,subtype='PCM_24'); print(name,round(len(x)/SR,2),"s")

# Riser: noise sweep up + rising detuned saw, length L, peaks at end
def riser(L):
    n=sweep_noise(L,300,9000,0.6); tt=t(L)
    f=np.geomspace(110,880,len(tt)); ph=2*np.pi*np.cumsum(f)/SR
    tone=sum(ss.sawtooth(ph*k) for k in (1,1.007,0.993))/3; tone=lp(tone,5000)
    env=(tt/L)**2.2
    trem=1+0.35*np.sin(2*np.pi*np.cumsum(np.geomspace(4,22,len(tt)))/SR)
    return (n*1.0+tone*0.35)*env*trem
save("riser_2s.wav",riser(2.0)); save("riser_3s.wav",riser(3.0))
# Reverse cymbal / suck-in
def revcym(L):
    n=hp(rng.standard_normal(int(L*SR)),3500); tt=t(L)
    x=n*np.exp(-tt*3.5)*(1+0.2*np.sin(2*np.pi*7*tt)); return verb(x,1.2,0.3)[:len(tt)][::-1]
save("reverse_cymbal_1s.wav",revcym(1.0)); save("reverse_cymbal_2s.wav",revcym(2.0))
# Impact: sub boom + body thump + noise crack + long verb tail
def impact(L=3.5,f0=95,f1=32,crack=0.6):
    tt=t(L); f=f1+(f0-f1)*np.exp(-tt*9); boom=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*1.6)
    body=lp(rng.standard_normal(len(tt)),900)*np.exp(-tt*14)*0.9
    cr=hp(rng.standard_normal(len(tt)),2500)*np.exp(-tt*38)*crack
    x=np.tanh(1.6*(boom*1.1+body+cr)); return verb(x,2.8,0.25)[:len(tt)]
save("impact_cinematic.wav",impact()); save("impact_big_drop.wav",impact(5.0,110,28,0.9))
save("impact_soft.wav",impact(2.5,80,40,0.25)*0.7)
# Sub drop
tt=t(2.5); f=np.geomspace(90,26,len(tt)); x=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*1.1)
save("sub_drop.wav",np.tanh(1.3*x))
# Whooshes (fast pass-by)
def whoosh(L,f0,f1):
    x=sweep_noise(L,f0,f1,0.7); tt=t(L); env=np.sin(np.pi*np.clip(tt/L,0,1))**3
    pan=np.linspace(-1,1,len(tt)); x=x*env
    return np.stack([x*(1-pan)/2+x*0.2,x*(1+pan)/2+x*0.2],1)
save("whoosh_fast.wav",whoosh(0.6,700,5000)); save("whoosh_slow.wav",whoosh(1.4,300,3500))
save("whoosh_down.wav",whoosh(1.0,5000,400))
# Downlifter (after drop / transitions)
L=2.0; x=sweep_noise(L,8000,250,0.6)*np.exp(-t(L)*1.5); save("downlifter.wav",verb(x,1.5,0.3))
# Glitch stutter (digital chirps)
L=0.5; tt=t(L); g=np.zeros(len(tt))
for i in range(10):
    s=int(i*0.05*SR); n=int(0.03*SR); fr=rng.uniform(400,4000)
    g[s:s+n]+=np.sign(np.sin(2*np.pi*fr*tt[:n]))*0.6+rng.standard_normal(n)*0.4
save("glitch_stutter.wav",bp(g,300,9000),-4)
# Tension drone / heartbeat sub for silences
L=3.0; tt=t(L); d=sum(np.sin(2*np.pi*f*tt) for f in (41,41.6,82.4))/3
d=d*np.minimum(tt/1.0,1)*(1+0.5*np.sin(2*np.pi*1.8*tt))
save("tension_drone.wav",lp(np.tanh(2*d),400))
# Camera-flash / light-hit (bright tick + shimmer)
L=1.2; tt=t(L); x=hp(rng.standard_normal(len(tt)),5000)*np.exp(-tt*9)+np.sin(2*np.pi*2400*tt)*np.exp(-tt*25)*0.3
save("light_hit.wav",verb(x,1.0,0.4)[:len(tt)],-3)
