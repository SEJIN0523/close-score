# Isolated browser fixtures: generated poses follow real ledger calculations.
import argparse,json,pathlib,threading,urllib.request
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--site',default='/tmp/close-score-sd-preview');p.add_argument('--url');p.add_argument('--output',default='/tmp/close-score-companion-results');p.add_argument('--https-via-system-trust',action='store_true');args=p.parse_args()
output=pathlib.Path(args.output);output.mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=args.site,**kw)
 def log_message(self,*a):pass
server=None
if args.url:base=args.url
else:
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for label,delta,expected in [('empty',None,'guide'),('profit',-10000,'happy'),('loss',10000,'sad'),('flat',0,'guide')]:
  context=browser.new_context(viewport={'width':412,'height':915},service_workers='block')
  if args.https_via_system_trust:
   origin=urlsplit(base)
   def verified_fetch(route):
    request=route.request
    if request.method!='GET' or urlsplit(request.url).netloc!=origin.netloc:route.abort();return
    with urllib.request.urlopen(urllib.request.Request(request.url,headers={'Accept-Encoding':'identity','User-Agent':'close-score-companion-check'}),timeout=30) as r:
     route.fulfill(status=r.status,headers={k:v for k,v in r.headers.items() if k.lower() in ['content-type','cache-control']},body=r.read())
   context.route(origin.scheme+'://'+origin.netloc+'/**',verified_fetch)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base);page.wait_for_selector('#todayCount:not(:empty)')
  data=page.evaluate('async()=>{const d=await(await fetch("data.json")).json();return {date:d.META.asOf,stock:d.ROWS.find(r=>r.k===d.META.recs[0])}}')
  stock=data['stock'];logs=[];cash=[]
  if delta is not None:
   logs=[{'id':1,'code':stock['k'],'side':'buy','date':data['date'],'price':stock['p']+delta,'qty':1}]
   cash=[{'id':1,'date':data['date'],'type':'dep','amt':100000000,'memo':'Isolated companion fixture'}]
  page.evaluate('''v=>{localStorage.setItem('close-score-log',JSON.stringify(v.logs));localStorage.setItem('close-score-cash',JSON.stringify(v.cash));localStorage.setItem('close-score-theme','blossom');localStorage.setItem('close-score-tab','todo')}''',{'logs':logs,'cash':cash})
  page.reload();page.wait_for_selector('#todayCount:not(:empty)')
  buddy=page.locator('#p-hold [data-buddy]');assert buddy.get_attribute('data-pose')==expected,(label,'wrong P&L reaction')
  if delta is not None:assert ('+10,000' if delta<0 else '-10,000' if delta>0 else '0원') in page.locator('#p-hold [data-buddy-caption]').inner_text()
  before=page.evaluate('Object.fromEntries(Object.entries(localStorage).filter(([k])=>/^close-score-(log|cash|cfg|watch|track|equity)$/.test(k)))')
  for width in [320,412,1024]:
   page.set_viewport_size({'width':width,'height':915})
   for tab in ['todo','hold','stat','rec','watch']:
    page.locator('#t-'+tab).click()
    assert page.locator('#p-'+tab+' [data-buddy]').get_attribute('data-pose')==({'todo':'guide','rec':'reading','watch':'welcome'}.get(tab,expected))
    assert page.locator('#p-'+tab+' [data-buddy]').get_attribute('data-art')==('portrait' if tab in ['hold','stat'] else 'scene')
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),(label,width,tab,'overflow')
    if tab in ['todo','hold','stat','rec','watch']:page.screenshot(path=str(output/f'{width}-{label}-{tab}.png'))
  page.set_viewport_size({'width':412,'height':915});page.locator('#t-hold').click()
  buddy.click();assert buddy.get_attribute('data-pose')=='guide'
  assert buddy.get_attribute('data-art')=='scene'
  assert '매매 기록' in page.locator('#p-hold [data-buddy-message]').inner_text()
  page.wait_for_timeout(4400);assert buddy.get_attribute('data-pose')==expected
  page.locator('#themeBtn').click()
  for art,poses in [('scene',['guide','reading','welcome','celebrate']),('portrait',['guide','happy','sad','celebrate']),('mini',['guide','happy','sad','celebrate'])]:
   page.locator('[data-buddy-art-choice='+art+']').click()
   for pose in poses:
    page.locator('[data-buddy-preview='+pose+']').click();assert page.locator('#buddyDemo').get_attribute('data-pose')==pose
    assert page.locator('#buddyDemo').get_attribute('data-art')==art
    assert buddy.get_attribute('data-pose')==expected,'preview changed actual financial state'
   if label=='profit':page.screenshot(path=str(output/f'preview-{art}.png'))
  page.screenshot(path=str(output/f'{label}-pose-picker.png'));page.keyboard.press('Escape')
  after=page.evaluate('Object.fromEntries(Object.entries(localStorage).filter(([k])=>/^close-score-(log|cash|cfg|watch|track|equity)$/.test(k)))')
  assert before==after,'character interaction changed investment data'
  if label=='profit':
   page.locator('#t-hold').click();page.locator('#manualEntry').click()
   page.locator('#fName').fill(stock['n']+' '+stock['k']);page.locator('#fPrice').fill('-1');page.locator('#fQty').fill('1');page.locator('#fAdd').click()
   assert buddy.get_attribute('data-pose')=='happy','failed save celebrated'
   page.emulate_media(reduced_motion='reduce')
   page.locator('#fPrice').fill(str(int(stock['p'])));page.locator('#fAdd').click()
   assert buddy.get_attribute('data-pose')=='celebrate','successful save did not celebrate'
   assert page.locator('#p-hold [data-buddy]').evaluate('(el)=>getComputedStyle(el).animationName')=='none'
   assert page.locator('#toast').is_visible()
   assert page.locator('#toast').evaluate('(el)=>getComputedStyle(el,"::before").backgroundPosition')=='100% 100%'
   page.screenshot(path=str(output/'saved-reaction.png'))
   assert json.loads(page.evaluate('localStorage.getItem("close-score-cash")'))==cash,'celebration changed ledger'
   page.wait_for_timeout(4400);assert buddy.get_attribute('data-pose')=='happy'
  assert not errors,errors
  print(label+': mixed artwork, real P&L portraits, pointing help, three isolated previews and unchanged records passed.',flush=True)
  context.close()
 browser.close()
if server:server.shutdown()
