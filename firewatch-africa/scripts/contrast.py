import sys
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
bgs={'bg':'#0A0F15','surface1':'#111922','surface2':'#17212C','surface3':'#1E2A37'}
fgs={'text':'#ECE7DE','text2':'#9DACBD','muted':'#7A8A9C','orange':'#F28C28','orange300':'#FFB067','red':'#F0585D','cyan':'#4CC9F0','forest300':'#6CC79A','forest':'#2F8F62','amber':'#F2B53A','violet':'#B39DFA'}
for fn,f in fgs.items():
    print(fn.ljust(10),' '.join(f"{bn}:{cr(f,b):.2f}" for bn,b in bgs.items()))
# light
lb={'lbg':'#F5F2EC','lsurf':'#FFFFFF'}
lf={'ltext':'#14202B','ltext2':'#4A5A6A','lmuted':'#5E6B78','lorange':'#B4560A','lred':'#B4232A','lcyan':'#0B6E99','lforest':'#1E6B47'}
for fn,f in lf.items():
    print(fn.ljust(10),' '.join(f"{bn}:{cr(f,b):.2f}" for bn,b in lb.items()))
print('text on orange btn', cr('#0A0F15','#F28C28'))
