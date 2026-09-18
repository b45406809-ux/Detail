#!/usr/bin/env python3
"""Generate Detail's six-slide Instagram feed and story carousel PDFs."""
from pathlib import Path
from urllib.request import urlopen
from fontTools.ttLib import TTFont as FontToolsTTFont
from fontTools.varLib.instancer import instantiateVariableFont
import pymupdf
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'marketing'/'generated'
FONT_CACHE=ROOT/'.cache'/'marketing-fonts'
OUT.mkdir(parents=True,exist_ok=True);FONT_CACHE.mkdir(parents=True,exist_ok=True)
FONT_SOURCES={'Manrope':('https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf',{'wght':800}),'DMSans':('https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf',{'wght':400,'opsz':18})}
for name,(url,axes) in FONT_SOURCES.items():
 variable=FONT_CACHE/f'{name}-variable.ttf';static=FONT_CACHE/f'{name}.ttf'
 if not static.exists():
  if not variable.exists(): variable.write_bytes(urlopen(url,timeout=30).read())
  font=FontToolsTTFont(variable);instantiateVariableFont(font,axes,inplace=True);font.save(static)
 pdfmetrics.registerFont(TTFont(name,str(static)))
PURPLE=HexColor('#3906D2'); DEEP=HexColor('#0D0A24'); INK=HexColor('#0F0B2E'); LAV=HexColor('#DDD5FD'); PALE=HexColor('#F0EDFE'); WHITE=HexColor('#FFFFFF'); MID=HexColor('#9580F7')
SLIDES=[
 ('THE NEXT ERA OF CLEAN','Pioneering on-demand cleaning in Zimbabwe.','Detail connects people who need a clean with local professionals ready to work.','01'),
 ('ONE APP. TWO WAYS TO SHINE.','House cleaning. Car cleaning.','Request the service you need, where you need it — without endless calls or guesswork.','02'),
 ('YOU STAY IN CONTROL','Post. Compare. Choose.','Share your request, review offers and choose the cleaner, timing and price that work for you.','03'),
 ('CLEANERS, THIS IS FOR YOU','Turn your standards into opportunity.','Join the cleaner waitlist, find nearby demand, submit your offers and build a reputation customers can trust.','04'),
 ('CLARITY AT EVERY STEP','Know who is coming. Follow the job.','Verified profiles, visible progress, protected payment records and two-way ratings — all in one place.','05'),
 ('BE EARLY. HELP SHAPE DETAIL.','Join the waitlist today.','Choose customer or cleaner access at detail.co.zw\nWhatsApp +263 71 488 5936','06'),
]

def round_rect(c,x,y,w,h,r,fill,stroke=None,width=1):
 c.setFillColor(fill); c.setStrokeColor(stroke or fill); c.setLineWidth(width); c.roundRect(x,y,w,h,r,fill=1,stroke=1 if stroke else 0)

def logo(c,x,y,size,color):
 c.saveState();s=size/120;c.setStrokeAlpha(1);c.setFillAlpha(1);c.setStrokeColor(color);c.setFillColor(color);c.setLineWidth(8*s);c.setLineCap(2);c.line(x+32*s,y+88*s,x+32*s,y+44*s)
 p=c.beginPath();p.moveTo(x+32*s,y+88*s);p.lineTo(x+60*s,y+88*s);p.curveTo(x+102*s,y+88*s,x+102*s,y+24*s,x+60*s,y+24*s);p.lineTo(x+32*s,y+24*s);c.drawPath(p,stroke=1,fill=0)
 p=c.beginPath();p.moveTo(x+50*s,y+72*s);p.lineTo(x+60*s,y+72*s);p.curveTo(x+81*s,y+72*s,x+81*s,y+40*s,x+60*s,y+40*s);p.lineTo(x+32*s,y+40*s);c.drawPath(p,stroke=1,fill=0);c.rect(x+42*s,y+48*s,8*s,16*s,stroke=0,fill=1);c.circle(x+100*s,y+28*s,6*s,stroke=0,fill=1);c.restoreState()

def text_lines(c,text,x,y,max_chars,size,leading,font='DMSans',color=INK):
 c.setFont(font,size);c.setFillColor(color);lines=[]
 for para in text.split('\n'):
  words=para.split();line=''
  for word in words:
   test=(line+' '+word).strip()
   if c.stringWidth(test,font,size) <= max_chars: line=test
   else:
    if line:lines.append(line)
    line=word
  if line:lines.append(line)
 for line in lines:c.drawString(x,y,line);y-=leading
 return y

def draw_slide(c,w,h,index,data):
 kicker,title,body,num=data; dark=index in (0,3,5); bg=DEEP if dark else PALE;c.setFillColor(bg);c.rect(0,0,w,h,fill=1,stroke=0)
 # oversize brand geometry and depth
 c.setFillColor(PURPLE if dark else LAV);c.circle(w*.94,h*.88,w*.34,fill=1,stroke=0);c.setFillColor(MID);c.setFillAlpha(.14);c.circle(w*.1,h*.12,w*.28,fill=1,stroke=0);c.setFillAlpha(1)
 margin=w*.075; logo(c,margin,h-margin-w*.065,w*.065,WHITE if dark else PURPLE);c.setFont('Manrope',w*.022);c.setFillColor(WHITE if dark else INK);c.drawString(margin+w*.075,h-margin-w*.02,'DETAIL')
 c.setFont('DMSans',w*.014);c.setFillColor(MID if dark else PURPLE);c.drawRightString(w-margin,h-margin-w*.015,f'{num} / 06')
 y=h*.69;c.setFont('DMSans',w*.018);c.setFillColor(MID if dark else PURPLE);c.drawString(margin,y,kicker);y-=h*.055
 y=text_lines(c,title,margin,y,w-margin*2,w*.064,w*.071,'Manrope',WHITE if dark else INK);y-=h*.035
 c.setFillColor(PURPLE);c.roundRect(margin,y,w*.12,h*.008,h*.004,fill=1,stroke=0);y-=h*.055
 text_lines(c,body,margin,y,w-margin*2,w*.027,w*.041,'DMSans',LAV if dark else HexColor('#625B85'))
 # contextual central art
 cy=h*.27
 if index==1:
  for j,label in enumerate(('HOUSE','CAR')):
   x=margin+j*w*.31;round_rect(c,x,cy,w*.27,h*.11,w*.025,WHITE, LAV);c.setFont('Manrope',w*.021);c.setFillColor(PURPLE);c.drawCentredString(x+w*.135,cy+h*.048,label)
 elif index==2:
  for j,label in enumerate(('POST','COMPARE','CHOOSE')):
   x=margin+j*w*.285;round_rect(c,x,cy,w*.24,h*.09,w*.02,WHITE if not dark else HexColor('#17133A'));c.setFont('Manrope',w*.016);c.setFillColor(PURPLE);c.drawCentredString(x+w*.12,cy+h*.04,label)
 elif index==3:
  round_rect(c,margin,cy,w-margin*2,h*.12,w*.03,HexColor('#17133A'),HexColor('#2A2456'));c.setFont('Manrope',w*.025);c.setFillColor(WHITE);c.drawString(margin+w*.04,cy+h*.065,'YOUR WORK. YOUR OFFER. YOUR GROWTH.');c.setFont('DMSans',w*.016);c.setFillColor(MID);c.drawString(margin+w*.04,cy+h*.032,'Cleaner early access is open on the waitlist.')
 elif index==4:
  labels=('PROFILE','TRACK','PAY','RATE')
  for j,label in enumerate(labels):
   x=margin+j*w*.215;c.setFillColor(PURPLE);c.circle(x+w*.065,cy+h*.06,w*.045,fill=1,stroke=0);c.setFont('DMSans',w*.013);c.setFillColor(INK);c.drawCentredString(x+w*.065,cy,label)
 elif index==5:
  round_rect(c,margin,cy,w-margin*2,h*.115,w*.055,PURPLE);c.setFont('Manrope',w*.027);c.setFillColor(WHITE);c.drawCentredString(w/2,cy+h*.05,'DETAIL.CO.ZW')
 c.setFont('DMSans',w*.012);c.setFillColor(MID if dark else HexColor('#625B85'));c.drawString(margin,h*.045,'© CATALYST LABS');c.drawRightString(w-margin,h*.045,'@DETAIL • ZIMBABWE')

def generate(name,w,h):
 c=canvas.Canvas(str(OUT/name),pagesize=(w,h),pageCompression=1)
 c.setTitle('Detail Instagram Carousel — Catalyst Labs');c.setAuthor('Catalyst Labs')
 for i,data in enumerate(SLIDES):draw_slide(c,w,h,i,data);c.showPage()
 c.save()

def render_pngs(pdf_name,directory):
 doc=pymupdf.open(OUT/pdf_name);target=OUT/directory;target.mkdir(exist_ok=True)
 for index,page in enumerate(doc):page.get_pixmap(alpha=False,dpi=72).save(target/f'detail-slide-{index+1:02}.png')

if __name__=='__main__':
 generate('detail-instagram-carousel-feed-4x5.pdf',1080,1350)
 generate('detail-instagram-carousel-story-9x16.pdf',1080,1920)
 render_pngs('detail-instagram-carousel-feed-4x5.pdf','feed-4x5-png')
 render_pngs('detail-instagram-carousel-story-9x16.pdf','story-9x16-png')
 print(f'Generated 4:5 and 9:16 carousel PDFs/PNGs in {OUT}.')
