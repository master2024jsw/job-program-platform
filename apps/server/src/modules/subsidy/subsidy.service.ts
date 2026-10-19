import { Logger, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Worker } from '../workers/worker.entity';
import { SubsidySetting } from './subsidy-setting.entity';
import { SubsidyCalculation } from './subsidy-calculation.entity';
import { CreateSubsidyCalculationDto } from './dto/create-subsidy-calculation.dto';
import { MailLogStatus, ApplicationStatus } from '@job-program/shared';
import { MailService } from '../mail/mail.service';

const DEFAULT_ELIGIBILITY_MONTHS = 3;
/** salary(월급)를 일할 계산할 때 사용하는 월 평균 일수 기준 */
const DAYS_PER_MONTH = 30;

export interface SubsidyCalculationRow {
  id: string;
  workerId: string;
  workerName: string;
  companyName: string | null;
  periodLabel: string;
  workedDays: number;
  baseSalary: number;
  dailyWage: number;
  calculatedAmount: number;
  changeDetected: boolean;
  changeSummary: string | null;
  createdAt: string;
}

export interface SubsidyEligibilityRow {
  workerId: string;
  workerName: string;
  workerEmail: string | null;
  companyId: string | null;
  companyName: string | null;
  /** 안내 메일을 받을 주소. 지원금 서류는 기업이 제출하므로 기업 메일로 보낸다. */
  companyEmail: string | null;
  hireDate: string;
  eligibleDate: string;
  daysUntilEligible: number;
  eligible: boolean;
  /** 이미 지원금 안내를 보낸 사람인지 (applicationStatus = SUBSIDY_GUIDANCE) */
  guidanceSent: boolean;
}

/**
 * 아직 안내 대상이 아닌 근로자 1명.
 *
 * 왜 이걸 따로 돌려주나:
 * 예전에는 조건에 안 맞는 근로자를 그냥 걸러서 화면에서 사라지게 했다.
 * 그러면 담당자는 "근로자 DB에는 있는데 지원금 안내에는 왜 없지?"에서 막힌다
 * (2026-10-19 실제 사용자 질문 — 김영희가 검증 승인 전이라 안 보였다).
 * 사라지게 두지 말고 **왜 아닌지와 무엇을 하면 되는지**를 같이 보여준다.
 * 안내 메일 발송(`sendGuidance`)은 여전히 `listEligibility` 만 쓰므로,
 * 여기에 뜬다고 해서 검증을 건너뛰고 메일이 나가지는 않는다.
 */
export interface SubsidyPendingRow {
  workerId: string;
  workerName: string;
  companyId: string | null;
  companyName: string | null;
  hireDate: string | null;
  /** 왜 안내 대상이 아닌가. */
  reason: string;
  /** 담당자가 무엇을 하면 되는가. */
  action: string;
  /** 「검증하러 가기」를 띄울 수 있는가 (소속 기업이 있어야 검증을 돌린다). */
  canValidate: boolean;
}

/** 날짜 문자열(YYYY-MM-DD)에 개월수를 더한다. 대상 월에 같은 일자가 없으면 말일로 보정한다. */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(d, lastDayOfTargetMonth);
  // toISOString()은 UTC로 변환되어 시간대에 따라 날짜가 하루 밀릴 수 있으므로 로컬 값을 직접 포맷한다.
  const mm = String(targetMonth + 1).padStart(2, '0');
  const dd = String(targetDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function todayLocalDateString(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

@Injectable()
export class SubsidyService {
  private readonly logger = new Logger(SubsidyService.name);

  constructor(
    @InjectRepository(SubsidySetting)
    private readonly settingsRepository: Repository<SubsidySetting>,
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
    @InjectRepository(SubsidyCalculation)
    private readonly calculationsRepository: Repository<SubsidyCalculation>,
    private readonly mailService: MailService,
  ) {}

  /**
   * 사업별 1행. 해당 사업 행이 없으면, 스키마 변경 전 남아있던 싱글턴(business_id=NULL) 행의
   * 값을 이어받거나(최초 1회) 기본값(3개월)으로 새로 만든다.
   */
  async getSettings(businessId: string): Promise<SubsidySetting> {
    const existing = await this.settingsRepository.findOne({ where: { businessId } });
    if (existing) return existing;

    const legacy = await this.settingsRepository.findOne({ where: { businessId: IsNull() } });
    if (legacy) {
      legacy.businessId = businessId;
      return this.settingsRepository.save(legacy);
    }

    const created = this.settingsRepository.create({ businessId, eligibilityMonths: DEFAULT_ELIGIBILITY_MONTHS });
    return this.settingsRepository.save(created);
  }

  async updateSettings(businessId: string, eligibilityMonths: number): Promise<SubsidySetting> {
    const settings = await this.getSettings(businessId);
    settings.eligibilityMonths = eligibilityMonths;
    return this.settingsRepository.save(settings);
  }

  /**
   * 지원금 안내 메일을 기업별로 한 통씩 보낸다.
   *
   * 지원금 신청서류는 기업이 제출하므로 수신자는 **기업 메일**이다(근로자 메일이 아니다).
   * 선택한 근로자를 기업별로 묶어, 한 기업에 여러 명이면 메일 한 통에 명단을 담는다.
   *
   * 발송에 성공한 근로자만 applicationStatus 를 SUBSIDY_GUIDANCE 로 바꾼다 —
   * 실패했는데 '안내함'으로 표시되면 안 된다.
   */
  async sendGuidance(
    businessId: string,
    templateId: string,
    workerIds: string[],
  ): Promise<{
    sent: Array<{ companyName: string; to: string; workerNames: string[] }>;
    skipped: Array<{ companyName: string; reason: string; workerNames: string[] }>;
  }> {
    if (!workerIds.length) {
      throw new BadRequestException('발송할 근로자를 선택하세요.');
    }

    const rows = (await this.listEligibility(businessId)).filter((r) => workerIds.includes(r.workerId));
    if (!rows.length) {
      throw new BadRequestException('선택한 근로자가 안내 대상이 아닙니다. 검증이 완료되었는지 확인하세요.');
    }

    // 기업별로 묶는다. 기업이 없는 근로자는 보낼 곳이 없으므로 건너뛴다.
    const byCompany = new Map<string, SubsidyEligibilityRow[]>();
    const sent: Array<{ companyName: string; to: string; workerNames: string[] }> = [];
    const skipped: Array<{ companyName: string; reason: string; workerNames: string[] }> = [];

    for (const r of rows) {
      if (!r.companyId) {
        skipped.push({ companyName: '(소속 기업 없음)', reason: '근로자에게 소속 기업이 없습니다.', workerNames: [r.workerName] });
        continue;
      }
      const list = byCompany.get(r.companyId) ?? [];
      list.push(r);
      byCompany.set(r.companyId, list);
    }

    for (const [companyId, list] of byCompany) {
      const companyName = list[0].companyName ?? '(이름 없음)';
      const names = list.map((r) => r.workerName);

      if (!list[0].companyEmail) {
        skipped.push({ companyName, reason: '기업에 등록된 이메일이 없습니다.', workerNames: names });
        continue;
      }

      // 템플릿에서 쓸 수 있는 변수. 여러 명이면 명단을 줄바꿈으로 넣는다.
      const variables: Record<string, string> = {
        companyName,
        workerName: names.join(', '),
        workerCount: String(names.length),
        workerList: list
          .map((r) => `- ${r.workerName} (입사 ${r.hireDate}, 안내일 ${r.eligibleDate})`)
          .join(String.fromCharCode(10)),
        eligibleDate: list[0].eligibleDate,
        hireDate: list[0].hireDate,
      };

      try {
        const logs = await this.mailService.send({ businessId, companyId, templateId, variables });
        const failed = logs.find((l) => l.status !== MailLogStatus.SUCCESS);
        if (failed) {
          skipped.push({ companyName, reason: failed.errorMessage ?? '발송 실패', workerNames: names });
          continue;
        }
        sent.push({ companyName, to: list[0].companyEmail, workerNames: names });

        // 발송 성공한 근로자만 '지원금 안내' 상태로
        for (const r of list) {
          await this.workersRepository.update(r.workerId, {
            applicationStatus: ApplicationStatus.SUBSIDY_GUIDANCE,
          });
        }
      } catch (e) {
        skipped.push({ companyName, reason: e instanceof Error ? e.message : '발송 실패', workerNames: names });
      }
    }

    this.logger.log(`지원금 안내 발송: 성공 ${sent.length}개 기업 / 건너뜀 ${skipped.length}`);
    return { sent, skipped };
  }

  async listEligibility(businessId: string): Promise<SubsidyEligibilityRow[]> {
    const settings = await this.getSettings(businessId);
    const workers = await this.workersRepository.find({
      where: { businessId },
      relations: ['company'],
      order: { hireDate: 'ASC' },
    });
    const today = todayLocalDateString();

    // 검증이 끝난 근로자만 안내 대상이다.
    // 검증 승인 시 applicationStatus 가 APPLICATION_COMPLETE 로 자동 전환되고,
    // 안내 메일을 보내면 SUBSIDY_GUIDANCE 가 된다 (둘 다 '검증 완료 이후' 상태).
    const VERIFIED: (ApplicationStatus | null | undefined)[] = [
      ApplicationStatus.APPLICATION_COMPLETE,
      ApplicationStatus.SUBSIDY_GUIDANCE,
    ];

    return workers
      .filter((w): w is Worker & { hireDate: string } => !!w.hireDate)
      .filter((w) => VERIFIED.includes(w.applicationStatus))
      .map((w) => {
        const eligibleDate = addMonths(w.hireDate, settings.eligibilityMonths);
        return {
          workerId: w.id,
          workerName: w.name,
          workerEmail: w.email ?? null,
          companyId: w.companyId ?? null,
          companyName: w.company?.name ?? null,
          companyEmail: w.company?.email ?? null,
          hireDate: w.hireDate,
          eligibleDate,
          daysUntilEligible: daysBetween(today, eligibleDate),
          eligible: eligibleDate <= today,
          guidanceSent: w.applicationStatus === ApplicationStatus.SUBSIDY_GUIDANCE,
        };
      })
      .sort((a, b) => a.eligibleDate.localeCompare(b.eligibleDate));
  }

  /**
   * 아직 안내 대상이 아닌 근로자와 그 이유.
   * `listEligibility` 가 걸러낸 사람들을 그대로 돌려준다 — 두 목록을 합치면 해당 사업의 전체 근로자다.
   */
  async listPendingEligibility(businessId: string): Promise<SubsidyPendingRow[]> {
    const workers = await this.workersRepository.find({
      where: { businessId },
      relations: ['company'],
      order: { createdAt: 'ASC' },
    });

    const rows: SubsidyPendingRow[] = [];
    for (const w of workers) {
      const reason = this.pendingReason(w);
      if (!reason) continue; // 안내 대상 — listEligibility 에 이미 들어 있다
      rows.push({
        workerId: w.id,
        workerName: w.name,
        companyId: w.companyId ?? null,
        companyName: w.company?.name ?? null,
        hireDate: w.hireDate ?? null,
        reason: reason.reason,
        action: reason.action,
        canValidate: !!w.companyId,
      });
    }
    return rows;
  }

  /**
   * 이 근로자가 왜 안내 대상이 아닌지. 대상이면 null.
   * 막는 조건이 여러 개면 **담당자가 먼저 해야 할 것 하나만** 돌려준다 — 한 번에 하나씩 풀게.
   */
  private pendingReason(worker: Worker): { reason: string; action: string } | null {
    if (!worker.companyId) {
      return {
        reason: '소속 기업이 없습니다.',
        action: '근로자 DB 탭 → 수정 → 소속기업을 지정하세요.',
      };
    }
    if (!worker.hireDate) {
      return {
        reason: '입사일이 없습니다. 지원금 도래일을 계산할 수 없습니다.',
        action: '문서함 → 표준근로계약서를 분석하면 인턴약정 시작일이 입사일로 들어옵니다.',
      };
    }
    const verified =
      worker.applicationStatus === ApplicationStatus.APPLICATION_COMPLETE ||
      worker.applicationStatus === ApplicationStatus.SUBSIDY_GUIDANCE;
    if (!verified) {
      return {
        reason:
          worker.applicationStatus === ApplicationStatus.UNDER_REVIEW
            ? '근로자 신청 검증이 아직 검토 중입니다.'
            : '근로자 신청 검증 승인을 아직 받지 않았습니다.',
        action: '근로자 DB 탭 → 신청 검증 → 걸린 항목을 확인하고 승인하세요. 승인하면 여기 목록에 올라옵니다.',
      };
    }
    return null;
  }

  /**
   * 근로일수 비례 산정: 일급(salary/30) × 근로일수.
   * 같은 근로자의 직전 산정 건과 급여·근로일수를 비교해 변경사항이 있으면 changeSummary에 기록한다.
   */
  async calculate(dto: CreateSubsidyCalculationDto): Promise<SubsidyCalculationRow> {
    const worker = await this.workersRepository.findOne({ where: { id: dto.workerId }, relations: ['company'] });
    if (!worker) {
      throw new NotFoundException(`근로자(${dto.workerId})를 찾을 수 없습니다.`);
    }
    if (worker.salary == null) {
      throw new BadRequestException('근로자의 급여(salary) 정보가 없어 지원금을 산정할 수 없습니다.');
    }

    const dailyWage = worker.salary / DAYS_PER_MONTH;
    const calculatedAmount = Math.round(dailyWage * dto.workedDays);

    const previous = await this.calculationsRepository.findOne({
      where: { workerId: dto.workerId },
      order: { createdAt: 'DESC' },
    });

    let changeSummary: string | null = null;
    if (previous) {
      const notes: string[] = [];
      if (previous.baseSalary !== worker.salary) {
        notes.push(`급여 ${previous.baseSalary.toLocaleString()}원 → ${worker.salary.toLocaleString()}원 변경`);
      }
      if (previous.workedDays !== dto.workedDays) {
        notes.push(`근로일수 ${previous.workedDays}일 → ${dto.workedDays}일 변경`);
      }
      if (notes.length > 0) {
        changeSummary = notes.join(', ');
      }
    }

    const calculation = this.calculationsRepository.create({
      businessId: dto.businessId,
      workerId: dto.workerId,
      periodLabel: dto.periodLabel,
      workedDays: dto.workedDays,
      baseSalary: worker.salary,
      dailyWage,
      calculatedAmount,
      changeDetected: changeSummary !== null,
      changeSummary,
    });
    const saved = await this.calculationsRepository.save(calculation);

    return {
      id: saved.id,
      workerId: worker.id,
      workerName: worker.name,
      companyName: worker.company?.name ?? null,
      periodLabel: saved.periodLabel,
      workedDays: saved.workedDays,
      baseSalary: saved.baseSalary,
      dailyWage: saved.dailyWage,
      calculatedAmount: saved.calculatedAmount,
      changeDetected: saved.changeDetected,
      changeSummary: saved.changeSummary ?? null,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async listCalculations(params: { businessId?: string; workerId?: string }): Promise<SubsidyCalculationRow[]> {
    const where: Record<string, unknown> = {};
    if (params.businessId) where.businessId = params.businessId;
    if (params.workerId) where.workerId = params.workerId;

    const calculations = await this.calculationsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
    if (calculations.length === 0) return [];

    const workers = await this.workersRepository.find({ relations: ['company'] });
    const workerMap = new Map(workers.map((w) => [w.id, w]));

    return calculations.map((c) => {
      const worker = workerMap.get(c.workerId);
      return {
        id: c.id,
        workerId: c.workerId,
        workerName: worker?.name ?? '(삭제된 근로자)',
        companyName: worker?.company?.name ?? null,
        periodLabel: c.periodLabel,
        workedDays: c.workedDays,
        baseSalary: c.baseSalary,
        dailyWage: c.dailyWage,
        calculatedAmount: c.calculatedAmount,
        changeDetected: c.changeDetected,
        changeSummary: c.changeSummary ?? null,
        createdAt: c.createdAt.toISOString(),
      };
    });
  }

  async removeCalculation(id: string): Promise<void> {
    const calculation = await this.calculationsRepository.findOne({ where: { id } });
    if (!calculation) {
      throw new NotFoundException(`산정 내역(${id})을 찾을 수 없습니다.`);
    }
    await this.calculationsRepository.remove(calculation);
  }
}
