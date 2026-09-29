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

/** 문자열 안의 주민번호를 `######-*******` 로 마스킹한다. */
export function maskResidentNumbers(text: string): string {
  return text.replace(RRN_PATTERN, (_m, front: string) => `${front}-*******`);
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
