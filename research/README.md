# 검증·연구 스크립트

앱의 점수 수식과 매매 규칙을 정할 때 쓴 백테스트 스크립트입니다. 앱 실행에는 필요 없습니다.

## 준비
```
node research/fetch_data.js        # research/data에 시세·재무·지수 받기 (약 5분, 약 190MB, git에는 안 올라감)
```
모든 스크립트는 첫 인자로 데이터 폴더를 받습니다: `node research/<스크립트> research/data <출력파일>`

## 스크립트

| 파일 | 하는 일 | 결과로 정한 것 |
|---|---|---|
| fdata.js | 시세·재무 읽기, 그 시점 공개 재무(결산 92일 뒤) 고르기 | 공용 |
| bt2.js | 가치+추세 점수 5분위 검증 (이전 식) | 이전 식 근거 |
| bt3.js | 이익 증가·주식 수 감소·배당 증가·감점 검증 | 세 항목 채택, 감점 제외 |
| fx.js | 후보 14개 항목 단독 검증, 상관 (fx_obs.json 생성) | PBR 제외, 대형주·모멘텀 발견 |
| opt.js | 묶음 비중 1,001개를 기간 나눠 검증 (fx_obs.json 필요) | 새 식 = 규모 40 · 추세 40 · 성장환원 20 |
| bt6.js | 새 식 구간별 성과, 목표가·손절가·기대수익 분포 (dist_new.json 생성) | 앱의 SCORE.DIST |
| sim_split.js | 가상 1억 운용: 분할 매수·분할 매도 비교, 시작 시점 5번 | 1/3씩 3번 분할 매수 채택 |
| sim_final_split.js / sim_execution.js | 앱과 같은 scoring/trading.js로 v2 가상 운용·시작일 5개·부분 체결·위험 조절 비교 | scoring/data/sim.json, execution_study.json |
| sim_legacy.js | 이전 v1 운용 시뮬레이터 보존 | 과거 결과 재현·새 엔진과 구분 |
| market_data.js | 연구용 시점별 데이터·기존 점수 계산 | 실행 규칙과 분리한 공용 입력 |
| test_trading.js | 부분·초과 체결, 누적 목표, 휴장일, 취소, 매도 잔량·실제 현금·위험 상한 검사 | 앱·시뮬레이터 공용 엔진 회귀 |
| test_plan_ui.js | OCR·수동 체결 뒤 생성한 계획의 누적 목표·기존 체결 합산·현재 실행 가능량 검사 | 화면 어댑터와 실제 계좌 상태 연결 |
| sim_t.js | 매매 시간 비교 (이전 식) | 다음 거래일 장 마감 동시호가, 손절은 종가 기준 |
| sim_g.js | 매수일 급등·급락 시 건너뛰기 비교 (이전 식) | 건너뛰지 않음 |

data/에 들어 있는 작은 파일: all_list.txt(종목 목록), dist2.json(이전 식 분포), dist_new.json(새 식 분포).
검증 기간은 스크립트 안에 2023-04-28~2026-09-30(가상 운용은 데이터 마지막 날까지)로 정해져 있습니다.

## v2 실행 엔진 비교 (2026-10-22)

`node research/fetch_data.js /tmp/close-score-research`로 원시 데이터를 별도 폴더에 받고, 작은 dist2.json·dist_new.json·all_list.txt를 그 폴더에 복사합니다.
`node research/sim_final_split.js /tmp/close-score-research scoring/data/sim.json research/data/execution_study.json`으로 다시 계산합니다. 원시 데이터는 저장소에 추가하지 않습니다.

동일 시작일 2023-04-28~2026-10-22, 2,460종목의 진단 결과입니다.

| 방식 | 누적 수익 | 최대 낙폭 | 운영 기본 적용 |
|---|---:|---:|---|
| 공용 실행 엔진 | +168.7% | −42.7% | 적용 |
| 종목당 손절 기준 예상 손실 예산 1% | +153.4% | −32.2% | 실험만 |
| 업종 30%·종목 10%·현금 3% | +211.2% | −39.4% | 실험만 |
| 위험·업종·현금 조절 함께 | +152.9% | −32.2% | 실험만 |

수익 개선을 입증한 결과가 아닙니다. 다섯 시작일은 민감도 확인이며 독립 검증이 아닙니다. 현재 상장 종목 편향·재무 공개일 92일 근사·연구 기간으로 보정한 수익 분포가 있습니다. 매수 0.1%·매도 0.25%·양방향 가격 차이 0.05%·현금 이자 3%를 반영하지만 수정주가 기반 가상 정수 수량이므로 실제 권리 변동·호가·체결을 완전히 재현하지 않습니다. 실제 앱의 장부 계산을 이 비용 모형으로 바꾸지는 않습니다.

`node research/test_trading.js`, `node research/test_ocr.js`, `node research/test_trade_ui.js`로 핵심 회귀를 확인합니다. `node research/build_preview.js <기존 data.json> <미리보기폴더> [sim.json]`은 시세를 재계산하지 않는 화면 검증용입니다. 거래일 달력은 `exchange-calendars==4.13.2`가 설치된 연구 환경에서 `python research/generate_calendar.py`로 생성하며 실제 일봉이 과거 관측 구간을 보정합니다.
