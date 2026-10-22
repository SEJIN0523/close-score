// Data publication safeguards only; scoring and trading rules remain unchanged.
function selectMarketSnapshot(candidate, saved, latestConfirmed, failure) {
  const date = candidate?.META?.asOf, previous = saved?.META?.asOf;
  const floor = [previous, latestConfirmed].filter(Boolean).sort().pop();
  let reason = failure;
  if (!reason && !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) reason = '최신 종가 날짜를 확인하지 못했습니다.';
  if (!reason && floor && date < floor) reason = `받은 시세가 ${date}로, 이미 확인한 ${floor}보다 오래됐습니다.`;
  if (!reason && previous === date && saved.META.final && !candidate.META.final) reason = '확정 종가가 장중 데이터로 바뀌었습니다.';
  if (!reason && candidate.ROWS) {
    if (candidate.ROWS.some(r => r.d > date)) reason = '기준일보다 미래인 종목 시세가 섞였습니다.';
    const current = candidate.ROWS.filter(r => r.d === date).length;
    if (!candidate.ROWS.length || current <= candidate.ROWS.length / 2) reason = '종목 시세 대부분이 기준 거래일에 도달하지 못했습니다.';
  }
  if (!reason) return { snapshot: candidate, reason: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(previous || '') || !saved.ROWS?.length || (floor && previous < floor)) throw new Error(reason + ' 유효한 정상 스냅샷이 없어 배포를 중단합니다.');
  return { snapshot: { ...saved, META: { ...saved.META, refreshWarning: reason, refreshAttemptedAt: new Date().toISOString() } }, reason };
}
module.exports = { selectMarketSnapshot };
