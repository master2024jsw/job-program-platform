import type { DocumentTypeCode, RuleResult } from '@job-program/shared';

/**
 * 도메인 검증 엔진 (논문 01문서 1.1절 규칙 4유형).
 * 4단계(기업신청)에서 crossCheck/riskFlag/calcRule 을 구현한다.
 * exceptionRule 은 5·6단계에서 확장한다.
 *
 * 입력: 한 대상(기업)의 서류유형별 추출값(extractedData) 묶음.
 * 출력: 규칙별 판정 결과.
 */
export type ExtractedByDocumentType = Partial<Record<DocumentTypeCode, Record<string, unknown>>>;

export interface DomainValidationEngine {
  validate(input: ExtractedByDocumentType): RuleResult[];
}
