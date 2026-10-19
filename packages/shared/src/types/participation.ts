import type { ApplicationStatus, ContractType, WorkerStatus } from './worker';

/**
 * 근로자의 사업참여 — `기업의 사업참여 -> 근로자의 사업참여 -> 지원금 신청` 계단의 가운데 칸.
 * 설계서 01_Architecture_v2 §2·§7, ADR-04.
 *
 * 주의: 이 파일은 타입(interface/type)만 export 한다.
 * 새 값(enum/const)을 추가하면 Vite 사전번들 캐시와 렌더러 프로덕션 빌드를 건드린다(CLAUDE.md 참고).
 * 상태값은 기존 WorkerStatus / ApplicationStatus / ContractType 을 재사용한다.
 */
export interface Participation {
  id: string;
  businessId: string;
  companyBusinessId: string;
  workerId: string;
  participationType?: string | null;
  position?: string | null;
  contractType?: ContractType | null;
  /** 참여개시일(= 입사일) */
  hireDate?: string | null;
  /** 인턴십 종료 예정일 */
  internEndDate?: string | null;
  /** 참여종료일(= 퇴사일) */
  resignDate?: string | null;
  continuousHireDate?: string | null;
  salary?: number | null;
  status: WorkerStatus;
  applicationStatus?: ApplicationStatus | null;
  memo?: string | null;
  /** 기존 workers 행에서 옮겨온 기록인지 */
  migratedFromWorker: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 목록 화면용 — 사람 이름과 기업명을 같이 내려준다(계단을 화면에 그리기 위해). */
export interface ParticipationWithNames extends Participation {
  workerName: string;
  workerBirthDate: string;
  companyId: string;
  companyName: string;
}
