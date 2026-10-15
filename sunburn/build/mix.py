"""Render the 40s audio mix exactly as laid out in the Premiere sequence."""
import numpy as np, soundfile as sf, subprocess, os
from timeline import *
SR=48000; N=int(DUR*SR)
def load(path, ss, dur):
    raw=subprocess.run(["ffmpeg","-v","error","-ss",str(ss),"-t",str(dur),"-i",path,"-f","f32le","-ac","2","-ar",str(SR),"-"],capture_output=True).stdout
    return np.frombuffer(raw,np.float32).reshape(-1,2)
mix=np.zeros((N,2))
for i,s in enumerate(SONGS):
    keys=song_gain_keys(i); a=keys[0][0]; b=keys[-1][0]
    x=load(os.path.join(PROJECT,"music",s["file"]), s["src_in"]+(a-s["start"]), b-a)
    tt=a+np.arange(len(x))/SR
    g=np.interp(tt,[k[0] for k in keys],[k[1] for k in keys])
    i0=int(a*SR); n=min(len(x),N-i0); mix[i0:i0+n]+=x[:n]*g[:n,None]*10**(s["gain_db"]/20)
for f,t0,db in SFX:
    x,sr=sf.read(os.path.join(PROJECT,"sfx",f)); i0=int(t0*SR); n=min(len(x),N-i0)
    mix[i0:i0+n]+=x[:n]*10**(db/20)
# gentle bus glue: soft clip + normalize to -1 dBFS peak
mix=np.tanh(mix*1.1)/np.tanh(1.1); mix*=10**(-1/20)/np.max(np.abs(mix))
sf.write(os.path.join(ROOT,"build","mix_preview.wav"),mix.astype(np.float32),SR,subtype="PCM_24")
print("mix written",mix.shape, "peak", np.abs(mix).max())
