import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Company } from './company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

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
}
