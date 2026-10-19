/**
 * 기업의 사업 진행 단계 — 하나로 통일된 단계값.
 *
 * 예전에는 세 군데로 흩어져 있었다:
 *   - `companies.recruit_status` (모집단계)  : 기업 단위라 사업이 바뀌어도 안 내려감
 *   - `company_businesses` 불리언 4개 (사업 진행상태) : 순서가 없어 "지금 어디"가 안 보임
 *   - `companies.status` (상태 운영중/중지)
 * 이제 단계는 `company_businesses.stage` 하나이고 **사업별**이다.
 * 불리언 4개는 참여기업 관리대장(공문 제출 양식) 출력에 필요해서 그대로 남긴다.
 *
 * 단계를 나눈 기준은 "지금 무엇을 기다리는 중인가" 이다. 그래야 단계별로 보낼 메일이 하나씩 대응된다.
 * 실무 담당 확인(2026-10-15): 협약서를 보내려면 기업 적격 확인이 먼저 끝나야 한다.
 */
export enum CompanyStage {
  /** 아직 접촉 전 */
  PROSPECT = 'PROSPECT',
  /** 기업 신청서류를 요청했고 받는 중 (검증 전) */
  DOCS_REQUESTED = 'DOCS_REQUESTED',
  /** 기업 적격 확인 완료 — 이제 협약서를 보낼 수 있다 */
  COMPANY_VERIFIED = 'COMPANY_VERIFIED',
  /** 협약서 발송함, 회신 대기 */
  AGREEMENT_SENT = 'AGREEMENT_SENT',
  /** 협약 체결 완료 */
  AGREEMENT_SIGNED = 'AGREEMENT_SIGNED',
  /** 근로자 신청서류가 들어오기 시작 (한 명이라도) */
  WORKER_APPLIED = 'WORKER_APPLIED',
  /** 근로자 검증 완료 (한 명이라도) */
  WORKER_VERIFIED = 'WORKER_VERIFIED',
}

export const COMPANY_STAGE_ORDER: Record<CompanyStage, number> = {
  [CompanyStage.PROSPECT]: 0,
  [CompanyStage.DOCS_REQUESTED]: 1,
  [CompanyStage.COMPANY_VERIFIED]: 2,
  [CompanyStage.AGREEMENT_SENT]: 3,
  [CompanyStage.AGREEMENT_SIGNED]: 4,
  [CompanyStage.WORKER_APPLIED]: 5,
  [CompanyStage.WORKER_VERIFIED]: 6,
};

export const COMPANY_STAGE_LABEL: Record<CompanyStage, string> = {
  [CompanyStage.PROSPECT]: '모집대상',
  [CompanyStage.DOCS_REQUESTED]: '기업서류요청',
  [CompanyStage.COMPANY_VERIFIED]: '기업검증완료',
  [CompanyStage.AGREEMENT_SENT]: '협약진행',
  [CompanyStage.AGREEMENT_SIGNED]: '협약체결',
  [CompanyStage.WORKER_APPLIED]: '근로자신청접수',
  [CompanyStage.WORKER_VERIFIED]: '근로자검증완료',
};

/** 각 단계에서 "무엇을 기다리는 중인가" — 화면 설명과 메일 템플릿 안내에 쓴다. */
export const COMPANY_STAGE_WAITING_FOR: Record<CompanyStage, string> = {
  [CompanyStage.PROSPECT]: '아직 연락 전입니다.',
  [CompanyStage.DOCS_REQUESTED]: '기업 신청서류를 기다리는 중입니다.',
  [CompanyStage.COMPANY_VERIFIED]: '적격 확인이 끝나 협약서를 보낼 수 있습니다.',
  [CompanyStage.AGREEMENT_SENT]: '협약서 회신을 기다리는 중입니다.',
  [CompanyStage.AGREEMENT_SIGNED]: '참여자 신청서류를 기다리는 중입니다.',
  [CompanyStage.WORKER_APPLIED]: '근로자 서류 검증이 남았습니다.',
  [CompanyStage.WORKER_VERIFIED]: '참여 준비가 끝났습니다.',
};

export const COMPANY_STAGES: CompanyStage[] = [
  CompanyStage.PROSPECT,
  CompanyStage.DOCS_REQUESTED,
  CompanyStage.COMPANY_VERIFIED,
  CompanyStage.AGREEMENT_SENT,
  CompanyStage.AGREEMENT_SIGNED,
  CompanyStage.WORKER_APPLIED,
  CompanyStage.WORKER_VERIFIED,
];

/** 단계 변경 한 건의 기록. 누가 왜 바꿨는지 남긴다(되돌리기를 허용하므로 더 중요하다). */
export interface CompanyStageChange {
  id: string;
  businessId: string;
  companyId: string;
  companyBusinessId: string;
  fromStage: CompanyStage | null;
  toStage: CompanyStage;
  /** 'AUTO' = 서류분석·검증승인·메일발송 등으로 자동, 'MANUAL' = 담당자가 직접 */
  source: 'AUTO' | 'MANUAL';
  /** 자동이면 무엇 때문인지 (예: '기업 검증 승인', '메일 발송: 협약서 안내') */
  reason: string | null;
  changedByUserId: string | null;
  changedByName: string | null;
  changedAt: string;
}
