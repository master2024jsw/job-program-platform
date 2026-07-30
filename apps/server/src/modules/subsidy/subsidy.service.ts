import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from '../workers/worker.entity';
import { SubsidySetting } from './subsidy-setting.entity';
import { SubsidyCalculation } from './subsidy-calculation.entity';
import { CreateSubsidyCalculationDto } from './dto/create-subsidy-calculation.dto';

const SETTINGS_ID = 'default';
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
  hireDate: string;
  eligibleDate: string;
  daysUntilEligible: number;
  eligible: boolean;
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
  constructor(
    @InjectRepository(SubsidySetting)
    private readonly settingsRepository: Repository<SubsidySetting>,
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
    @InjectRepository(SubsidyCalculation)
    private readonly calculationsRepository: Repository<SubsidyCalculation>,
  ) {}

  async getSettings(): Promise<SubsidySetting> {
    const existing = await this.settingsRepository.findOne({ where: { id: SETTINGS_ID } });
    if (existing) return existing;
    const created = this.settingsRepository.create({ id: SETTINGS_ID, eligibilityMonths: DEFAULT_ELIGIBILITY_MONTHS });
    return this.settingsRepository.save(created);
  }

  async updateSettings(eligibilityMonths: number): Promise<SubsidySetting> {
    const settings = await this.getSettings();
    settings.eligibilityMonths = eligibilityMonths;
    return this.settingsRepository.save(settings);
  }

  async listEligibility(): Promise<SubsidyEligibilityRow[]> {
    const settings = await this.getSettings();
    const workers = await this.workersRepository.find({ relations: ['company'], order: { hireDate: 'ASC' } });
    const today = todayLocalDateString();

    return workers
      .filter((w): w is Worker & { hireDate: string } => !!w.hireDate)
      .map((w) => {
        const eligibleDate = addMonths(w.hireDate, settings.eligibilityMonths);
        return {
          workerId: w.id,
          workerName: w.name,
          workerEmail: w.email ?? null,
          companyId: w.companyId ?? null,
          companyName: w.company?.name ?? null,
          hireDate: w.hireDate,
          eligibleDate,
          daysUntilEligible: daysBetween(today, eligibleDate),
          eligible: eligibleDate <= today,
        };
      })
      .sort((a, b) => a.eligibleDate.localeCompare(b.eligibleDate));
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

  async listCalculations(workerId?: string): Promise<SubsidyCalculationRow[]> {
    const calculations = await this.calculationsRepository.find({
      where: workerId ? { workerId } : {},
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
