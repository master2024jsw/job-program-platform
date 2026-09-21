export enum UserRole {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
}

export interface Institution {
  id: string;
  name: string;
  createdAt: string;
}

export interface User {
  id: string;
  institutionId: string;
  loginId: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

/** 세션에 저장/응답되는 로그인 사용자 정보 (비밀번호 해시 제외) */
export interface SessionUser {
  id: string;
  institutionId: string;
  institutionName: string;
  loginId: string;
  name: string;
  role: UserRole;
}

export interface SetupStatus {
  needsSetup: boolean;
}

/** 로그인 응답 — 로그인 화면에서 선택한 사업유형으로 확정된 businessId를 포함한다. */
export interface LoginResult extends SessionUser {
  businessId: string;
}
