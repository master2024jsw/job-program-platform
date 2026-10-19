/**
 * 서류 1건에서 '실제로 쓸 항목값'을 고르는 규칙.
 *
 * 서류에는 값이 두 벌 있다.
 *   extractedData — AI 가 뽑은 값
 *   reviewedData  — 담당자가 검토하며 고친 값 (있으면 이쪽이 정답)
 *
 * 원래는 `reviewedData ?? extractedData` 로 단순히 골랐는데, 여기에 함정이 있었다.
 * 추출이 비어 있는 상태에서 담당자가 「검토완료」를 누르면 **빈 reviewedData 가 저장**된다.
 * 그 뒤 추출 버그를 고치고 재분석해도 extractedData 만 갱신되고 reviewedData 는 비운 채 남아서,
 * 검증·대장반영이 계속 빈 값을 읽는다 — 화면에는 값이 보이는데 근로자 DB 에는 안 들어오는 상태.
 * (2026-10-16 에 한 번 겪어 7건을 손으로 정리했고, 2026-10-19 에 같은 상태가 다시 쌓여 있었다.)
 *
 * 그래서 규칙을 하나 더 둔다: **빈 검토값은 추출값을 가리지 않는다.**
 * 담당자의 편집을 버리는 게 아니다 — 빈 검토값에는 애초에 담긴 정보가 없다.
 */

/** 분류·관찰 결과일 뿐 '추출된 항목'이 아닌 키. */
const NON_FIELD_KEYS = new Set(['documentType', 'missingItems']);

/** 의미 있는 항목이 하나도 없는가 (documentType·missingItems 만 있거나, 값이 전부 비었는가). */
export function isEmptyFieldSet(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return true;
  const record = data as Record<string, unknown>;
  return !Object.keys(record).some((key) => {
    if (NON_FIELD_KEYS.has(key)) return false;
    const value = record[key];
    if (value == null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}

/**
 * 이 서류에서 실제로 쓸 값을 고른다.
 * 검토값이 비어 있지 않으면 검토값, 비어 있으면 추출값.
 */
export function effectiveDocumentData(doc: {
  reviewedData?: unknown;
  extractedData?: unknown;
}): Record<string, unknown> | null {
  const reviewed = doc.reviewedData;
  if (!isEmptyFieldSet(reviewed)) return reviewed as Record<string, unknown>;
  const extracted = doc.extractedData;
  if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
    return extracted as Record<string, unknown>;
  }
  // 둘 다 비었으면 기존 동작대로 검토값을 돌려준다(null 포함).
  return (reviewed as Record<string, unknown> | null) ?? null;
}
