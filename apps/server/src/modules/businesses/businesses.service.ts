import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from './business.entity';
import { UserBusiness } from '../auth/user-business.entity';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UserRole } from '@job-program/shared';

@Injectable()
export class BusinessesService {
  constructor(
    @InjectRepository(Business)
    private readonly businessesRepository: Repository<Business>,
    @InjectRepository(UserBusiness)
    private readonly userBusinessRepository: Repository<UserBusiness>,
  ) {}

  async create(institutionId: string, dto: CreateBusinessDto): Promise<Business> {
    const id = `BIZ-${dto.baseYear}-${dto.typeCode}`;
    const existing = await this.businessesRepository.findOne({ where: { id } });
    if (existing) {
      throw new ConflictException(`이미 존재하는 사업입니다: ${id}`);
    }
    const business = this.businessesRepository.create({
      id,
      institutionId,
      name: dto.name,
      typeCode: dto.typeCode,
      baseYear: dto.baseYear,
    });
    return this.businessesRepository.save(business);
  }

  /** admin은 기관 내 전체 사업을, staff는 배정된 사업만 조회한다. */
  async listForUser(institutionId: string, userId: string, role: UserRole): Promise<Business[]> {
    if (role === UserRole.ADMIN) {
      return this.businessesRepository.find({ where: { institutionId }, order: { createdAt: 'ASC' } });
    }
    const assignments = await this.userBusinessRepository.find({ where: { userId }, relations: ['business'] });
    return assignments
      .map((a) => a.business)
      .filter((b): b is Business => !!b)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findOne(id: string): Promise<Business> {
    const business = await this.businessesRepository.findOne({ where: { id } });
    if (!business) {
      throw new NotFoundException(`사업(${id})을 찾을 수 없습니다.`);
    }
    return business;
  }

  async assignUser(userId: string, businessId: string): Promise<void> {
    const existing = await this.userBusinessRepository.findOne({ where: { userId, businessId } });
    if (existing) return;
    const assignment = this.userBusinessRepository.create({ userId, businessId });
    await this.userBusinessRepository.save(assignment);
  }
}
