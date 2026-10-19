/**
 * 일반형 지원금 계산기 테스트 — 전부 합성(가짜) 데이터다. 실제 개인정보를 쓰지 않는다.
 * 설계서 M4: "합성 사례에서 근거와 버전이 재현되며 자료 없음 처리 정확".
 *
 * 기대값의 출처는 사용자가 제공한 지원내용 표(일반형 행)이다:
 *   인턴 지원금 — 입사일로부터 3개월간 월 급여의 50%, 월 최대 40만원, 최대 3개월
 *   채용 지원금 — 인턴종료 후 6개월 이상 계속고용계약 체결 시, 3개월간 월 급여의 50%, 월 최대 50만원, 최대 3개월
 *   1인당 최대 270만원
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  addMonths,
  calculateGeneralType,
  proRataAmount,
  roundAmount,
  type CalcInput,
  type SubsidyPolicy,
} from './general-type-calculator';

const policy = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../../resources/subsidy-policies/SENIOR-2026-GENERAL.json'),
    'utf-8',
  ),
) as SubsidyPolicy & { perPersonTotalCapWon: number; checksum: { sum: number } };

/** 기본 입력: 모든 조건이 충족되고 충분히 시간이 지난 상태. */
function baseInput(over: Partial<CalcInput> = {}): CalcInput {
  return {
    monthlySalaryWon: 2_500_000,
    hireDate: '2026-01-01',
    internEndDate: '2026-04-01',
    continuousHireDate: '2026-04-01',
    continuousContractMonths: 12,
    alreadyApprovedWon: 0,
    asOfDate: '2027-12-31',
    ...over,
  };
}

const intern = (r: ReturnType<typeof calculateGeneralType>) =>
  r.benefits.find((b) => b.benefitType === 'INTERN')!;
const hire = (r: ReturnType<typeof calculateGeneralType>) =>
  r.benefits.find((b) => b.benefitType === 'HIRE')!;

describe('정책 원장', () => {
  it('표의 총액 270만원과 월상한x회차 합계가 일치한다', () => {
    const sum = policy.benefits.reduce((a, b) => a + b.monthlyCapWon * b.maxRounds, 0);
    expect(sum).toBe(2_700_000);
    expect(policy.perPersonTotalCapWon).toBe(2_700_000);
  });

  it('인턴 월상한 40만원, 채용 월상한 50만원, 각 3회차', () => {
    const i = policy.benefits.find((b) => b.benefitType === 'INTERN')!;
    const h = policy.benefits.find((b) => b.benefitType === 'HIRE')!;
    expect(i.monthlyCapWon).toBe(400_000);
    expect(i.maxRounds).toBe(3);
    expect(h.monthlyCapWon).toBe(500_000);
    expect(h.maxRounds).toBe(3);
    expect(i.rateOfMonthlySalary).toBe(0.5);
    expect(h.rateOfMonthlySalary).toBe(0.5);
  });
});

describe('회차 금액 = min(월급여 x 50%, 월 상한)', () => {
  const i = { rateOfMonthlySalary: 0.5, monthlyCapWon: 400_000 } as never;
  const h = { rateOfMonthlySalary: 0.5, monthlyCapWon: 500_000 } as never;

  it('급여가 높으면 상한이 적용된다', () => {
    expect(roundAmount(2_500_000, i)).toBe(400_000); // 125만 -> 40만
    expect(roundAmount(2_500_000, h)).toBe(500_000); // 125만 -> 50만
  });

  it('급여가 낮으면 50%가 그대로 적용된다', () => {
    expect(roundAmount(600_000, i)).toBe(300_000); // 30만 < 40만
    expect(roundAmount(900_000, h)).toBe(450_000); // 45만 < 50만
  });

  it('상한 경계값에서 상한과 같다', () => {
    expect(roundAmount(800_000, i)).toBe(400_000);
    expect(roundAmount(1_000_000, h)).toBe(500_000);
  });

  it('1원 단위는 내림한다 (기업에 유리하게 올리지 않는다)', () => {
    expect(roundAmount(600_001, i)).toBe(300_000); // 300000.5 -> 300000
  });
});

describe('표준 사례 — 모든 조건 충족', () => {
  const r = calculateGeneralType(policy, baseInput());

  it('인턴 3회차 x 40만 = 120만', () => {
    expect(intern(r).verdict).toBe('PASS');
    expect(intern(r).rounds.filter((x) => x.verdict === 'PASS')).toHaveLength(3);
    expect(intern(r).totalWon).toBe(1_200_000);
  });

  it('채용 3회차 x 50만 = 150만', () => {
    expect(hire(r).verdict).toBe('PASS');
    expect(hire(r).totalWon).toBe(1_500_000);
  });

  it('합계가 표의 1인당 최대 270만원과 같다', () => {
    expect(r.grandTotalWon).toBe(2_700_000);
    expect(r.capWarning).toBeNull();
  });

  it('인턴 회차 기간이 입사일 기준 월 단위로 끊긴다', () => {
    const rounds = intern(r).rounds;
    expect(rounds[0].periodStart).toBe('2026-01-01');
    expect(rounds[0].periodEnd).toBe('2026-01-31');
    expect(rounds[1].periodStart).toBe('2026-02-01');
    expect(rounds[2].periodEnd).toBe('2026-03-31');
  });

  it('어떤 정책 버전으로 계산했는지 결과에 남는다', () => {
    expect(r.policyId).toBe('SENIOR-2026-GENERAL');
    expect(r.policyVersion).toBe('1.0.0');
    expect(r.input.monthlySalaryWon).toBe(2_500_000);
  });
});

describe('자료가 없을 때 — 0원이나 충족으로 처리하지 않는다 (설계서 §10.4)', () => {
  it('월급여를 모르면 INSUFFICIENT_DATA 이고 금액을 만들지 않는다', () => {
    const r = calculateGeneralType(policy, baseInput({ monthlySalaryWon: null }));
    expect(intern(r).verdict).toBe('INSUFFICIENT_DATA');
    expect(intern(r).totalWon).toBe(0);
    expect(r.grandTotalWon).toBe(0);
  });

  it('입사일을 모르면 인턴 지원금은 INSUFFICIENT_DATA', () => {
    const r = calculateGeneralType(policy, baseInput({ hireDate: null }));
    expect(intern(r).verdict).toBe('INSUFFICIENT_DATA');
  });

  it('계속고용 개시일이 없으면 채용 지원금은 NOT_APPLICABLE (아직 대상 아님)', () => {
    const r = calculateGeneralType(policy, baseInput({ continuousHireDate: null }));
    expect(hire(r).verdict).toBe('NOT_APPLICABLE');
    expect(hire(r).totalWon).toBe(0);
  });

  it('계약기간을 모르면 NEEDS_REVIEW — 체결 사실만으로 6개월 요건을 통과시키지 않는다 (U-02)', () => {
    const r = calculateGeneralType(policy, baseInput({ continuousContractMonths: null }));
    expect(hire(r).verdict).toBe('NEEDS_REVIEW');
    expect(hire(r).totalWon).toBe(0);
    expect(hire(r).reason).toContain('6개월 이상');
  });

  it('계약기간이 6개월 미만이면 NOT_APPLICABLE', () => {
    const r = calculateGeneralType(policy, baseInput({ continuousContractMonths: 5 }));
    expect(hire(r).verdict).toBe('NOT_APPLICABLE');
    expect(hire(r).totalWon).toBe(0);
  });

  it('날짜 형식이 틀리면 유효하지 않은 것으로 본다', () => {
    const r = calculateGeneralType(policy, baseInput({ hireDate: '2026/01/01' }));
    expect(intern(r).verdict).toBe('INSUFFICIENT_DATA');
  });

  it('2월 30일 같은 없는 날짜는 거절한다', () => {
    const r = calculateGeneralType(policy, baseInput({ hireDate: '2026-02-30' }));
    expect(intern(r).verdict).toBe('INSUFFICIENT_DATA');
  });
});

describe('기준일 — 아직 안 지난 회차는 산정하지 않는다', () => {
  it('입사 직후에는 인턴 회차가 전부 NOT_APPLICABLE 이고 0원이다', () => {
    const r = calculateGeneralType(
      policy,
      baseInput({ hireDate: '2026-10-03', internEndDate: '2026-12-02', asOfDate: '2026-10-15' }),
    );
    expect(intern(r).totalWon).toBe(0);
    expect(intern(r).rounds.every((x) => x.verdict === 'NOT_APPLICABLE')).toBe(true);
    expect(intern(r).verdict).toBe('NOT_APPLICABLE');
  });

  it('2개월만 지났으면 2회차까지만 산정한다', () => {
    const r = calculateGeneralType(
      policy,
      baseInput({ hireDate: '2026-01-01', internEndDate: '2026-04-01', asOfDate: '2026-03-15' }),
    );
    const passed = intern(r).rounds.filter((x) => x.verdict === 'PASS');
    expect(passed).toHaveLength(2);
    expect(intern(r).totalWon).toBe(800_000);
  });
});

describe('중도 종료 — 일할계산 (실무 담당 확인 2026-10-15)', () => {
  it('인턴 종료일이 회차 중간이면 그 회차는 일할계산된다', () => {
    // 2/1~2/28 회차 중 2/15 종료 -> 15일. 월급여 250만/30x15 = 125만, x50% = 62.5만 -> 상한 40만
    const r = calculateGeneralType(
      policy,
      baseInput({ hireDate: '2026-01-01', internEndDate: '2026-02-15' }),
    );
    const rounds = intern(r).rounds;
    expect(rounds[0].verdict).toBe('PASS'); // 1/1~1/31 은 온전함
    expect(rounds[1].verdict).toBe('PASS');
    expect(rounds[1].proRata?.coveredDays).toBe(15);
    expect(rounds[1].amountWon).toBe(400_000); // 상한 적용
    expect(rounds[1].proRata?.capApplied).toBe(true);
    expect(intern(r).totalWon).toBe(800_000);
  });

  it('일할급여가 80만원을 넘으면 그냥 40만원이다 (담당자 설명 그대로)', () => {
    // 월급여 180만, 15일 -> 180/30x15 = 90만 (>80만) -> x50% = 45만 -> 상한 40만
    const r = calculateGeneralType(
      policy,
      baseInput({ monthlySalaryWon: 1_800_000, hireDate: '2026-01-01', internEndDate: '2026-02-15' }),
    );
    const round2 = intern(r).rounds[1];
    expect(round2.proRata?.proRatedSalaryWon).toBe(900_000);
    expect(round2.proRata?.beforeCapWon).toBe(450_000);
    expect(round2.amountWon).toBe(400_000);
  });

  it('일할급여가 80만원 미만이면 그 50%가 그대로 지급된다', () => {
    // 월급여 120만, 15일 -> 120/30x15 = 60만 (<80만) -> x50% = 30만 (상한 미적용)
    const r = calculateGeneralType(
      policy,
      baseInput({ monthlySalaryWon: 1_200_000, hireDate: '2026-01-01', internEndDate: '2026-02-15' }),
    );
    const round2 = intern(r).rounds[1];
    expect(round2.proRata?.proRatedSalaryWon).toBe(600_000);
    expect(round2.amountWon).toBe(300_000);
    expect(round2.proRata?.capApplied).toBe(false);
  });

  it('정확히 80만원이면 40만원이다 (분기점 경계)', () => {
    // 월급여 160만, 15일 -> 160/30x15 = 80만 -> x50% = 40만 = 상한
    const r = calculateGeneralType(
      policy,
      baseInput({ monthlySalaryWon: 1_600_000, hireDate: '2026-01-01', internEndDate: '2026-02-15' }),
    );
    const round2 = intern(r).rounds[1];
    expect(round2.proRata?.proRatedSalaryWon).toBe(800_000);
    expect(round2.amountWon).toBe(400_000);
  });

  it('상한은 일할하지 않는다 — 며칠만 일해도 상한은 40만원 그대로다', () => {
    const r = calculateGeneralType(
      policy,
      baseInput({ hireDate: '2026-01-01', internEndDate: '2026-02-20' }),
    );
    const round2 = intern(r).rounds[1]; // 20일. 250만/30x20 = 166만 -> 83만 -> 상한 40만
    expect(round2.amountWon).toBe(400_000);
  });

  it('31일 회차에서도 일할급여가 월급여를 넘지 않는다', () => {
    // 1/1~1/31 (31일) 전체를 채우면 31/30 이 되지만 월급여로 막는다
    const b = proRataAmount(2_500_000, 31, 31, policy.benefits[0], {
      enabled: true,
      divisorDays: 30,
      capIsProRated: false,
    });
    expect(b.proRatedSalaryWon).toBe(2_500_000);
  });

  it('회차가 통째로 인턴기간 밖이면 NOT_APPLICABLE 이다 (보완할 자료가 없으므로)', () => {
    // 인턴 2개월(10/03~12/02). 3회차(12/03~01/02)는 인턴이 끝난 뒤라 대상이 아니다.
    const r = calculateGeneralType(
      policy,
      baseInput({ hireDate: '2026-10-03', internEndDate: '2026-12-02', asOfDate: '2027-01-15' }),
    );
    const rounds = intern(r).rounds;
    expect(rounds[0].verdict).toBe('PASS');
    expect(rounds[1].verdict).toBe('PASS');
    expect(rounds[2].verdict).toBe('NOT_APPLICABLE');
    expect(rounds[2].reason).toContain('산정 대상이 아닙니다');
    expect(rounds[2].reason).not.toContain('일할계산');
    expect(intern(r).totalWon).toBe(800_000);
  });
});

describe('이상한 입력', () => {
  it('계속고용 개시일이 인턴 종료일보다 빠르면 NEEDS_REVIEW', () => {
    const r = calculateGeneralType(
      policy,
      baseInput({ internEndDate: '2026-04-01', continuousHireDate: '2026-03-01' }),
    );
    expect(hire(r).verdict).toBe('NEEDS_REVIEW');
    expect(hire(r).totalWon).toBe(0);
  });

  it('급여가 0이면 NEEDS_REVIEW (0원 지급으로 통과시키지 않는다)', () => {
    const r = calculateGeneralType(policy, baseInput({ monthlySalaryWon: 0 }));
    expect(intern(r).verdict).toBe('NEEDS_REVIEW');
  });

  it('급여가 음수면 NEEDS_REVIEW', () => {
    const r = calculateGeneralType(policy, baseInput({ monthlySalaryWon: -100 }));
    expect(intern(r).verdict).toBe('NEEDS_REVIEW');
  });
});

describe('1인당 총액 상한', () => {
  it('기승인액을 더해 270만을 넘으면 경고한다', () => {
    const r = calculateGeneralType(policy, baseInput({ alreadyApprovedWon: 1_000_000 }));
    expect(r.grandTotalWon).toBe(2_700_000);
    expect(r.capWarning).not.toBeNull();
    expect(r.capWarning).toContain('2,700,000');
  });

  it('정확히 270만이면 경고하지 않는다', () => {
    const r = calculateGeneralType(policy, baseInput({ alreadyApprovedWon: 0 }));
    expect(r.capWarning).toBeNull();
  });
});

describe('월 더하기 — 말일 처리', () => {
  it('1월 31일에 1개월을 더하면 2월 말일이다', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('윤년 2월을 올바르게 처리한다', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('연도를 넘어간다', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
});

describe('실제 자료 형태 — 정세원 사례 (급여 250만, 입사 2026-10-03, 인턴종료 2026-12-02)', () => {
  it('2026-10-15 기준으로는 아직 산정 대상 회차가 없다', () => {
    const r = calculateGeneralType(
      policy,
      baseInput({
        monthlySalaryWon: 2_500_000,
        hireDate: '2026-10-03',
        internEndDate: '2026-12-02',
        continuousHireDate: null,
        continuousContractMonths: null,
        asOfDate: '2026-10-15',
      }),
    );
    expect(r.grandTotalWon).toBe(0);
    expect(intern(r).verdict).toBe('NOT_APPLICABLE');
    expect(hire(r).verdict).toBe('NOT_APPLICABLE');
  });

  it('인턴 2개월 경과 시점에는 2회차 80만원이 산정된다', () => {
    const r = calculateGeneralType(
      policy,
      baseInput({
        monthlySalaryWon: 2_500_000,
        hireDate: '2026-10-03',
        internEndDate: '2026-12-02',
        continuousHireDate: null,
        continuousContractMonths: null,
        asOfDate: '2026-12-05',
      }),
    );
    expect(intern(r).totalWon).toBe(800_000);
    expect(intern(r).rounds[0].periodStart).toBe('2026-10-03');
    expect(intern(r).rounds[0].periodEnd).toBe('2026-11-02');
  });
});
