"""Generate the bounded KRX session forecast; observed index sessions override it at build time.

Requires exchange-calendars==4.13.2. No Python dependency is needed by the app.
"""
import json,pathlib
import exchange_calendars as xc

calendar=xc.get_calendar('XKRX',start='2022-01-01',end='2028-12-31')
# Scheduled election closures missing from the upstream 4.13.2 model.
closures={'2026-06-03':'제9회 전국동시지방선거','2028-04-12':'제23대 국회의원선거'}
sessions=[d.strftime('%Y-%m-%d') for d in calendar.sessions if d.strftime('%Y-%m-%d') not in closures]
out={'source':'exchange_calendars XKRX 4.13.2 (Apache-2.0), scheduled election overrides',
     'sourceUrl':'https://github.com/gerrymanoim/exchange_calendars',
     'from':'2022-01-01','through':'2028-12-31','closures':closures,'sessions':sessions,
     'note':'Future sessions are a calendar forecast. Observed KOSPI sessions override historical dates; additional exchange closures require an update.'}
pathlib.Path(__file__).resolve().parents[1].joinpath('scoring/calendar.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'Generated {len(sessions)} forecast sessions through {out["through"]}.')
