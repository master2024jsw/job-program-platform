import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { ContractType, Gender, WorkerStatus } from '@job-program/shared';
import { buildExcelBuffer, readExcelRows, type ExcelColumn, type ImportSummary } from '../../common/excel.util';
import { Worker } from './worker.entity';
import { Company } from '../companies/company.entity';
import { CompanyBusiness } from '../companies/company-business.entity';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';

const GENDER_LABEL: Record<Gender, string> = { [Gender.MALE]: '남', [Gender.FEMALE]: '여' };
const GENDER_BY_LABEL: Record<string, Gender> = { 남: Gender.MALE, 여: Gender.FEMALE, MALE: Gender.MALE, FEMALE: Gender.FEMALE };

const CONTRACT_LABEL: Record<ContractType, string> = {
  [ContractType.FULL_TIME]: '정규직',
  [ContractType.PART_TIME]: '단시간',
  [ContractType.DAILY]: '일용직',
};
const CONTRACT_BY_LABEL: Record<string, ContractType> = {
  정규직: ContractType.FULL_TIME,
  단시간: ContractType.PART_TIME,
  일용직: ContractType.DAILY,
  FULL_TIME: ContractType.FULL_TIME,
  PART_TIME: ContractType.PART_TIME,
  DAILY: ContractType.DAILY,
};

const WORKER_STATUS_LABEL: Record<WorkerStatus, string> = {
  [WorkerStatus.ACTIVE]: '재직',
  [WorkerStatus.ON_LEAVE]: '휴직',
  [WorkerStatus.RESIGNED]: '퇴사',
};
const WORKER_STATUS_BY_LABEL: Record<string, WorkerStatus> = {
  재직: WorkerStatus.ACTIVE,
  휴직: WorkerStatus.ON_LEAVE,
  퇴사: WorkerStatus.RESIGNED,
  ACTIVE: WorkerStatus.ACTIVE,
  ON_LEAVE: WorkerStatus.ON_LEAVE,
  RESIGNED: WorkerStatus.RESIGNED,
};

const EXCEL_COLUMNS: ExcelColumn[] = [
  { header: '이름', key: 'name', width: 14 },
  { header: '생년월일', key: 'birthDate', width: 14 },
  { header: '성별', key: 'gender', width: 8 },
  { header: '연락처', key: 'phone', width: 16 },
  { header: '이메일', key: 'email', width: 24 },
  { header: '주소', key: 'address', width: 28 },
  { header: '소속기업 사업자등록번호', key: 'companyBrn', width: 20 },
  { header: '직급', key: 'position', width: 12 },
  { header: '계약형태', key: 'contractType', width: 10 },
  { header: '입사일', key: 'hireDate', width: 14 },
  { header: '퇴사일', key: 'resignDate', width: 14 },
  { header: '급여', key: 'salary', width: 12 },
  { header: '상태', key: 'status', width: 10 },
  { header: '메모', key: 'memo', width: 30 },
];

const HEADER_TO_KEY = Object.fromEntries(EXCEL_COLUMNS.map((c) => [c.header, c.key]));

/** '2026년 참여자관리' 시트 헤더와 반드시 일치해야 한다. */
const LEDGER_COLUMNS: ExcelColumn[] = [
  { header: '순번', key: 'seq', width: 6 },
  { header: '기업명', key: 'companyName', width: 22 },
  { header: '연락처', key: 'phone', width: 16 },
  { header: '이메일', key: 'email', width: 24 },
  { header: '참여유형', key: 'participationType', width: 12 },
  { header: '성명', key: 'name', width: 12 },
  { header: '주민번호', key: 'residentNumber', width: 18 },
  { header: '인턴시작일', key: 'internStartDate', width: 14 },
  { header: '인턴종료일', key: 'internEndDate', width: 14 },
  { header: '퇴사일', key: 'resignDate', width: 14 },
];

/** 주민번호 표시용 마스킹: birthDate(YYYY-MM-DD) + gender → YYMMDD-G###### */
function maskRrnForLedger(worker: Worker): string {
  if (!worker.birthDate) return '';
  const ymd = worker.birthDate.replace(/-/g, '').slice(2); // YYMMDD
  const gDigit = worker.gender === Gender.MALE ? '1' : worker.gender === Gender.FEMALE ? '2' : '';
  return `${ymd}-${gDigit}######`;
}

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(CompanyBusiness)
    private readonly companyBusinessRepository: Repository<CompanyBusiness>,
  ) {}

  create(dto: CreateWorkerDto): Promise<Worker> {
    const worker = this.workersRepository.create(dto);
    return this.workersRepository.save(worker);
  }

  findAll(params: { keyword?: string; companyId?: string; businessId?: string }): Promise<Worker[]> {
    const where: Record<string, unknown> = {};
    if (params.keyword) {
      where.name = Like(`%${params.keyword}%`);
    }
    if (params.companyId) {
      where.companyId = params.companyId;
    }
    if (params.businessId) {
      where.businessId = params.businessId;
    }
    return this.workersRepository.find({
      where: Object.keys(where).length ? where : undefined,
      relations: ['company'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Worker> {
    const worker = await this.workersRepository.findOne({ where: { id }, relations: ['company'] });
    if (!worker) {
      throw new NotFoundException(`근로자(id=${id})를 찾을 수 없습니다.`);
    }
    return worker;
  }

  async update(id: string, dto: UpdateWorkerDto): Promise<Worker> {
    const worker = await this.findOne(id);
    Object.assign(worker, dto);
    return this.workersRepository.save(worker);
  }

  async remove(id: string): Promise<void> {
    const result = await this.workersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`근로자(id=${id})를 찾을 수 없습니다.`);
    }
  }

  async exportToExcel(): Promise<Buffer> {
    const workers = await this.findAll({});
    const rows = workers.map((w) => ({
      name: w.name,
      birthDate: w.birthDate,
      gender: w.gender ? GENDER_LABEL[w.gender] : '',
      phone: w.phone ?? '',
      email: w.email ?? '',
      address: w.address ?? '',
      companyBrn: w.company?.businessRegistrationNumber ?? '',
      position: w.position ?? '',
      contractType: w.contractType ? CONTRACT_LABEL[w.contractType] : '',
      hireDate: w.hireDate ?? '',
      resignDate: w.resignDate ?? '',
      salary: w.salary ?? '',
      status: WORKER_STATUS_LABEL[w.status] ?? w.status,
      memo: w.memo ?? '',
    }));
    return buildExcelBuffer('근로자목록', EXCEL_COLUMNS, rows);
  }

  /**
   * '2026년 참여자관리' 대장 형식으로 내보낸다.
   * 이메일·참여유형은 Company/CompanyBusiness 조인값, 주민번호는 마스킹.
   */
  async exportLedger(businessId?: string): Promise<Buffer> {
    const workers = await this.workersRepository.find({
      where: businessId ? { businessId } : undefined,
      relations: ['company'],
      order: { createdAt: 'ASC' },
    });

    // CompanyBusiness 참여유형 일괄 조회
    const cbMap = new Map<string, CompanyBusiness>();
    if (businessId) {
      const companyIds = [...new Set(workers.map((w) => w.companyId).filter((id): id is string => !!id))];
      if (companyIds.length) {
        const cbs = await this.companyBusinessRepository.find({
          where: { companyId: In(companyIds), businessId },
        });
        for (const cb of cbs) cbMap.set(cb.companyId, cb);
      }
    }

    const rows = workers.map((w, i) => ({
      seq: i + 1,
      companyName: w.company?.name ?? '',
      phone: w.phone ?? '',
      email: w.company?.email ?? '',
      participationType: cbMap.get(w.companyId ?? '')?.participationType ?? '',
      name: w.name,
      residentNumber: maskRrnForLedger(w),
      internStartDate: w.hireDate ?? '',
      internEndDate: w.internEndDate ?? '',
      resignDate: w.resignDate ?? '',
    }));

    return buildExcelBuffer('2026년 참여자관리', LEDGER_COLUMNS, rows);
  }

  async importFromExcel(buffer: Buffer, businessId?: string): Promise<ImportSummary> {
    const rows = await readExcelRows(buffer, HEADER_TO_KEY);
    const summary: ImportSummary = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2;
      const row = rows[i];

      if (!row.name) {
        summary.errors.push({ row: rowNumber, message: '이름이 비어 있습니다.' });
        continue;
      }
      if (!row.birthDate) {
        summary.errors.push({ row: rowNumber, message: '생년월일이 비어 있습니다.' });
        continue;
      }

      const gender = row.gender ? GENDER_BY_LABEL[row.gender] : undefined;
      if (row.gender && !gender) {
        summary.errors.push({ row: rowNumber, message: `성별 값을 인식할 수 없습니다: ${row.gender}` });
        continue;
      }
      const contractType = row.contractType ? CONTRACT_BY_LABEL[row.contractType] : undefined;
      if (row.contractType && !contractType) {
        summary.errors.push({ row: rowNumber, message: `계약형태 값을 인식할 수 없습니다: ${row.contractType}` });
        continue;
      }
      const status = row.status ? WORKER_STATUS_BY_LABEL[row.status] : undefined;
      if (row.status && !status) {
        summary.errors.push({ row: rowNumber, message: `상태 값을 인식할 수 없습니다: ${row.status}` });
        continue;
      }

      let companyId: string | undefined;
      if (row.companyBrn) {
        const company = await this.companiesRepository.findOne({
          where: { businessRegistrationNumber: row.companyBrn },
        });
        if (!company) {
          summary.errors.push({
            row: rowNumber,
            message: `소속기업 사업자등록번호(${row.companyBrn})와 일치하는 기업을 찾을 수 없습니다.`,
          });
          continue;
        }
        companyId = company.id;
      }

      try {
        const worker = this.workersRepository.create({
          businessId,
          name: row.name,
          birthDate: row.birthDate,
          gender,
          phone: row.phone || undefined,
          email: row.email || undefined,
          address: row.address || undefined,
          companyId,
          position: row.position || undefined,
          contractType,
          hireDate: row.hireDate || undefined,
          resignDate: row.resignDate || undefined,
          salary: row.salary ? Number(row.salary) : undefined,
          status,
          memo: row.memo || undefined,
        });
        await this.workersRepository.save(worker);
        summary.created++;
      } catch (error) {
        summary.errors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return summary;
  }
}
