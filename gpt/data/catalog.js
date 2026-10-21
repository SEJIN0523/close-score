// Limited reference catalog, not a recommendation universe. No prices or signals are fabricated.
export const catalog = [
  ["005930", "삼성전자", "반도체", "KOSPI"],
  ["000660", "SK하이닉스", "반도체", "KOSPI"],
  ["373220", "LG에너지솔루션", "이차전지", "KOSPI"],
  ["005380", "현대차", "자동차", "KOSPI"],
  ["000270", "기아", "자동차", "KOSPI"],
  ["035420", "NAVER", "인터넷", "KOSPI"],
  ["035720", "카카오", "인터넷", "KOSPI"],
  ["207940", "삼성바이오로직스", "바이오", "KOSPI"],
  ["068270", "셀트리온", "바이오", "KOSPI"],
  ["105560", "KB금융", "금융", "KOSPI"],
  ["247540", "에코프로비엠", "이차전지", "KOSDAQ"],
  ["196170", "알테오젠", "바이오", "KOSDAQ"],
].map(([code, name, sector, market]) => ({ code, name, sector, market }));
