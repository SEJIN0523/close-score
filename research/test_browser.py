# Fresh browser context: test records never touch the user's browser data.
# Requires Python Playwright and Chromium. Use --sample-image with the supplied
# 10.22 Toss screenshot (10 trades). --site serves a built app; --url tests a deployment.
import threading,json,pathlib,time,argparse,urllib.request
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser()
parser.add_argument('--site',default='/tmp/close-score-preview')
parser.add_argument('--url')
parser.add_argument('--sample-image',required=True)
parser.add_argument('--output',default='/tmp/close-score-browser-results')
parser.add_argument('--chromium',default='/usr/bin/chromium')
parser.add_argument('--https-via-system-trust',action='store_true',help='Fetch HTTPS test assets with verified system trust when Chromium lacks the environment proxy CA')
args=parser.parse_args()
ROOT=args.site
OUTPUT=args.output
pathlib.Path(OUTPUT).mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw): super().__init__(*a,directory=ROOT,**kw)
 def log_message(self,*a): pass
server=None
if args.url: base=args.url
else:
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
 threading.Thread(target=server.serve_forever,daemon=True).start()
 base=f'http://127.0.0.1:{server.server_port}/'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 context=browser.new_context(viewport={'width':412,'height':915},device_scale_factor=1,service_workers='block')
 if args.https_via_system_trust:
  from urllib.parse import urlsplit
  origin=urlsplit(base)
  def verified_fetch(route):
   request=route.request
   # No TLS bypass: urllib verifies the certificate using the managed system trust.
   if request.method!='GET' or urlsplit(request.url).netloc!=origin.netloc:
    route.abort();return
   req=urllib.request.Request(request.url,headers={'Accept-Encoding':'identity','User-Agent':'close-score-browser-verification'})
   with urllib.request.urlopen(req,timeout=30) as response:
    body=response.read()
    headers={k:v for k,v in response.headers.items() if k.lower() in ['content-type','cache-control','access-control-allow-origin']}
    route.fulfill(status=response.status,headers=headers,body=body)
  context.route(origin.scheme+'://'+origin.netloc+'/**',verified_fetch)
 page=context.new_page(); errors=[]
 page.on('pageerror',lambda e: errors.append(str(e)))
 page.goto(base); page.wait_for_selector('#todayCount:not(:empty)')
 # Use actual available funds for execution tests; the initial empty-device view is an example.
 page.evaluate('localStorage.setItem("close-score-cash",JSON.stringify([{id:1,date:"2026-10-01",type:"dep",amt:100000000,memo:"Browser test"}]))')
 page.reload();page.wait_for_selector('#todayCount:not(:empty)')
 rec_codes=page.evaluate('async () => (await (await fetch("data.json")).json()).META.recs')
 print('Loaded',page.title(),flush=True)
 def check_alignment():
  assert page.evaluate('''() => {
   const title=document.querySelector('.top h1').getBoundingClientRect(), refresh=document.getElementById('refreshBtn').getBoundingClientRect(), theme=document.getElementById('themeBtn').getBoundingClientRect();
   return title.right<=refresh.left && refresh.right<=theme.left && Math.abs(title.top-refresh.top)<12;
  }'''),'header controls out of order'
  assert page.evaluate('''() => [...document.querySelectorAll('.row > summary,.row > details > summary')].filter(s=>s.getBoundingClientRect().width).every(s=>{
   const nm=s.querySelector('.nm').getBoundingClientRect(),px=s.querySelector('.px').getBoundingClientRect(),sc=s.querySelector('.sc').getBoundingClientRect(),sg=s.querySelector('.sg').getBoundingClientRect();
   return nm.right<=px.left+1 && sc.right<=sg.left+1;
  })'''),'stock name/price or score/signal overlap'
  assert page.evaluate('''() => [...document.querySelectorAll('.recommendation-row > summary')].filter(s=>s.getBoundingClientRect().width).every(s=>{
   const name=s.querySelector('.rec-stock').getBoundingClientRect(),price=s.querySelector('.rec-price').getBoundingClientRect(),score=s.querySelector('.rec-score').getBoundingClientRect();
   return name.right<=price.left && price.right<=score.left && Math.abs(name.top-price.top)<5;
  })'''),'recommendation columns overlap'
 for width in [320,412,1024]:
  page.set_viewport_size({'width':width,'height':915})
  for tab in ['todo','rec','hold','watch','stat']:
   page.locator('#t-'+tab).click(); page.wait_for_timeout(100)
   overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
   assert not overflow,(width,tab,'horizontal overflow')
   check_alignment()
   if tab=='rec':
    assert page.locator('#recList > details').evaluate_all('(rows) => rows.map(r=>r.dataset.code)')==rec_codes,'recommendation order changed'
    assert page.locator('#recList').evaluate('(el) => el.getBoundingClientRect().height')<=len(rec_codes)*58+1,'recommendations too tall'
   page.screenshot(path=f'{OUTPUT}/{width}-{tab}.png',full_page=True)
  print(f'{width}px: all five tabs fit',flush=True)
 page.set_viewport_size({'width':412,'height':915});page.locator('#t-rec').click()
 rec_rows=page.locator('#recList > details')
 rec_rows.nth(0).locator('summary').click()
 rec_rows.nth(0).locator('[data-chart] svg').wait_for(state='visible')
 assert rec_rows.nth(0).locator('[data-copy]').is_visible()
 assert rec_rows.nth(0).locator('[data-star]').is_visible()
 assert rec_rows.nth(0).locator('.act').is_visible()
 page.screenshot(path=f'{OUTPUT}/412-rec-expanded.png',full_page=True)
 rec_rows.nth(1).locator('summary').click()
 assert page.locator('#recList > details[open]').count()==1,'multiple recommendations expanded'
 rec_rows.nth(1).locator('[data-recbuy]').click()
 assert page.locator('#p-hold').is_visible() and page.locator('#fName').is_visible(),'recommendation trade shortcut missing'
 rec_rows.nth(1).evaluate('(el)=>el.open=false')
 page.evaluate('document.getElementById("tradeEntry").open=false;document.getElementById("holdTools").open=false')
 print('Compact recommendations preserve order, open one chart at a time and fill the trade form.',flush=True)
 page.locator('#t-todo').click()
 assert page.locator('#todayCard').get_attribute('open') is not None
 page.locator('#todayCard > summary').click();assert page.locator('#todayCard').get_attribute('open') is None
 page.locator('#todayCard > summary').click()
 forms=page.locator('#todoA .todo-exec'); print('Direct forms',forms.count(),flush=True)
 if forms.count():
  item=page.locator('#todoA .todo-item').first;item.locator('summary').click()
  form=item.locator('form');form.locator('[name=price]').fill('101,111');form.locator('[name=qty]').fill('1');form.locator('[type=submit]').click()
  logs=json.loads(page.evaluate('localStorage.getItem("close-score-log")'));assert logs[-1]['price']==101111 and logs[-1]['qty']==1
 page.locator('#t-hold').click();page.locator('#holdTools > summary').click();page.locator('#logBox > summary').click()
 if page.locator('#logList .log-item').count():
  page.locator('#logList .log-item').first.locator('summary').click()
  price=page.locator('#logList [data-f=price]').first;price.fill('102222');price.dispatch_event('change')
  assert json.loads(page.evaluate('localStorage.getItem("close-score-log")'))[-1]['price']==102222
 print('Direct execution and mobile edit passed',flush=True)
 # Daily plans keep their quantity while real fills accumulate, including identical separate fills.
 page.locator('#t-todo').click()
 execution=page.locator('#todoA .todo-item').first
 plan_id=execution.get_attribute('data-plan')
 plan=page.evaluate('(id)=>JSON.parse(localStorage.getItem("close-score-cfg")).planBook[id]',plan_id)
 assert plan['qty']>5 and execution.get_attribute('data-status')=='partial'
 if execution.get_attribute('open') is None: execution.locator('summary').click()
 assert execution.locator('[name=qty]').input_value()==str(plan['qty']-1)
 original_ledger=page.evaluate('localStorage.getItem("close-score-cash")')
 def fill_execution(qty,duplicate=False):
  form=page.locator('#todoA .todo-item').first.locator('form')
  form.locator('[name=price]').fill('102222');form.locator('[name=qty]').fill(str(qty))
  if duplicate: form.locator('[name=duplicate]').check()
  form.locator('[type=submit]').click()
 fill_execution(2);assert execution.get_attribute('data-status')=='partial'
 fill_execution(2,True)
 assert execution.locator('[name=qty]').input_value()==str(plan['qty']-5)
 frozen=page.evaluate('(id)=>JSON.parse(localStorage.getItem("close-score-cfg")).planBook[id]',plan_id)
 assert frozen==plan,'a partial fill changed the original daily target'
 cfg_before=page.evaluate('localStorage.getItem("close-score-cfg")')
 page.evaluate('''() => { window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="close-score-cfg")throw new DOMException("Test plan failure","QuotaExceededError");return window.originalSetItem.call(this,k,v);};}''')
 execution.locator('[data-plan-cancel]').click()
 assert page.evaluate('localStorage.getItem("close-score-cfg")')==cfg_before
 assert execution.get_attribute('data-status')=='partial'
 page.evaluate('Storage.prototype.setItem=window.originalSetItem;delete window.originalSetItem')
 execution.locator('[data-plan-cancel]').click();assert execution.get_attribute('data-status')=='cancelled'
 assert execution.locator('form').count()==0
 page.reload();page.wait_for_selector('#todayCount:not(:empty)')
 execution=page.locator('#todoA .todo-item').first
 if execution.get_attribute('open') is None: execution.locator('summary').click()
 assert execution.get_attribute('data-status')=='cancelled'
 execution.locator('[data-plan-cancel]').click();assert execution.get_attribute('data-status')=='partial'
 page.screenshot(path=f'{OUTPUT}/412-execution-partial.png',full_page=True)
 fill_execution(plan['qty']-5+2)
 assert execution.get_attribute('data-status')=='overfilled'
 assert '계획보다 2주' in execution.inner_text()
 assert page.evaluate('localStorage.getItem("close-score-cash")')==original_ledger
 print('Frozen daily plans, partial/identical/extra fills, cancellation persistence and plan-write rollback passed.',flush=True)
 page.locator('#t-hold').click()
 page.locator('#ocrOpen').click()
 page.locator('#ocrFiles').set_input_files(args.sample_image)
 page.locator('#ocrDate').fill('2026-10-22');page.locator('#ocrRun').click()
 page.wait_for_function('!document.getElementById("ocrRun").disabled',timeout=90000)
 print('OCR status:',page.locator('#ocrStatus').inner_text(),flush=True)
 rows=page.locator('.ocr-row');assert rows.count()==10,rows.count()
 assert page.locator('#ocrCommit').is_disabled()
 page.screenshot(path=f'{OUTPUT}/412-ocr.png',full_page=True)
 before=page.evaluate('localStorage.getItem("close-score-log")');page.locator('#ocrClose').click()
 assert page.evaluate('localStorage.getItem("close-score-log")')==before
 assert not errors,errors
 print('Actual browser OCR recognized 10 rows; cancel did not save.',flush=True)
 page.locator('#ocrOpen').click()
 image=args.sample_image
 page.locator('#ocrFiles').set_input_files([image,image]);page.locator('#ocrDate').fill('2026-10-22');page.locator('#ocrRun').click()
 page.wait_for_function('!document.getElementById("ocrRun").disabled',timeout=90000)
 assert page.locator('.ocr-row').count()==20
 assert '중복' in page.locator('#ocrResults').inner_text()
 codes=['240810','031980','005930','000500','353200','033780','055550','010950','086790','105560']
 quantities=[6,3,2,2,5,3,7,4,5,4]
 prices=[101500,174100,220500,249000,135500,194400,91500,141150,121300,160000]
 for i in range(20):
  row=page.locator('#ocr-row-'+str(i))
  if i>=9: row.locator('[data-of=included]').uncheck();continue
  row.locator('[data-of=name]').fill(codes[i]);row.locator('[data-of=qty]').fill(str(quantities[i]));row.locator('[data-of=price]').fill(str(prices[i]))
 assert page.evaluate('localStorage.getItem("close-score-log")')==before
 assert page.locator('#ocrCommit').is_disabled()
 page.locator('#ocrReviewed').check();assert page.locator('#ocrCommit').is_enabled()
 ledger=page.evaluate('localStorage.getItem("close-score-cash")')
 page.locator('#ocrCommit').click()
 logs=json.loads(page.evaluate('localStorage.getItem("close-score-log")'))
 assert len(logs)==len(json.loads(before))+9
 assert ledger==page.evaluate('localStorage.getItem("close-score-cash")')
 # Use a funded account and chart history in this isolated browser only.
 page.evaluate('''() => {
  localStorage.setItem('close-score-cash',JSON.stringify([{id:1,date:'2026-10-01',type:'dep',amt:100000000,memo:'Browser test'}]));
  const equity={};for(let i=1;i<=20;i++)equity['2026-10-'+String(i).padStart(2,'0')]={t:100000000+i*100000,p:100000000};
  localStorage.setItem('close-score-equity',JSON.stringify(equity));
 }''')
 page.reload();page.wait_for_selector('#todayCount:not(:empty)',state='attached')
 page.locator('#t-hold').click()
 holding_rows=page.locator('#holdList > .holding-row')
 assert holding_rows.count()==10
 for width in [320,412]:
  page.set_viewport_size({'width':width,'height':915})
  assert page.locator('#holdList > details[open]').count()==0
  assert page.locator('#holdList').bounding_box()['height']<=10*52+2
  assert holding_rows.locator(':scope > summary').evaluate_all('(rows)=>rows.every(r=>r.getBoundingClientRect().height<=52)')
  assert holding_rows.locator('.holding-name').evaluate_all('(rows)=>rows.every(r=>getComputedStyle(r).whiteSpace==="nowrap")')
  page.screenshot(path=f'{OUTPUT}/{width}-hold-compact.png',full_page=True)
 holding_rows.first.locator('summary').first.click()
 holding_rows.first.locator('.pchart svg').wait_for(state='visible')
 holding_rows.nth(1).locator('summary').first.click()
 assert page.locator('#holdList > details[open]').count()==1
 assert holding_rows.first.get_attribute('open') is None
 holding_rows.nth(1).locator('.pchart svg').wait_for(state='visible')
 holding_rows.nth(1).locator('[data-fill]').last.click()
 assert page.locator('#tradeEntry').get_attribute('open') is not None
 assert page.locator('#fName').is_visible() and page.locator('#fName').input_value()
 page.locator('#holdTools > summary').click()
 if page.locator('#holdList > details[open]').count(): page.locator('#holdList > details[open] > summary').click()
 page.locator('#ledgerEntry').click();assert page.locator('#cAmt').is_visible()
 page.locator('#manualEntry').click();assert page.locator('#fName').is_visible()
 assert page.locator('#cfgBox').get_attribute('open') is None
 page.locator('#holdTools > summary').click()
 page.locator('#t-stat').click()
 for view in ['assets','profit','months','recs']:
  page.locator('#st-'+view).click()
  assert page.locator('#sv-'+view).is_visible()
  assert page.locator('[data-stat-panel]:visible').count()==1
  if view in ['assets','profit']: page.locator('#'+('eqChart' if view=='assets' else 'plChart')+' svg').wait_for(state='visible')
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
 page.locator('#st-assets').click();page.locator('#st-assets').press('ArrowRight')
 assert page.locator('#st-profit').get_attribute('aria-selected')=='true'
 page.locator('#st-assets').click()
 for width in [320,412]:
  page.set_viewport_size({'width':width,'height':915})
  assert page.locator('#researchPanel').get_attribute('open') is None
  assert not page.locator('#simChart').is_visible()
  height=page.evaluate('document.documentElement.scrollHeight')
  assert height<=1050,(width,'statistics overview too tall',height)
  print(f'{width}px: ten holdings <=520px; statistics page {height}px including navigation space',flush=True)
  page.screenshot(path=f'{OUTPUT}/{width}-stat-compact.png',full_page=True)
 page.locator('#allocationPanel > summary').click();page.locator('#donut svg').wait_for(state='visible')
 page.locator('#researchPanel > summary').click()
 assert page.locator('#allocationPanel').get_attribute('open') is None
 page.locator('#p-sim > summary').click();page.locator('#simChart svg').wait_for(state='visible')
 assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
 page.locator('.research-item').nth(1).locator('summary').first.click()
 assert page.locator('.research-item[open]').count()==1
 page.locator('#researchPanel > summary').click()
 print('Single-line holdings, one-card expansion, form shortcuts, four statistics views, lazy chart rendering and compact page heights passed.',flush=True)
 for width in [320,412]:
  page.set_viewport_size({'width':width,'height':915})
  for tab in ['todo','rec','hold','watch','stat']:
   page.locator('#t-'+tab).click()
   assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'),(width,tab,'populated overflow')
   check_alignment()
 page.locator('#t-hold').click()
 page.screenshot(path=f'{OUTPUT}/412-hold-populated.png',full_page=True)
 assert not errors,errors
 print('Two-image OCR, duplicate detection, correction, exclusion, 9-row batch registration and populated mobile layouts passed.',flush=True)
 # Readability in dark mode, including populated holdings and long stock names.
 page.evaluate('document.documentElement.dataset.theme="dark";localStorage.setItem("close-score-theme","dark")')
 for width in [320,412]:
  page.set_viewport_size({'width':width,'height':915})
  for tab in ['todo','rec','hold','watch','stat']:
   page.locator('#t-'+tab).click()
   assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'),(width,tab,'dark overflow')
   check_alignment()
   page.screenshot(path=f'{OUTPUT}/{width}-{tab}-dark.png',full_page=True)
 page.evaluate('document.documentElement.dataset.theme="light"')
 page.locator('#t-rec').click();page.locator('#recList > details > summary').first.click();page.locator('#recList [data-star]').first.click()
 page.locator('#t-watch').click()
 page.evaluate('localStorage.setItem("close-score-gh","test-connection");localStorage.setItem("unrelated-app-key","keep-me")')
 snapshot=lambda: page.evaluate('Object.fromEntries(Object.entries(localStorage))')
 before_reset=snapshot()
 page.locator('#resetOpen').click();assert page.locator('#resetCommit').is_disabled()
 page.locator('#resetPhrase').fill('초기');assert page.locator('#resetCommit').is_disabled()
 page.screenshot(path=f'{OUTPUT}/412-reset.png',full_page=True)
 with page.expect_download() as download:
  page.locator('#resetBackup').click()
 backup=json.loads(pathlib.Path(download.value.path()).read_text())
 assert len(backup['log'])==len(logs) and len(backup['watch'])==1
 assert backup['cfg']['planBook'][plan_id]['qty']==plan['qty']
 assert snapshot()==before_reset
 page.locator('#resetCancel').click();assert snapshot()==before_reset
 page.locator('#resetOpen').click();page.keyboard.press('Escape');assert snapshot()==before_reset
 page.locator('#resetOpen').click();page.locator('#resetPhrase').fill('초기화')
 # Simulate a mid-write failure: the earlier keys must be rolled back.
 page.evaluate('''() => { window.originalSetItem=Storage.prototype.setItem;let fail=true;Storage.prototype.setItem=function(k,v){if(k==="close-score-cash"&&fail){fail=false;throw new DOMException("Test storage failure","QuotaExceededError");}return window.originalSetItem.call(this,k,v);};}''')
 page.locator('#resetCommit').click();assert '못했습니다' in page.locator('#resetMsg').inner_text()
 assert snapshot()==before_reset
 page.evaluate('Storage.prototype.setItem=window.originalSetItem;delete window.originalSetItem')
 page.locator('#resetCommit').click()
 reset_state=snapshot()
 assert json.loads(reset_state['close-score-log'])==[] and json.loads(reset_state['close-score-cash'])==[]
 assert json.loads(reset_state['close-score-track'])=={} and json.loads(reset_state['close-score-equity'])=={}
 assert json.loads(reset_state['close-score-cfg'])=={'cash':0,'slots':10}
 assert json.loads(reset_state['close-score-watch'])==backup['watch']
 for key in ['close-score-theme','close-score-gh','unrelated-app-key']: assert reset_state[key]==before_reset[key]
 page.reload();page.wait_for_selector('#resetOpen')
 assert json.loads(page.evaluate('localStorage.getItem("close-score-log")'))==[]
 page.locator('#resetOpen').click();page.locator('#resetWatch').check();page.locator('#resetPhrase').fill('초기화');page.locator('#resetCommit').click()
 assert json.loads(page.evaluate('localStorage.getItem("close-score-watch")'))==[]
 # Restore the unchanged backup envelope in a fresh device context, with optional plan metadata.
 restored=browser.new_context(viewport={'width':412,'height':915},service_workers='block')
 if args.https_via_system_trust: restored.route(origin.scheme+'://'+origin.netloc+'/**',verified_fetch)
 other=restored.new_page();other.goto(base);other.wait_for_selector('#todayCount:not(:empty)')
 other.locator('#t-watch').click()
 other.locator('#impFile').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
 other.wait_for_function('JSON.parse(localStorage.getItem("close-score-log")).length>0')
 assert json.loads(other.evaluate('localStorage.getItem("close-score-log")'))==backup['log']
 assert json.loads(other.evaluate('localStorage.getItem("close-score-cash")'))==backup['cash']
 assert json.loads(other.evaluate('localStorage.getItem("close-score-cfg")'))['planBook'][plan_id]==backup['cfg']['planBook'][plan_id]
 other.locator('#t-hold').click();other.locator('#manualEntry').click()
 other.locator('#fName').fill(plan['code']);other.locator('#fPrice').fill('12.5');other.locator('#fQty').fill('2')
 other.locator('#fDate').fill(plan['date']);other.locator('#fAdd').click()
 assert len(json.loads(other.evaluate('localStorage.getItem("close-score-log")')))==len(backup['log'])
 other.locator('#fPrice').fill('333333');other.locator('#fAdd').click()
 manual=json.loads(other.evaluate('localStorage.getItem("close-score-log")'))
 assert len(manual)==len(backup['log'])+1 and manual[-1]['price']==333333 and manual[-1]['qty']==2
 assert len({r['id'] for r in manual})==len(manual)
 assert json.loads(other.evaluate('localStorage.getItem("close-score-cash")'))==backup['cash']
 restored.close()
 legacy=browser.new_context(viewport={'width':412,'height':915},service_workers='block')
 if args.https_via_system_trust: legacy.route(origin.scheme+'://'+origin.netloc+'/**',verified_fetch)
 old=legacy.new_page();old.goto(base);old.wait_for_selector('#todayCount:not(:empty)');old.locator('#t-watch').click()
 old_backup={**backup,'cfg':{'cash':backup['cfg']['cash'],'slots':backup['cfg']['slots']}}
 old.locator('#impFile').set_input_files({'name':'legacy.json','mimeType':'application/json','buffer':json.dumps(old_backup).encode()})
 old.wait_for_function('JSON.parse(localStorage.getItem("close-score-log")).length>0')
 assert json.loads(old.evaluate('localStorage.getItem("close-score-log")'))==backup['log']
 assert json.loads(old.evaluate('localStorage.getItem("close-score-cash")'))==backup['cash']
 legacy.close()
 print('Plan-aware and legacy backups restore correctly; manual execution validates numbers, preserves the ledger and uses unique record IDs.',flush=True)
 assert not errors,errors
 print('Dark layouts, reset backup/cancel/Escape/confirmation, write-failure rollback, optional watch deletion and preservation of connection/theme/unrelated data passed.',flush=True)
 browser.close()
if server: server.shutdown()
