/**
 * 4·5·6단계(기업신청·근로자신청·지원금신청 검토) 지시서에서 구현 예정인 도메인 검증 엔진의 자리.
 * 이번 배치에서는 타입만 선언하고 구현·호출하지 않는다.
 */
export interface DomainValidationResult {
  field: string;
  passed: boolean;
  message?: string;
}

export interface DomainValidationEngine {
  validate(input: Record<string, unknown>): Promise<DomainValidationResult[]>;
}
