import type { DocumentTypeCode } from './document';

/**
 * 도메인 검증 규칙 4유형 (논문 01문서 1.1절).
 * 4단계(기업신청)에서는 crossCheck / riskFlag / calcRule 을 구현하고,
 * exceptionRule 은 타입만 두고 6단계(지원금)에서 구현한다.
 */
export type ValidationRuleType = 'crossCheck' | 'riskFlag' | 'calcRule' | 'exceptionRule';

/** 개별 규칙 판정. PASS(통과) / NEEDS_REVIEW(담당자확인·서류보완) / FAIL(부적격·위험). */
export type RuleVerdict = 'PASS' | 'NEEDS_REVIEW' | 'FAIL';

export interface RuleResult {
  ruleId: string;
  type: ValidationRuleType;
  label: string;
  verdict: RuleVerdict;
  /** 왜 그렇게 판정했는지 한글 근거 문장 (실무자 검토용, REQ4). */
  message: string;
  /** 비교값·조회결과 등 근거 데이터 (대조 화면 "근거 보기"). */
  evidence?: Record<string, unknown>;
}

/** 기업 신청 건 전체 상태 (문서함 뱃지). */
export type CompanyValidationStatus = 'COMPLETE' | 'MISSING' | 'NEEDS_REVIEW' | 'RISK';

export const COMPANY_VALIDATION_STATUS_LABEL: Record<CompanyValidationStatus, string> = {
  COMPLETE: '신청완료',
  MISSING: '미제출',
  NEEDS_REVIEW: '확인필요',
  RISK: '위험',
};

export interface RequiredDocPresence {
  documentType: DocumentTypeCode;
  label: string;
  present: boolean;
  analyzed: boolean;
}

/** 검증 결과에서 도출된 '참여기업 관리' 대장 매핑값 (승인 시 Company/CompanyBusiness로 반영). */
export interface CompanyLedgerFields {
  businessRegistrationNumber: string | null;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  representativeName: string | null;
  generalTypeCount: number | null;
  intergenerationalTypeCount: number | null;
  plannedHeadcount: number | null;
  recruitJobTitle: string | null;
  recruitJobCode: string | null;
  /** R-104 결과: 가능 / 제외 / 담당자확인. */
  jobEligibility: string | null;
  /** 운영계획서 인원 수에서 도출: 인턴형(일반형) / 세대통합형 / 혼합형. */
  participationType: string | null;
}

export interface CompanyValidationResult {
  companyId: string;
  businessId: string;
  status: CompanyValidationStatus;
  documents: RequiredDocPresence[];
  rules: RuleResult[];
  mapped: CompanyLedgerFields;
  judgedAt: string;
}

/** 판정 이력 (비식별). AI판정→사람정정은 source=HUMAN·corrected=true 로 구분. */
export interface JudgmentHistoryRecord {
  id: string;
  businessId: string | null;
  targetType: string;
  targetId: string;
  status: CompanyValidationStatus;
  rules: RuleResult[];
  source: 'AI' | 'HUMAN';
  corrected: boolean;
  judgedAt: string;
}
