/**
 * 개인식별정보(주민등록번호) 마스킹 유틸.
 *
 * GuidePage 보안 안내문(SECURITY_TEXT)이 "외부 AI 전송 전 개인식별정보 마스킹"을 약속하므로,
 * analyze() 경계에서 이 유틸로 주민번호를 가린다.
 * - Gemini로 나가는 텍스트 프롬프트: 마스킹 후 전송 (스캔 이미지 PDF 자체는 마스킹 불가하나,
 *   프롬프트/저장 단계에서 원본 주민번호가 평문으로 남지 않도록 한다)
 * - 추출 결과(extractedData): 저장 전에 마스킹 → DB에 평문 주민번호가 남지 않음
 *
 * 주민번호 형식: 6자리-7자리 (생년월일 6 + 뒤 7). 뒤 7자리를 * 로 가린다.
 */
const RRN_PATTERN = /(\d{6})[-\s]?([1-4]\d{6})/g;

/** 문자열 안의 주민번호를 `######-G******` 로 마스킹한다 (성별 자리 1자리 노출, 뒤 6자리 비공개). */
export function maskResidentNumbers(text: string): string {
  return text.replace(RRN_PATTERN, (_m, front: string, back: string) => `${front}-${back[0]}******`);
}

/**
 * 임의 JSON 값(문자열/배열/객체)을 재귀 순회하며 문자열 값의 주민번호를 마스킹한다.
 * 숫자·불리언 등 다른 타입은 그대로 둔다.
 */
export function maskDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return maskResidentNumbers(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => maskDeep(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * 문자열 안의 주민번호를 앞자리까지 전부 가린다 (`******-*******`).
 *
 * 서류에서 뽑은 값은 생년월일(앞 6자리)이 만연령 계산(R-200)에 필요하므로 앞자리를 남기지만,
 * 자유 입력 칸에는 그 값이 필요하지 않다. 앞 6자리는 생년월일·성별이라 그 자체가 개인정보이고,
 * 「예외 후보」 화면처럼 여러 건을 모아 보여주는 곳에 그대로 뜨면 안 된다.
 */
export function maskResidentNumbersFully(text: string): string {
  // 뒤 7자리가 이미 `2******` 처럼 부분 마스킹된 값도 잡아야 한다 —
  // 그렇지 않으면 앞 6자리(생년월일)가 그대로 남는다.
  return text.replace(/(\d{6})[-\s]?([1-4][\d*]{6})/g, '******-*******');
}

/**
 * 담당자 승인 사유 정리 — 저장 전 주민번호 마스킹 + 공백만이면 null.
 * 사유 칸은 자유 입력이라 개인정보가 섞일 수 있으므로 저장 경로에서 한 번 더 가린다.
 * 여기서는 앞자리까지 전부 가린다 — 사유를 읽는 데 생년월일이 필요하지 않다.
 */
export function sanitizeApprovalReason(raw?: string | null): string | null {
  const text = maskResidentNumbersFully((raw ?? '').trim());
  return text || null;
}
