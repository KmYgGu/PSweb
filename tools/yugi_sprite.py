from PIL import Image
U='/workspace/uploads/'; A='/workspace/battle-sim/assets/yugi/'
def trim(im): return im.crop(im.split()[3].point(lambda v:255 if v>16 else 0).getbbox())
def fit(im,h): im=trim(im); return im.resize((round(im.width*h/im.height),h),Image.LANCZOS)
def clean(im):
    r,g,b,a=im.split(); a=a.point(lambda v:0 if v<40 else (255 if v>200 else v)); im.putalpha(a); return im
im=Image.open(U+'yugi_src.png').convert('RGBA'); im.save(A+'src.png')
H=150
fr=clean(fit(im.crop((0,0,760,im.height)),H)); bk=clean(fit(im.crop((770,0,im.width,im.height)),H))
fr.save(A+'front.png'); bk.save(A+'back.png')
im.crop((250,195,580,525)).resize((96,96),Image.LANCZOS).save(A+'portrait.png')
print(fr.size,bk.size)
