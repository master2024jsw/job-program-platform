import type { RequiredDocPresence, RuleResult, WorkerValidationStatus } from '@job-program/shared';

/**
 * 「다음에 담당자가 할 일」 도출.
 *
 * 왜 필요한가:
 * 검증 결과는 "성명 불일치 — NEEDS_REVIEW" 처럼 *무엇이 걸렸는지*만 말한다.
 * 담당자는 거기서 '그래서 내가 어디 가서 뭘 고쳐야 근로자 DB에 반영되는가'를 스스로 추론해야 했고,
 * 실제로 그 지점에서 막혔다(사용자 보고 2026-10-19: "어떤 부분을 체크해서 수정해야
 * 정상적인 루트로 진행되는지가 너무 어려워").
 *
 * 그래서 판정 결과를 **행동 문장**으로 번역한다. 한 건은 항상 세 조각이다.
 *   무엇이 걸렸나(subject·detail) / 어디서 고치나(where) / 고치면 무슨 일이 일어나나(then)
 *
 * 설계 위치 — 설계서 ADR-07(AI는 추출, 규칙엔진은 대조, 사람은 결정)에 한 층을 더한다.
 *   AI = 추출  →  규칙엔진 = 대조  →  **이 파일 = 사람에게 넘길 일의 지정**  →  사람 = 결정
 * AI를 쓰지 않는 결정적(deterministic) 변환이라서, 같은 판정에는 항상 같은 안내가 나오고
 * 왜 그 안내가 나왔는지 ruleId 로 역추적된다. 모델을 바꿔도 이 안내는 흔들리지 않는다.
 *
 * 순수 함수로 둔 이유: DB·HTTP 없이 단위 테스트가 되어야 한다(설계서 F14).
 */

/** 할일의 급함 정도. */
export type NextActionSeverity =
  /** 이게 풀리기 전에는 근로자 DB 반영이 불가능하다. */
  | 'BLOCKER'
  /** 담당자가 눈으로 확인하고 맞다고 하면 넘어간다. */
  | 'REVIEW'
  /** 걸린 건 없고, 승인만 누르면 된다. */
  | 'READY';

export interface NextAction {
  /** 안정된 식별자. 로그·집계·논문 통계에 쓴다(화면 문구가 바뀌어도 유지). */
  code: string;
  severity: NextActionSeverity;
  /** 무엇이 걸렸나 — 한 줄 제목. 예: "성명 확인필요" */
  subject: string;
  /** 왜 걸렸나 — 판정 근거 문장. */
  detail: string;
  /** 어디서 고치나. 예: "근로자 DB 탭 → 수정 → 성명" */
  where: string;
  /** 고치면 무슨 일이 일어나나. 예: "승인 후 근로자 DB 업데이트 예정" */
  then: string;
  /** 근거 규칙 (있으면). */
  ruleId?: string;
}

interface RuleGuide {
  subject: string;
  where: string;
  /** 보통(NEEDS_REVIEW) 상황에서의 안내. */
  then: string;
  /** FAIL(제외사유)일 때는 "고치면 된다"가 아니라 "승인할 수 없다"로 바뀐다. */
  failThen?: string;
}

const WORKER_APPROVE_PATH = '근로자 DB 탭 → 신청 검증 → 승인';
const AFTER_APPROVE = '승인 후 근로자 DB 업데이트 예정';

/**
 * 규칙 → 담당자 동선 매핑.
 *
 * 여기 없는 규칙은 GENERIC_GUIDE 로 떨어진다. 규칙이 늘어도 안내가 사라지지 않게 하기 위함이다
 * (빠뜨린 규칙이 조용히 무시되는 쪽이, 뭉뚱그린 안내가 나오는 쪽보다 위험하다).
 */
const WORKER_RULE_GUIDE: Record<string, RuleGuide> = {
  'R-200': {
    subject: '생년월일·연령 확인필요',
    where: '근로자 DB 탭 → 수정 → 생년월일',
    then: `주민등록번호를 잘못 읽었을 수 있습니다. 생년월일을 고치면 ${AFTER_APPROVE}`,
    failThen: '만 60세 미만이면 참여 제외 대상이라 승인할 수 없습니다. 생년월일이 잘못 읽힌 것이라면 수정 후 다시 검증하세요.',
  },
  'R-201': {
    subject: '성명 확인필요 (초본·신청서)',
    where: '근로자 DB 탭 → 수정 → 성명',
    then: `맞는 성명으로 고친 뒤 승인하면 ${AFTER_APPROVE}`,
  },
  'R-202': {
    subject: '성명 확인필요 (고용보험이력·신청서)',
    where: '근로자 DB 탭 → 수정 → 성명',
    then: `맞는 성명으로 고친 뒤 승인하면 ${AFTER_APPROVE}`,
  },
  'R-203': {
    subject: '고용보험 상실일 확인필요',
    where: '문서함 → 고용보험 피보험자격 이력내역서 → 검토',
    then: '이중취득 위험 여부를 확인하고, 문제없으면 승인하세요.',
  },
  'R-204': {
    subject: '최근 90일 내 같은 사업장 근무 확인필요',
    where: '문서함 → 고용보험 피보험자격 이력내역서 → 검토',
    then: '근무 이력이 사실과 다르면 서류를 다시 올려 재분석하세요.',
    failThen: '같은 사업장에서 90일 이내 근무한 경우 제외 대상이라 승인할 수 없습니다. 이력이 잘못 읽힌 것이라면 서류를 다시 올려 재분석하세요.',
  },
  'R-205': {
    subject: '인턴약정기간 확인필요',
    where: '근로자 DB 탭 → 수정 → 입사일·인턴종료일',
    then: `근로계약서의 인턴약정기간과 맞춘 뒤 승인하면 ${AFTER_APPROVE}`,
  },
  'R-206': {
    subject: '서명·기재 확인필요',
    where: '문서함 → 해당 서류 → 검토',
    then: '서명이 실제로 있는데 AI가 못 읽은 것이면 검토에서 바로잡고, 정말 빠졌으면 서류를 다시 받으세요.',
  },
  'R-207': {
    subject: '적격확인서 항목 확인필요',
    where: '문서함 → 참여자 적격확인서 → 검토',
    then: '항목1~5 「없음」·항목6 「네」가 맞는지 확인하고, 맞으면 승인하세요.',
  },
  'R-208': {
    subject: '교육일자 확인필요',
    where: '문서함 → 교육대장 → 검토',
    then: '교육일자가 근로시작일 이후인지 확인하고, 맞으면 승인하세요.',
  },
  'R-209': {
    subject: '성명 확인필요 (신청서·근로계약서·교육대장)',
    where: '근로자 DB 탭 → 수정 → 성명',
    then: `맞는 성명으로 고친 뒤 승인하면 ${AFTER_APPROVE}`,
  },
  'R-210': {
    subject: '소속기업 확인필요',
    where: '근로자 DB 탭 → 수정 → 소속기업',
    then: `근로계약서의 기업과 선택한 기업이 같은지 확인하고 고치면 ${AFTER_APPROVE}`,
  },
};

const GENERIC_GUIDE: RuleGuide = {
  subject: '확인필요',
  where: `${WORKER_APPROVE_PATH} → 근거 보기`,
  then: '근거를 확인하고 서류를 고치거나, 문제없으면 승인하세요.',
  failThen: '제외 사유에 해당하므로 승인할 수 없습니다. 근거를 확인하세요.',
};

export interface WorkerNextActionInput {
  status: WorkerValidationStatus;
  documents: RequiredDocPresence[];
  rules: RuleResult[];
  /** 지금 근로자 DB에 들어 있는 값. 승인으로 채워질 칸이 비었는지 보여주는 용도. */
  worker?: { name?: string | null; birthDate?: string | null; hireDate?: string | null } | null;
}

const SEVERITY_ORDER: Record<NextActionSeverity, number> = { BLOCKER: 0, REVIEW: 1, READY: 2 };

/**
 * 근로자 1명의 검증 결과를 담당자 할일 목록으로 바꾼다.
 *
 * 순서: 막힌 것(BLOCKER) → 확인할 것(REVIEW) → 승인(READY).
 * 같은 급함 안에서는 들어온 순서를 유지한다(규칙 번호 순 = 업무 순서).
 */
export function deriveWorkerNextActions(input: WorkerNextActionInput): NextAction[] {
  const actions: NextAction[] = [];

  // ① 필수서류 자체가 없거나 분석되지 않은 경우 — 규칙을 따질 수 있는 상태가 아니다.
  for (const doc of input.documents) {
    if (doc.optional) continue;
    if (!doc.present) {
      actions.push({
        code: `DOC_MISSING:${doc.documentType}`,
        severity: 'BLOCKER',
        subject: `${doc.label} 미제출`,
        detail: `필수서류인 ${doc.label}가 아직 문서함에 없습니다.`,
        where: '문서함 → 업로드',
        then: '올리고 분석하면 검증이 자동으로 다시 돌아갑니다.',
      });
    } else if (!doc.analyzed) {
      actions.push({
        code: `DOC_NOT_ANALYZED:${doc.documentType}`,
        severity: 'BLOCKER',
        subject: `${doc.label} 분석 안 됨`,
        detail: `${doc.label}는 올라와 있지만 추출된 항목이 없습니다.`,
        where: '문서함 → 해당 서류 → 서류 유형 지정 후 분석',
        then: '항목이 채워지면 검증이 자동으로 다시 돌아갑니다.',
      });
    }
  }

  // ② 규칙 판정 — FAIL 은 제외사유(막힘), NEEDS_REVIEW 는 사람이 보고 넘기는 것.
  for (const rule of input.rules) {
    // 현재 RuleVerdict 는 PASS / NEEDS_REVIEW / FAIL 세 가지다.
    // (설계서 §10.4 의 INSUFFICIENT_DATA·NOT_APPLICABLE 이 추가되면 여기 분기도 같이 늘려야 한다.)
    if (rule.verdict === 'PASS') continue;

    const guide = WORKER_RULE_GUIDE[rule.ruleId] ?? GENERIC_GUIDE;
    const isFail = rule.verdict === 'FAIL';

    actions.push({
      code: `RULE:${rule.ruleId}`,
      severity: isFail ? 'BLOCKER' : 'REVIEW',
      subject: guide.subject,
      detail: rule.message || rule.label,
      where: guide.where,
      then: (isFail ? guide.failThen : undefined) ?? guide.then,
      ruleId: rule.ruleId,
    });
  }

  // ③ 아무것도 안 걸렸으면 남은 일은 승인 하나뿐이다.
  //    "걸린 게 없는데 왜 DB에 안 들어오지?"가 바로 담당자가 막혔던 지점이라, 이 줄을 반드시 띄운다.
  if (actions.length === 0) {
    const blanks = missingLedgerFields(input.worker);
    actions.push({
      code: 'APPROVE',
      severity: 'READY',
      subject: '승인만 하면 됩니다',
      detail:
        blanks.length > 0
          ? `걸린 항목이 없습니다. 아직 근로자 DB에 ${blanks.join('·')}이(가) 비어 있습니다.`
          : '걸린 항목이 없습니다.',
      where: WORKER_APPROVE_PATH,
      then: `승인하면 확정값이 근로자 DB에 반영되고 정정 이력이 남습니다. (${AFTER_APPROVE})`,
    });
  }

  return actions.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** 승인으로 채워질 칸 중 아직 비어 있는 것. */
function missingLedgerFields(worker: WorkerNextActionInput['worker']): string[] {
  if (!worker) return [];
  const blanks: string[] = [];
  if (!worker.name || worker.name === '(미확정)') blanks.push('성명');
  if (!worker.birthDate) blanks.push('생년월일');
  if (!worker.hireDate) blanks.push('입사일');
  return blanks;
}

/**
 * 할일 목록을 한 줄 요약으로 줄인다 (근로자 목록의 「다음 할일」 칸용).
 * 예: "성명 확인필요 외 2건"
 */
export function summarizeNextActions(actions: NextAction[]): string {
  if (actions.length === 0) return '';
  const head = actions[0].subject;
  return actions.length === 1 ? head : `${head} 외 ${actions.length - 1}건`;
}

// ──────────────────────────────────────────────
// 6단계: 지원금 신청 검증 (R-3xx)
// ──────────────────────────────────────────────

const SUBSIDY_APPROVE_PATH = '지원금 안내 탭 → 검증 → 승인';

/**
 * 지원금 규칙 → 담당자 동선.
 *
 * 근로자(R-2xx)와 결정적으로 다른 점: 고칠 대상이 대부분 **기업이 보낸 서류**다.
 * 그래서 "우리 DB에서 수정"이 아니라 "기업에 다시 요청"이 맞는 경우가 많다.
 * 특히 금액·계좌는 우리가 고치면 안 된다 — 신청인이 적은 값이므로 수정본을 받아야 한다.
 */
const SUBSIDY_RULE_GUIDE: Record<string, RuleGuide> = {
  'R-301': {
    subject: '사업자등록번호 확인필요',
    where: '문서함 → 지원금 지급신청서 → 검토 (또는 기업 DB → 수정 → 사업자등록번호)',
    then: '신청서와 기업DB 중 어느 쪽이 맞는지 확인하고 맞춰주세요.',
  },
  'R-301b': {
    subject: '신청서 기재·서명 확인필요',
    where: '문서함 → 지원금 지급신청서 → 검토',
    then: '실제로 적혀 있는데 AI가 못 읽은 것이면 검토에서 채우고, 정말 빠졌으면 기업에 다시 요청하세요.',
  },
  'R-302': {
    subject: '산출내역 성명 확인필요',
    where: '문서함 → 지원금 산출내역 → 검토 (또는 근로자 DB 탭 → 수정 → 성명)',
    then: '산출내역 성명이 근로자 DB와 다릅니다. 동명이인·오타 여부를 확인하세요.',
  },
  'R-303': {
    subject: '신청 금액이 산정식과 다름',
    where: '문서함 → 지원금 산출내역 → 검토',
    then: '기업이 적어 보낸 금액이 산정식(인턴 40만·채용 50만 상한)과 다릅니다. 금액은 우리가 고치지 말고 기업에 수정 요청하세요.',
  },
  'R-304': {
    subject: '지원금 유형·기간 확인필요',
    where: '문서함 → 지원금 산출내역 / 표준근로계약서 → 검토',
    then: '신청한 회차·유형(인턴/채용)이 근로계약서 인턴약정기간과 맞는지 확인하세요.',
  },
  'R-305': {
    subject: '4대보험 취득일 확인필요',
    where: '문서함 → 4대보험 가입자명부 → 검토',
    then: '참여자가 명부에 있는지, 취득일이 인턴 시작일과 맞는지 확인하세요.',
  },
  'R-306': {
    subject: '명세서 기본급 확인필요',
    where: '문서함 → 급여명세서 / 표준근로계약서 → 검토',
    then: '명세서 기본급이 근로계약서 월급여보다 적습니다. 계약과 실지급이 다른 사유를 확인하세요.',
  },
  'R-307': {
    subject: '이체금액 불일치',
    where: '문서함 → 급여 이체확인증 / 급여명세서 → 검토',
    then: '실제 이체액과 명세서 차감지급액이 다릅니다. 분할이체·추가공제 내역을 확인하세요.',
  },
  'R-308': {
    subject: '통장 은행명 확인필요',
    where: '문서함 → 통장사본 / 지원금 지급신청서 → 검토',
    then: '신청서와 통장사본의 은행명이 다릅니다. 지급 전에 반드시 맞춰야 합니다.',
  },
  'R-308a': {
    subject: '통장 예금주 확인필요',
    where: '문서함 → 통장사본 / 지원금 지급신청서 → 검토',
    then: '신청서와 통장사본의 예금주가 다릅니다. 지급 전에 반드시 맞춰야 합니다.',
  },
  'R-308b': {
    subject: '계좌번호 확인필요',
    where: '문서함 → 통장사본 / 지원금 지급신청서 → 검토',
    then: '신청서와 통장사본의 계좌번호가 다릅니다. 지급 전에 반드시 맞춰야 합니다.',
  },
  'R-308c': {
    subject: '법인명의 계좌인지 확인필요',
    where: '문서함 → 통장사본 → 검토 (또는 기업 DB → 수정 → 기업명)',
    then: '통장 예금주가 기업 상호와 다릅니다. 대표자 개인계좌면 지급이 어려울 수 있으니 기업에 확인하세요.',
  },
  'R-309': {
    subject: '신청 총액이 내역 합계와 다름',
    where: '문서함 → 지원금 지급신청서 / 지원금 산출내역 → 검토',
    then: '총액과 내역 합계가 맞지 않습니다. 기업에 수정된 신청서를 다시 요청하세요.',
  },
};

const SUBSIDY_GENERIC_GUIDE: RuleGuide = {
  subject: '확인필요',
  where: `${SUBSIDY_APPROVE_PATH} → 근거 보기`,
  then: '근거를 확인하고 서류를 고치거나, 문제없으면 승인하세요.',
  failThen: '지급 요건에 맞지 않아 승인할 수 없습니다. 근거를 확인하세요.',
};

export interface SubsidyNextActionInput {
  documents: RequiredDocPresence[];
  rules: RuleResult[];
}

/**
 * 지원금 신청 1건(기업 단위)의 검증 결과를 담당자 할일로 바꾼다.
 * 근로자 쪽과 같은 규칙이다 — 걸린 게 없으면 「승인만 하면 됩니다」가 반드시 나온다.
 */
export function deriveSubsidyNextActions(input: SubsidyNextActionInput): NextAction[] {
  const actions: NextAction[] = [];

  for (const doc of input.documents) {
    if (doc.optional) continue;
    if (!doc.present) {
      actions.push({
        code: `DOC_MISSING:${doc.documentType}`,
        severity: 'BLOCKER',
        subject: `${doc.label} 미제출`,
        detail: `지원금 신청 필수서류인 ${doc.label}가 문서함에 없습니다.`,
        where: '문서함 → 업로드 (또는 기업에 제출 요청)',
        then: '올리고 분석하면 검증이 자동으로 다시 돌아갑니다.',
      });
    } else if (!doc.analyzed) {
      actions.push({
        code: `DOC_NOT_ANALYZED:${doc.documentType}`,
        severity: 'BLOCKER',
        subject: `${doc.label} 분석 안 됨`,
        detail: `${doc.label}는 올라와 있지만 추출된 항목이 없습니다.`,
        where: '문서함 → 해당 서류 → 서류 유형 지정 후 분석',
        then: '항목이 채워지면 검증이 자동으로 다시 돌아갑니다.',
      });
    }
  }

  for (const rule of input.rules) {
    if (rule.verdict === 'PASS') continue;
    const guide = SUBSIDY_RULE_GUIDE[rule.ruleId] ?? SUBSIDY_GENERIC_GUIDE;
    const isFail = rule.verdict === 'FAIL';
    actions.push({
      code: `RULE:${rule.ruleId}`,
      severity: isFail ? 'BLOCKER' : 'REVIEW',
      subject: guide.subject,
      detail: rule.message || rule.label,
      where: guide.where,
      then: (isFail ? guide.failThen : undefined) ?? guide.then,
      ruleId: rule.ruleId,
    });
  }

  if (actions.length === 0) {
    actions.push({
      code: 'APPROVE',
      severity: 'READY',
      subject: '승인만 하면 됩니다',
      detail: '걸린 항목이 없습니다. 신청 금액·계좌가 서류와 모두 일치합니다.',
      where: SUBSIDY_APPROVE_PATH,
      then: '승인하면 판정 이력이 남고 지급 절차로 넘어갑니다.',
    });
  }

  return actions.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
