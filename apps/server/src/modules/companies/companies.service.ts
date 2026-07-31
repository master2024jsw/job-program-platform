import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { CompanyStatus, type CompanyRow } from '@job-program/shared';
import { buildExcelBuffer, readExcelRows, type ExcelColumn, type ImportSummary } from '../../common/excel.util';
import { Company } from './company.entity';
import { CompanyBusiness } from './company-business.entity';
import { Worker } from '../workers/worker.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpsertCompanyBusinessDto } from './dto/upsert-company-business.dto';

const STATUS_LABEL: Record<CompanyStatus, string> = {
  [CompanyStatus.ACTIVE]: '운영중',
  [CompanyStatus.INACTIVE]: '중지',
};

const STATUS_BY_LABEL: Record<string, CompanyStatus> = {
  운영중: CompanyStatus.ACTIVE,
  중지: CompanyStatus.INACTIVE,
  ACTIVE: CompanyStatus.ACTIVE,
  INACTIVE: CompanyStatus.INACTIVE,
};

/** 표준양식(잡도리AI_표준양식.xlsx '기업' 시트)의 열 구성과 반드시 일치해야 한다. */
const EXCEL_COLUMNS: ExcelColumn[] = [
  { header: '기업명', key: 'name', width: 22 },
  { header: '사업자등록번호', key: 'businessRegistrationNumber', width: 16 },
  { header: '대표자명', key: 'representativeName', width: 12 },
  { header: '연락처', key: 'phone', width: 16 },
  { header: '이메일', key: 'email', width: 24 },
  { header: '팩스', key: 'fax', width: 16 },
  { header: '참여유형', key: 'participationType', width: 12 },
  { header: '예정인원', key: 'plannedHeadcount', width: 10 },
  { header: '협약발송', key: 'agreementSentDate', width: 12 },
  { header: '협약체결', key: 'agreementConcluded', width: 10 },
  { header: '사업계획등록', key: 'businessPlanRegistered', width: 12 },
  { header: '참여자신청', key: 'participantApplied', width: 10 },
  { header: '비고', key: 'memo', width: 30 },
];

const HEADER_TO_KEY = Object.fromEntries(EXCEL_COLUMNS.map((c) => [c.header, c.key]));

export interface DedupeGroup {
  /** 그룹을 묶은 기준: 사업자등록번호 일치, 또는(사업자번호 없는 기업에 한해) 기업명 일치 */
  matchType: 'businessRegistrationNumber' | 'name';
  matchValue: string;
  keeper: Company;
  duplicates: Company[];
}

export interface ContactNormalizePreviewRow {
  id: string;
  name: string;
  field: 'phone' | 'fax' | 'email';
  before: string;
  after: string;
}

function normalizeBrn(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  if (digits.startsWith('02')) {
    if (digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    return raw;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return raw;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function parseYesNo(value?: string): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  return /^(y|yes|true|참|예)$/i.test(value.trim());
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(CompanyBusiness)
    private readonly companyBusinessRepository: Repository<CompanyBusiness>,
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
  ) {}

  async create(dto: CreateCompanyDto): Promise<Company> {
    const brn = normalizeBrn(dto.businessRegistrationNumber);
    if (dto.businessRegistrationNumber && !brn) {
      throw new BadRequestException('사업자등록번호는 숫자 10자리여야 합니다.');
    }
    if (brn) await this.assertBrnAvailable(brn);
    const company = this.companiesRepository.create({ ...dto, businessRegistrationNumber: brn, source: 'manual' });
    return this.companiesRepository.save(company);
  }

  async findAll(params?: { keyword?: string; businessId?: string; contactableOnly?: 'true' | 'false' }): Promise<CompanyRow[]> {
    const companies = params?.keyword
      ? await this.companiesRepository.find({ where: { name: Like(`%${params.keyword}%`) }, order: { createdAt: 'DESC' } })
      : await this.companiesRepository.find({ order: { createdAt: 'DESC' } });

    let cbMap = new Map<string, CompanyBusiness>();
    if (params?.businessId) {
      const cbs = await this.companyBusinessRepository.find({ where: { businessId: params.businessId } });
      cbMap = new Map(cbs.map((cb) => [cb.companyId, cb]));
    }

    let rows: CompanyRow[] = companies.map((c) => {
      const contactable = Boolean(c.phone || c.email || c.fax);
      const cb = cbMap.get(c.id) ?? null;
      return {
        id: c.id,
        name: c.name,
        businessRegistrationNumber: c.businessRegistrationNumber ?? null,
        representativeName: c.representativeName ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        fax: c.fax ?? null,
        industryType: c.industryType ?? null,
        address: c.address ?? null,
        status: c.status,
        source: c.source,
        memo: c.memo ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        contactable,
        companyBusiness: cb
          ? {
              id: cb.id,
              companyId: cb.companyId,
              businessId: cb.businessId,
              participationType: cb.participationType ?? null,
              plannedHeadcount: cb.plannedHeadcount ?? null,
              generalTypeHeadcount: cb.generalTypeHeadcount ?? null,
              intergenerationalTypeHeadcount: cb.intergenerationalTypeHeadcount ?? null,
              agreementSentDate: cb.agreementSentDate ?? null,
              agreementDate: cb.agreementDate ?? null,
              agreementConcluded: cb.agreementConcluded,
              businessPlanRegistered: cb.businessPlanRegistered,
              documentGuideSent: cb.documentGuideSent,
              participantApplied: cb.participantApplied,
              createdAt: cb.createdAt.toISOString(),
              updatedAt: cb.updatedAt.toISOString(),
            }
          : null,
      };
    });

    if (params?.contactableOnly === 'true') {
      rows = rows.filter((r) => !r.contactable);
    }

    return rows;
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companiesRepository.findOne({ where: { id }, relations: ['workers'] });
    if (!company) {
      throw new NotFoundException(`기업(id=${id})을 찾을 수 없습니다.`);
    }
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
    const company = await this.findOne(id);
    const patch: Partial<Company> = { ...dto };
    if (dto.businessRegistrationNumber !== undefined) {
      const brn = normalizeBrn(dto.businessRegistrationNumber);
      if (dto.businessRegistrationNumber && !brn) {
        throw new BadRequestException('사업자등록번호는 숫자 10자리여야 합니다.');
      }
      if (brn && brn !== company.businessRegistrationNumber) {
        await this.assertBrnAvailable(brn);
      }
      patch.businessRegistrationNumber = brn;
    }
    Object.assign(company, patch);
    return this.companiesRepository.save(company);
  }

  async remove(id: string): Promise<void> {
    const result = await this.companiesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`기업(id=${id})을 찾을 수 없습니다.`);
    }
  }

  private async assertBrnAvailable(brn: string, excludeId?: string): Promise<void> {
    const existing = await this.companiesRepository.findOne({ where: { businessRegistrationNumber: brn } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('이미 등록된 사업자등록번호입니다.');
    }
  }

  async upsertCompanyBusiness(companyId: string, dto: UpsertCompanyBusinessDto): Promise<CompanyBusiness> {
    await this.findOne(companyId);
    let cb = await this.companyBusinessRepository.findOne({ where: { companyId, businessId: dto.businessId } });
    if (!cb) {
      cb = this.companyBusinessRepository.create({ companyId, businessId: dto.businessId });
    }
    Object.assign(cb, dto);
    return this.companyBusinessRepository.save(cb);
  }

  async exportToExcel(businessId?: string): Promise<Buffer> {
    const companies = await this.companiesRepository.find({ order: { createdAt: 'DESC' } });
    let cbMap = new Map<string, CompanyBusiness>();
    if (businessId) {
      const cbs = await this.companyBusinessRepository.find({ where: { businessId } });
      cbMap = new Map(cbs.map((cb) => [cb.companyId, cb]));
    }

    const rows = companies.map((c) => {
      const cb = cbMap.get(c.id);
      return {
        name: c.name,
        businessRegistrationNumber: c.businessRegistrationNumber ?? '',
        representativeName: c.representativeName ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        fax: c.fax ?? '',
        participationType: cb?.participationType ?? '',
        plannedHeadcount: cb?.plannedHeadcount ?? '',
        agreementSentDate: cb?.agreementSentDate ?? '',
        agreementConcluded: cb ? (cb.agreementConcluded ? 'Y' : 'N') : '',
        businessPlanRegistered: cb ? (cb.businessPlanRegistered ? 'Y' : 'N') : '',
        participantApplied: cb ? (cb.participantApplied ? 'Y' : 'N') : '',
        memo: c.memo ?? '',
      };
    });
    return buildExcelBuffer('기업목록', EXCEL_COLUMNS, rows);
  }

  async importFromExcel(buffer: Buffer, businessId?: string): Promise<ImportSummary> {
    const rows = await readExcelRows(buffer, HEADER_TO_KEY, '기업');
    const summary: ImportSummary = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2;
      const row = rows[i];

      if (!row.name) {
        summary.errors.push({ row: rowNumber, message: '기업명이 비어 있습니다.' });
        continue;
      }
      if (row.name.trim().startsWith('※')) {
        // 표준양식의 안내문구 행(예: "※ 2행(회색 예시) 삭제 후...")은 데이터로 취급하지 않는다.
        continue;
      }

      let brn: string | null = null;
      if (row.businessRegistrationNumber) {
        brn = normalizeBrn(row.businessRegistrationNumber);
        if (!brn) {
          summary.errors.push({ row: rowNumber, message: `사업자등록번호 형식이 올바르지 않습니다: ${row.businessRegistrationNumber}` });
          continue;
        }
      }

      try {
        let company = brn
          ? await this.companiesRepository.findOne({ where: { businessRegistrationNumber: brn } })
          : await this.companiesRepository.findOne({ where: { name: row.name } });
        if (!brn && company) {
          summary.errors.push({ row: rowNumber, message: `사업자등록번호가 없어 기업명으로 매칭했습니다: ${row.name} (추후 사업자번호 보강 필요)` });
        }

        const payload = {
          name: row.name,
          businessRegistrationNumber: brn,
          representativeName: row.representativeName || undefined,
          phone: row.phone || undefined,
          email: row.email || undefined,
          fax: row.fax || undefined,
          memo: row.memo || undefined,
        };

        if (company) {
          Object.assign(company, payload);
          await this.companiesRepository.save(company);
          summary.updated++;
        } else {
          company = this.companiesRepository.create({ ...payload, source: 'excel' });
          await this.companiesRepository.save(company);
          summary.created++;
        }

        if (businessId && (row.participationType || row.plannedHeadcount || row.agreementSentDate || row.agreementConcluded || row.businessPlanRegistered || row.participantApplied)) {
          let cb = await this.companyBusinessRepository.findOne({ where: { companyId: company.id, businessId } });
          if (!cb) cb = this.companyBusinessRepository.create({ companyId: company.id, businessId });
          if (row.participationType) cb.participationType = row.participationType;
          if (row.plannedHeadcount) cb.plannedHeadcount = Number(row.plannedHeadcount) || undefined;
          if (row.agreementSentDate) cb.agreementSentDate = row.agreementSentDate;
          const agreementConcluded = parseYesNo(row.agreementConcluded);
          if (agreementConcluded !== undefined) cb.agreementConcluded = agreementConcluded;
          const businessPlanRegistered = parseYesNo(row.businessPlanRegistered);
          if (businessPlanRegistered !== undefined) cb.businessPlanRegistered = businessPlanRegistered;
          const participantApplied = parseYesNo(row.participantApplied);
          if (participantApplied !== undefined) cb.participantApplied = participantApplied;
          await this.companyBusinessRepository.save(cb);
        }
      } catch (error) {
        summary.errors.push({ row: rowNumber, message: error instanceof Error ? error.message : String(error) });
      }
    }

    return summary;
  }

  async previewDedupe(): Promise<DedupeGroup[]> {
    const all = await this.companiesRepository.find({ order: { createdAt: 'ASC' } });
    const groups: DedupeGroup[] = [];

    // 1) 사업자등록번호가 있는 기업: 생성/수정 시 유니크 제약으로 막히지만, 과거 데이터 등 예외 대비.
    const byBrn = new Map<string, Company[]>();
    for (const c of all) {
      if (!c.businessRegistrationNumber) continue;
      const list = byBrn.get(c.businessRegistrationNumber) ?? [];
      list.push(c);
      byBrn.set(c.businessRegistrationNumber, list);
    }
    for (const [brn, list] of byBrn) {
      if (list.length < 2) continue;
      groups.push({ matchType: 'businessRegistrationNumber', matchValue: brn, keeper: list[0], duplicates: list.slice(1) });
    }

    // 2) 사업자등록번호가 없는 기업: 기업명(공백 제거·소문자화)이 같으면 중복 후보로 본다.
    //    (엑셀 임포트 시 사업자번호가 없어 기업명으로만 매칭했던 경우 등에서 발생)
    const byName = new Map<string, Company[]>();
    for (const c of all) {
      if (c.businessRegistrationNumber) continue;
      const key = c.name.replace(/\s+/g, '').toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(c);
      byName.set(key, list);
    }
    for (const [, list] of byName) {
      if (list.length < 2) continue;
      groups.push({ matchType: 'name', matchValue: list[0].name, keeper: list[0], duplicates: list.slice(1) });
    }

    return groups;
  }

  async confirmDedupe(): Promise<{ merged: number }> {
    const groups = await this.previewDedupe();
    let merged = 0;
    for (const group of groups) {
      const keeper = group.keeper;
      for (const dup of group.duplicates) {
        // 키퍼가 비어 있는 필드만 중복 건 값으로 채운다.
        keeper.representativeName ??= dup.representativeName;
        keeper.phone ??= dup.phone;
        keeper.email ??= dup.email;
        keeper.fax ??= dup.fax;
        keeper.industryType ??= dup.industryType;
        keeper.address ??= dup.address;
        keeper.memo ??= dup.memo;

        await this.workersRepository.update({ companyId: dup.id }, { companyId: keeper.id });

        const dupCbs = await this.companyBusinessRepository.find({ where: { companyId: dup.id } });
        for (const dupCb of dupCbs) {
          const keeperCb = await this.companyBusinessRepository.findOne({
            where: { companyId: keeper.id, businessId: dupCb.businessId },
          });
          if (keeperCb) {
            await this.companyBusinessRepository.remove(dupCb);
          } else {
            dupCb.companyId = keeper.id;
            await this.companyBusinessRepository.save(dupCb);
          }
        }

        await this.companiesRepository.remove(dup);
        merged++;
      }
      await this.companiesRepository.save(keeper);
    }
    return { merged };
  }

  async previewNormalizeContacts(): Promise<ContactNormalizePreviewRow[]> {
    const companies = await this.companiesRepository.find();
    const rows: ContactNormalizePreviewRow[] = [];
    for (const c of companies) {
      if (c.phone) {
        const after = normalizePhone(c.phone);
        if (after !== c.phone) rows.push({ id: c.id, name: c.name, field: 'phone', before: c.phone, after });
      }
      if (c.fax) {
        const after = normalizePhone(c.fax);
        if (after !== c.fax) rows.push({ id: c.id, name: c.name, field: 'fax', before: c.fax, after });
      }
      if (c.email) {
        const after = normalizeEmail(c.email);
        if (after !== c.email) rows.push({ id: c.id, name: c.name, field: 'email', before: c.email, after });
      }
    }
    return rows;
  }

  async confirmNormalizeContacts(): Promise<{ updated: number }> {
    const preview = await this.previewNormalizeContacts();
    const byCompany = new Map<string, ContactNormalizePreviewRow[]>();
    for (const row of preview) {
      const list = byCompany.get(row.id) ?? [];
      list.push(row);
      byCompany.set(row.id, list);
    }
    for (const [id, changes] of byCompany) {
      const company = await this.findOne(id);
      for (const change of changes) {
        company[change.field] = change.after;
      }
      await this.companiesRepository.save(company);
    }
    return { updated: byCompany.size };
  }
}
