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
  /** 선택서류 여부 (없어도 MISSING 판정 안 함) */
  optional: boolean;
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

// ──────────────────────────────────────────────
// 5단계: 참여자(근로자) 신청 검증
// ──────────────────────────────────────────────

/** 근로자 신청 건 전체 상태 (문서함 뱃지). */
export type WorkerValidationStatus = 'COMPLETE' | 'MISSING' | 'NEEDS_REVIEW' | 'RISK';

export const WORKER_VALIDATION_STATUS_LABEL: Record<WorkerValidationStatus, string> = {
  COMPLETE: '적격',
  MISSING: '미제출',
  NEEDS_REVIEW: '확인필요',
  RISK: '부적격',
};

/**
 * 검증 결과에서 도출된 참여자 대장 매핑값 — '2026년 참여자관리' 시트 헤더와 1:1 대응.
 * companyName·email·participationType은 companyId로 Company/CompanyBusiness 조인값.
 * residentNumberMasked는 뒤 7자리 마스킹 표시용이며 DB에 저장하지 않는다.
 * resignDate는 직접입력 항목으로 항상 null.
 */
export interface WorkerLedgerFields {
  /** 기업명 (Company 조인) */
  companyName: string | null;
  /** 근로자 연락처 (신청서) */
  phone: string | null;
  /** 이메일 (Company 조인) */
  email: string | null;
  /** 참여유형 (CompanyBusiness 조인) */
  participationType: string | null;
  /** 성명 (초본 우선, 없으면 신청서) */
  name: string | null;
  /** 주민번호 표시용 마스킹값 (예: 911128-1******) — 미저장 */
  residentNumberMasked: string | null;
  /** 생년월일 (주민번호 앞 6자리 파생, YYYY-MM-DD) */
  birthDate: string | null;
  /** 성별 (주민번호 7번째 자리 파생) */
  gender: string | null;
  /** 인턴시작일 (근로계약서 인턴약정기간 시작) */
  internStartDate: string | null;
  /** 인턴종료일 (근로계약서 인턴약정기간 종료) */
  internEndDate: string | null;
  /** 퇴사일 — 직접입력 항목, 항상 null로 초기화 */
  resignDate: null;
}

/** 할일의 급함 정도. BLOCKER=이게 풀려야 대장 반영 가능 / REVIEW=사람이 확인 / READY=승인만 남음. */
export type NextActionSeverity = 'BLOCKER' | 'REVIEW' | 'READY';

/**
 * 「다음에 담당자가 할 일」 한 건.
 * 판정(무엇이 걸렸나)을 행동(어디서 뭘 고치면 무슨 일이 일어나나)으로 번역한 것.
 */
export interface NextAction {
  /** 안정된 식별자 (화면 문구가 바뀌어도 유지 — 로그·집계용). */
  code: string;
  severity: NextActionSeverity;
  /** 무엇이 걸렸나. 예: "성명 확인필요" */
  subject: string;
  /** 왜 걸렸나 — 판정 근거 문장. */
  detail: string;
  /** 어디서 고치나. 예: "근로자 DB 탭 → 수정 → 성명" */
  where: string;
  /** 고치면 무슨 일이 일어나나. 예: "승인 후 근로자 DB 업데이트 예정" */
  then: string;
  ruleId?: string;
}

export interface WorkerValidationResult {
  workerId: string;
  businessId: string;
  status: WorkerValidationStatus;
  documents: RequiredDocPresence[];
  rules: RuleResult[];
  mapped: WorkerLedgerFields;
  judgedAt: string;
  /** 담당자가 다음에 할 일 (판정에서 결정적으로 도출 — AI 아님). */
  nextActions: NextAction[];
  /**
   * 승인을 눌렀을 때만 채워진다 — 신청단계가 실제로 올라갔는지와 그 이유.
   * 올라가지 않았는데 "승인 완료"라고만 말하면 담당자가 왜 지원금 안내에 안 뜨는지 알 수 없다.
   */
  approval?: { applied: boolean; message: string };
}

// ──────────────────────────────────────────────
// 6단계: 지원금신청 검증
// ──────────────────────────────────────────────

export type SubsidyValidationStatus = 'COMPLETE' | 'MISSING' | 'NEEDS_REVIEW' | 'RISK';

export const SUBSIDY_VALIDATION_STATUS_LABEL: Record<SubsidyValidationStatus, string> = {
  COMPLETE: '신청완료',
  MISSING: '미제출',
  NEEDS_REVIEW: '확인필요',
  RISK: '위험',
};

/** SubsidyCalculation 회차 1건. */
export interface SubsidyRound {
  round: number;
  periodLabel: string;
  baseSalary: number;
  calculatedAmount: number;
  subsidyType: 'INTERN' | 'HIRE';
}

/** 근로자 1명의 지원금 회차 집계. */
export interface WorkerSubsidyAmount {
  workerId: string | null;
  workerName: string;
  rounds: SubsidyRound[];
  total: number;
  rules: RuleResult[];
}

/** 6단계 통합 대장 매핑값 (근로자별 회차 지원금). */
export interface SubsidyLedgerFields {
  totalAmount: number | null;
  applicantCount: number | null;
  workerSubsidies: WorkerSubsidyAmount[];
}

/**
 * 근로자 1명 기준으로 묶은 지원금 검증 결과 (참여자·지원금 탭).
 *
 * 지원금 서류는 기업이 한 번에 내지만, 담당자가 처리하는 단위는 근로자 1명이다.
 * 기업 공통 규칙은 모든 근로자를 같이 막으므로 `companyRules` 로 따로 구분해 함께 보여준다.
 */
export interface WorkerSubsidyValidationResult {
  workerId: string;
  workerName: string;
  companyId: string;
  businessId: string;
  status: SubsidyValidationStatus;
  /** 지원금 필수서류 (기업 단위 — 없으면 이 기업의 모든 근로자가 막힌다). */
  documents: RequiredDocPresence[];
  /** 기업 공통 규칙 (신청서·통장·총액 등). */
  companyRules: RuleResult[];
  /** 이 근로자에게만 해당하는 규칙 (산정 검산·급여 대조 등). */
  workerRules: RuleResult[];
  rounds: SubsidyRound[];
  total: number;
  /** 이 근로자가 지원금을 받기까지 담당자가 할 일. */
  nextActions: NextAction[];
  judgedAt: string;
}

export interface SubsidyValidationResult {
  companyId: string;
  businessId: string;
  status: SubsidyValidationStatus;
  documents: RequiredDocPresence[];
  rules: RuleResult[];
  mapped: SubsidyLedgerFields;
  judgedAt: string;
  /** 담당자가 다음에 할 일 (판정에서 결정적으로 도출 — AI 아님). */
  nextActions: NextAction[];
}
