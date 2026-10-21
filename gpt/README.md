# PRISM V1

Professional Investment Intelligence. 독립적인 정적 투자 대시보드와 개인 장부.

## 실행

저장소 루트에서 `python3 -m http.server 4173` 후 `http://localhost:4173/gpt/`를 엽니다. ES modules를 사용하므로 파일을 더블클릭하는 file:// 실행은 지원하지 않습니다. 빌드나 서버 API 없이 정적 호스팅 가능합니다.

## 사용

1. 포트폴리오 → 초기 현금 설정.
2. 거래 기록 → 매수·매도·입금·출금·배당 추가. 카탈로그에 없는 종목도 6자리 코드로 기록 가능합니다.
3. 보유 종목 → 평가 가격과 기준일을 직접 입력. 입력값은 실시간 시세가 아니며 자동 갱신하지 않습니다.
4. 설정 → JSON 백업을 다운로드해 보관. 다른 기기에서는 같은 파일을 복원합니다. 자동 기기 동기화는 없습니다.
5. 날짜·가격·수량 수정과 삭제 시 전체 장부를 재검증합니다. 같은 날짜는 입력 순서로 처리합니다.

실제 시장 데이터 및 투자 엔진은 미연결입니다. 12개 기업의 참조 목록만 제공하며, 가상 시세·추천·수익률은 없습니다. 투자 권유가 아닌 참고 자료입니다.

## 구성과 연결 경계

- `app.js`: 해시 라우팅, 화면, 이벤트와 폼. 뒤로 가기 지원.
- `components/ui.js`: 공통 표시 컴포넌트 및 HTML 이스케이프.
- `services/market.js`: 시장·종목 분석 어댑터. 추후 Node 엔진 JSON 연결 지점.
- `data/catalog.js`: 제한된 참조 종목. 전체 종목 데이터로 교체 가능.
- `services/portfolio.js`: DOM·시세 공급자에 의존하지 않는 순수 계산.
- `services/storage.js`: 스키마 검증, JSON 입출력, 단일 저장 트랜잭션.
- `config/app.js`: 버전·기본값·저장 키.

시장 응답에는 `status`, `asOf`, `stocks`, `signals`, `sectors`, `risk`를, 종목 분석에는 `score`, `trend`, `support`, `risks`, `conditions`, `quality`를 유지하고, 연결 시 출처·기준일·품질을 표시해야 합니다. 데이터 미연결 상태는 유효한 정상 상태입니다.

## 계산 기준

원화, 정수 주식 수량, 이동평균 원가법, 현금은 소수점 2자리 반올림. 수수료·세금·액면분할·공매도·외화는 V1 범위 밖입니다. 초기 현금은 장부 시작 전 원금입니다. 이후 현금 조정은 입출금으로 처리합니다. 총손익 = 실현손익 + 평가손익 + 배당. 손익률은 순입금 대비 단순 비율이며 시간가중/금액가중 수익률이 아닙니다. 순입금이 0 이하이면 수익률 미표시. 보유 종목의 평가 가격이 하나라도 없으면 총자산·평가손익·수익률·비중을 표시하지 않습니다. 입력한 평가 가격 기준일은 종목별로 표시됩니다.

## 저장 및 보호

유일한 키는 `prism-v1-state`. 초기화는 이 키만 덮어쓰고 `localStorage.clear()`를 사용하지 않습니다. 개인 장부는 Git에 저장하지 않습니다. JSON 복원은 형식과 장부를 먼저 검증하고, 확인 후 교체합니다. 손상된 저장 데이터를 읽으면 자동 덮어쓰기를 차단합니다. 브라우저 저장소 삭제·시크릿 모드·기기 손실에 대비해 파일 백업이 필요합니다.

## 테스트

- `cd gpt && node --test --test-isolation=none tests/portfolio.test.js` (Node 22 이상)
- 브라우저 회귀 검증: 저장소 루트에서 포트 4173 정적 서버 실행 후 `node gpt/tests/browser.cjs`. Playwright 설치 필요. 별도 설치 경로는 `PRISM_PLAYWRIGHT_PATH`로 지정합니다. Chromium은 `/usr/bin/chromium`을 사용합니다. 임시 백업·스크린샷은 `/tmp/prism-*`에 생성됩니다.

## 운영 배포와 분리

기존 `.github/workflows/update.yml`은 main에서 scoring을 계산해 `site/`를 Pages에 배포합니다. 이 작업은 해당 파일과 기존 Claude판 파일을 수정하지 않으며 main에 병합하거나 Pages에 배포하지 않습니다.

브랜치 미리보기 후보: https://raw.githack.com/SEJIN0523/close-score/feat/prism-v1/gpt/index.html

이 무료 제3자 정적 미리보기는 GitHub의 공개 브랜치 파일을 읽습니다. 환경의 외부 도메인 정책 때문에 접속 검증은 하지 못했습니다. 원본 GitHub 파일 URL은 HTML 실행용이 아닙니다. 운영 반영은 사용자 검토·승인 이후 별도 작업입니다.
