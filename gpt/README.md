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

## V1.1 정식 배포 준비 (아직 운영 미반영)

작업 브랜치: `feat/prism-v1-1`. 목표 URL: `https://sejin0523.github.io/close-score/prism/`.

기존 `scoring/update.js --web site`의 루트 앱 생성과 갱신은 그대로 둡니다. 데이터 기록 저장 단계 후 `node gpt/scripts/stage-pages.mjs`가 명시된 9개 공개 실행 파일만 `site/prism/`에 복사합니다. README·테스트·스크립트·백업·개인 기록은 포함하지 않습니다. 기존 루트 파일은 그대로 보존합니다. `gpt/**`가 main push 트리거에 추가되어, 승인 후 main에 반영된 PRISM 수정도 기존 공동 배포 작업을 실행합니다. 일정과 수동 실행 트리거는 유지하며 별도 브랜치 push는 배포하지 않습니다. main 병합 시 전체 워크플로가 자동 실행되므로 병합 자체가 배포 승인 이후여야 합니다.

V1의 '이 작업은 워크플로를 수정하지 않음' 설명은 최초 버전 이력입니다. V1.1에서는 위 트리거와 복사 단계만 변경합니다.

### 복원 전 보호

파일 형식·거래 유효성 검증 → 사용자 확인 → 현재 저장 원문을 `prism-v1-before-restore`에 보관 → 본 기록 교체 순서입니다. 보관 또는 본 기록 저장 실패 시 오류를 표시하며 원래 본 기록은 유지됩니다. 확인창을 여는 시점과 저장 시점의 본 기록이 달라지면 중단합니다. 보관 기록은 최근 복원 전 1개뿐이며 다음 복원에서 교체됩니다. 설정의 **복원 전 기록 다운로드**로 파일을 내려받아 일반 복원으로 되돌릴 수 있습니다. 원래 데이터가 손상되었어도 원문을 보관합니다(손상 원문은 일반 복원 불가). 개인 기록 초기화는 본 기록과 이 보관본을 함께 초기화합니다. 두 키 모두 브라우저 내부 전용이며 서버 전송은 없습니다. 같은 브라우저 프로필·동일 origin이면 경로가 달라도 같은 localStorage를 사용합니다. raw.githack 등 다른 origin의 기록은 JSON 파일로 옮겨야 합니다.

### 일반 웹앱 사용과 기존 서비스워커 영향

PRISM은 manifest, 서비스워커 등록, 오프라인 캐시 코드를 제공하지 않습니다. 정식 URL을 스마트폰 브라우저에서 열고 브라우저 메뉴의 홈 화면 바로가기를 사용합니다. 온라인 접속을 기본으로 하며 브라우저별 바로가기 UI는 다를 수 있습니다.

주의: 기존 Claude판 `scoring/web/sw.js`는 `/close-score/` 범위의 동일 origin 요청을 캐시합니다. Claude판을 이전에 열었던 브라우저에서 `/close-score/prism/`도 이 기존 워커의 제어를 받으며 PRISM 정적 파일이 캐시되는 것을 로컬 브라우저에서 재현했습니다. 개인 기록은 localStorage에만 있고 이 정적 캐시에 들어가지 않습니다. 이번 작업은 기존 워커를 변경·해제하거나 캐시를 삭제하지 않습니다. PRISM을 기존 워커에서도 완전히 제외해야 한다면 `/prism/` 요청 제외 규칙을 기존 워커에 추가하는 별도 승인이 필요합니다. PRISM만 처음 연 새 프로필에서는 워커 등록이 없습니다.

### 승인 후 활성화 순서

1. 본 브랜치의 변경사항 및 기존 워커 영향 검토·승인.
2. 그 시점의 최신 main과 충돌 여부 확인. PC 투자 연구 브랜치는 병합하지 않음.
3. 승인된 PRISM 변경만 main에 반영. push 트리거로 기존 `update` Actions가 계산·공동 배포.
4. Actions 성공 후 `/close-score/` Claude판과 `/close-score/prism/` PRISM을 각각 실제 스마트폰에서 검증. 오래된 origin의 PRISM 기록은 JSON 백업·복원으로 이전.

이번 작업에서는 main 병합, Actions 수동 실행, 운영 배포를 하지 않습니다. 실제 시장 계산·운영 Pages 접속·실제 iOS/Android 검증은 수행하지 않았습니다.

### V1.1 검증 명령

`node --test --test-isolation=none gpt/tests/*.test.js` (Node 22 이상). 기존 Node 20 CI에서도 앱·복사 스크립트는 Node 표준 API만 사용합니다.

스테이징 결과를 HTTP로 제공한 뒤 `PRISM_BASE_URL=http://127.0.0.1:4174/close-score/prism/ node gpt/tests/browser.cjs` 및 `node gpt/tests/release-browser.cjs`로 브라우저 검증합니다. Playwright가 필요하고 설치 경로는 `PRISM_PLAYWRIGHT_PATH`로 지정할 수 있습니다.
