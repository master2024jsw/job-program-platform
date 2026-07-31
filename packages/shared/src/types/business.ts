/** 사업 유형코드 예시 (자유 확장 가능한 문자열이며, 아래는 UI 드롭다운용 기본 제공 목록) */
export const BUSINESS_TYPE_CODES = ['SENIOR', 'YOUTH'] as const;

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  SENIOR: '시니어인턴십',
  YOUTH: '청년일자리도약',
};

export interface Business {
  /** bizId, 형식: BIZ-{연도}-{유형코드} */
  id: string;
  institutionId: string;
  name: string;
  typeCode: string;
  baseYear: number;
  createdAt: string;
}
