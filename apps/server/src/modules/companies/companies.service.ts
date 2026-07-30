import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { CompanyStatus } from '@job-program/shared';
import { buildExcelBuffer, readExcelRows, type ExcelColumn, type ImportSummary } from '../../common/excel.util';
import { Company } from './company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

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

const EXCEL_COLUMNS: ExcelColumn[] = [
  { header: '기업명', key: 'name', width: 24 },
  { header: '사업자등록번호', key: 'businessRegistrationNumber', width: 18 },
  { header: '대표자명', key: 'representativeName', width: 14 },
  { header: '업종', key: 'industryType', width: 16 },
  { header: '주소', key: 'address', width: 28 },
  { header: '전화번호', key: 'phone', width: 16 },
  { header: '담당자명', key: 'contactManagerName', width: 12 },
  { header: '담당자연락처', key: 'contactManagerPhone', width: 16 },
  { header: '담당자이메일', key: 'contactManagerEmail', width: 24 },
  { header: '상태', key: 'status', width: 10 },
  { header: '메모', key: 'memo', width: 30 },
];

const HEADER_TO_KEY = Object.fromEntries(EXCEL_COLUMNS.map((c) => [c.header, c.key]));

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
  ) {}

  async create(dto: CreateCompanyDto): Promise<Company> {
    await this.assertBusinessRegistrationNumberAvailable(dto.businessRegistrationNumber);
    const company = this.companiesRepository.create(dto);
    return this.companiesRepository.save(company);
  }

  findAll(keyword?: string): Promise<Company[]> {
    if (keyword) {
      return this.companiesRepository.find({ where: { name: Like(`%${keyword}%`) }, order: { createdAt: 'DESC' } });
    }
    return this.companiesRepository.find({ order: { createdAt: 'DESC' } });
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
    if (dto.businessRegistrationNumber && dto.businessRegistrationNumber !== company.businessRegistrationNumber) {
      await this.assertBusinessRegistrationNumberAvailable(dto.businessRegistrationNumber);
    }
    Object.assign(company, dto);
    return this.companiesRepository.save(company);
  }

  async remove(id: string): Promise<void> {
    const result = await this.companiesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`기업(id=${id})을 찾을 수 없습니다.`);
    }
  }

  private async assertBusinessRegistrationNumberAvailable(businessRegistrationNumber: string): Promise<void> {
    const existing = await this.companiesRepository.findOne({ where: { businessRegistrationNumber } });
    if (existing) {
      throw new ConflictException('이미 등록된 사업자등록번호입니다.');
    }
  }

  async exportToExcel(): Promise<Buffer> {
    const companies = await this.findAll();
    const rows = companies.map((c) => ({
      name: c.name,
      businessRegistrationNumber: c.businessRegistrationNumber,
      representativeName: c.representativeName ?? '',
      industryType: c.industryType ?? '',
      address: c.address ?? '',
      phone: c.phone ?? '',
      contactManagerName: c.contactManagerName ?? '',
      contactManagerPhone: c.contactManagerPhone ?? '',
      contactManagerEmail: c.contactManagerEmail ?? '',
      status: STATUS_LABEL[c.status] ?? c.status,
      memo: c.memo ?? '',
    }));
    return buildExcelBuffer('기업목록', EXCEL_COLUMNS, rows);
  }

  async importFromExcel(buffer: Buffer): Promise<ImportSummary> {
    const rows = await readExcelRows(buffer, HEADER_TO_KEY);
    const summary: ImportSummary = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // 1행은 헤더
      const row = rows[i];

      if (!row.name) {
        summary.errors.push({ row: rowNumber, message: '기업명이 비어 있습니다.' });
        continue;
      }
      if (!/^\d{10}$/.test(row.businessRegistrationNumber ?? '')) {
        summary.errors.push({ row: rowNumber, message: '사업자등록번호는 하이픈 없는 숫자 10자리여야 합니다.' });
        continue;
      }

      const status = row.status ? STATUS_BY_LABEL[row.status] : undefined;
      if (row.status && !status) {
        summary.errors.push({ row: rowNumber, message: `상태 값을 인식할 수 없습니다: ${row.status}` });
        continue;
      }

      const payload = {
        name: row.name,
        businessRegistrationNumber: row.businessRegistrationNumber,
        representativeName: row.representativeName || undefined,
        industryType: row.industryType || undefined,
        address: row.address || undefined,
        phone: row.phone || undefined,
        contactManagerName: row.contactManagerName || undefined,
        contactManagerPhone: row.contactManagerPhone || undefined,
        contactManagerEmail: row.contactManagerEmail || undefined,
        status,
        memo: row.memo || undefined,
      };

      try {
        const existing = await this.companiesRepository.findOne({
          where: { businessRegistrationNumber: payload.businessRegistrationNumber },
        });
        if (existing) {
          Object.assign(existing, payload);
          await this.companiesRepository.save(existing);
          summary.updated++;
        } else {
          const company = this.companiesRepository.create(payload);
          await this.companiesRepository.save(company);
          summary.created++;
        }
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
