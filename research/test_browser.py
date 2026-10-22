# Fresh browser context: test records never touch the user's browser data.
# Requires Python Playwright and Chromium. Use --sample-image with the supplied
# 10.22 Toss screenshot (10 trades). --site serves a built app; --url tests a deployment.
import threading,json,pathlib,time,argparse
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser()
parser.add_argument('--site',default='/tmp/close-score-preview')
parser.add_argument('--url')
parser.add_argument('--sample-image',required=True)
parser.add_argument('--output',default='/tmp/close-score-browser-results')
parser.add_argument('--chromium',default='/usr/bin/chromium')
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
 page=context.new_page(); errors=[]
 page.on('pageerror',lambda e: errors.append(str(e)))
 page.goto(base); page.wait_for_selector('#todayCount:not(:empty)')
 print('Loaded',page.title(),flush=True)
 for width in [320,412,1024]:
  page.set_viewport_size({'width':width,'height':915})
  for tab in ['todo','rec','hold','watch','stat']:
   page.locator('#t-'+tab).click(); page.wait_for_timeout(100)
   overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
   assert not overflow,(width,tab,'horizontal overflow')
   page.screenshot(path=f'{OUTPUT}/{width}-{tab}.png',full_page=True)
  print(f'{width}px: all five tabs fit',flush=True)
 page.set_viewport_size({'width':412,'height':915});page.locator('#t-todo').click()
 assert page.locator('#todayCard').get_attribute('open') is not None
 page.locator('#todayCard > summary').click();assert page.locator('#todayCard').get_attribute('open') is None
 page.locator('#todayCard > summary').click()
 forms=page.locator('#todoA .todo-exec'); print('Direct forms',forms.count(),flush=True)
 if forms.count():
  item=page.locator('#todoA .todo-item').first;item.locator('summary').click()
  form=item.locator('form');form.locator('[name=price]').fill('101,111');form.locator('[name=qty]').fill('1');form.locator('[type=submit]').click()
  logs=json.loads(page.evaluate('localStorage.getItem("close-score-log")'));assert logs[-1]['price']==101111 and logs[-1]['qty']==1
 page.locator('#t-hold').click();page.locator('#logBox > summary').click()
 if page.locator('#logList .log-item').count():
  page.locator('#logList .log-item').first.locator('summary').click()
  price=page.locator('#logList [data-f=price]').first;price.fill('102222');price.dispatch_event('change')
  assert json.loads(page.evaluate('localStorage.getItem("close-score-log")'))[-1]['price']==102222
 print('Direct execution and mobile edit passed',flush=True)
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
 for width in [320,412]:
  page.set_viewport_size({'width':width,'height':915})
  for tab in ['todo','rec','hold','watch','stat']:
   page.locator('#t-'+tab).click()
   assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'),(width,tab,'populated overflow')
 page.locator('#t-hold').click()
 page.screenshot(path=f'{OUTPUT}/412-hold-populated.png',full_page=True)
 assert not errors,errors
 print('Two-image OCR, duplicate detection, correction, exclusion, 9-row batch registration and populated mobile layouts passed.',flush=True)
 browser.close()
if server: server.shutdown()
