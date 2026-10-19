import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkerStatus, type ParticipationWithNames } from '@job-program/shared';
import { Participation } from './participation.entity';
import { CompanyBusiness } from '../companies/company-business.entity';
import { Worker } from '../workers/worker.entity';
import { CreateParticipationDto } from './dto/create-participation.dto';
import { UpdateParticipationDto } from './dto/update-participation.dto';

@Injectable()
export class ParticipationsService {
  private readonly logger = new Logger(ParticipationsService.name);

  constructor(
    @InjectRepository(Participation)
    private readonly participationsRepository: Repository<Participation>,
    @InjectRepository(CompanyBusiness)
    private readonly companyBusinessesRepository: Repository<CompanyBusiness>,
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
  ) {}

  /**
   * 사업 범위 안에서만 조회한다. companyId 를 주면 그 기업 아래로 좁힌다
   * (= 기업을 고르면 그 기업의 근로자만 보이는 계단).
   */
  async findAll(businessId: string, companyId?: string): Promise<ParticipationWithNames[]> {
    const qb = this.participationsRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.companyBusiness', 'cb')
      .leftJoinAndSelect('cb.company', 'c')
      .leftJoinAndSelect('p.worker', 'w')
      .where('p.businessId = :businessId', { businessId });

    if (companyId) qb.andWhere('cb.companyId = :companyId', { companyId });

    const list = await qb.orderBy('p.createdAt', 'DESC').getMany();
    return list.map((p) => this.toWithNames(p));
  }

  private toWithNames(p: Participation): ParticipationWithNames {
    const { companyBusiness, worker, ...rest } = p;
    return {
      ...rest,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt),
      workerName: worker?.name ?? '',
      workerBirthDate: worker?.birthDate ?? '',
      companyId: companyBusiness?.companyId ?? '',
      companyName: companyBusiness?.company?.name ?? '',
    } as ParticipationWithNames;
  }

  async findOne(businessId: string, id: string): Promise<Participation> {
    const found = await this.participationsRepository.findOne({
      where: { id },
      relations: ['companyBusiness', 'companyBusiness.company', 'worker'],
    });
    if (!found) throw new NotFoundException('참여기록을 찾을 수 없습니다.');
    // URL 의 사업과 자료의 사업이 다르면 거절한다 (설계서 §13.1).
    if (found.businessId !== businessId) {
      throw new NotFoundException('참여기록을 찾을 수 없습니다.');
    }
    return found;
  }

  async create(dto: CreateParticipationDto): Promise<Participation> {
    const cb = await this.companyBusinessesRepository.findOne({
      where: { id: dto.companyBusinessId },
    });
    if (!cb) throw new BadRequestException('기업의 사업참여 기록을 찾을 수 없습니다.');

    // 계단이 어긋나지 않게: 기업참여의 사업과 요청한 사업이 같아야 한다 (설계서 §8.2 #1).
    if (cb.businessId !== dto.businessId) {
      throw new BadRequestException(
        `기업의 사업참여(${cb.businessId})와 요청한 사업(${dto.businessId})이 다릅니다.`,
      );
    }

    const worker = await this.workersRepository.findOne({ where: { id: dto.workerId } });
    if (!worker) throw new BadRequestException('근로자를 찾을 수 없습니다.');

    // 근로자 원장에 소속 기업이 적혀 있는데 기업참여의 기업과 다르면 멈추고 확인받는다.
    // 설계서 §7 '금지' — 이름이 같다는 이유로 자동 병합/자동 배정하지 않는다.
    if (worker.companyId && worker.companyId !== cb.companyId) {
      throw new ConflictException(
        '근로자 원장의 소속 기업과 선택한 기업이 다릅니다. 어느 쪽이 맞는지 확인이 필요합니다.',
      );
    }

    if (!dto.allowDuplicate) {
      const existing = await this.participationsRepository.findOne({
        where: {
          businessId: dto.businessId,
          companyBusinessId: dto.companyBusinessId,
          workerId: dto.workerId,
          status: WorkerStatus.ACTIVE,
        },
      });
      if (existing) {
        throw new ConflictException(
          '이 근로자는 같은 기업·사업에 이미 참여중입니다. 일부러 하나 더 만들려면 allowDuplicate=true 로 요청하세요.',
        );
      }
    }

    const saved = await this.participationsRepository.save(
      this.participationsRepository.create({
        businessId: dto.businessId,
        companyBusinessId: dto.companyBusinessId,
        workerId: dto.workerId,
        participationType: dto.participationType ?? cb.participationType ?? null,
        position: dto.position ?? worker.position ?? null,
        contractType: dto.contractType ?? worker.contractType ?? null,
        hireDate: dto.hireDate ?? worker.hireDate ?? null,
        internEndDate: dto.internEndDate ?? worker.internEndDate ?? null,
        resignDate: dto.resignDate ?? worker.resignDate ?? null,
        continuousHireDate: dto.continuousHireDate ?? worker.continuousHireDate ?? null,
        salary: dto.salary ?? worker.salary ?? null,
        status: dto.status ?? WorkerStatus.ACTIVE,
        applicationStatus: dto.applicationStatus ?? worker.applicationStatus ?? null,
        memo: dto.memo ?? null,
        migratedFromWorker: false,
      }),
    );
    this.logger.log(`참여기록 생성: ${saved.id} (근로자 ${worker.name}, 사업 ${dto.businessId})`);
    return saved;
  }

  async update(businessId: string, id: string, dto: UpdateParticipationDto): Promise<Participation> {
    const found = await this.findOne(businessId, id);
    Object.assign(found, dto);
    return this.participationsRepository.save(found);
  }

  async remove(businessId: string, id: string): Promise<void> {
    const found = await this.findOne(businessId, id);
    await this.participationsRepository.remove(found);
    this.logger.log(`참여기록 삭제: ${id}`);
  }

  /** 지원금 모듈이 participationId 의 유효성과 사업 소속을 확인할 때 쓴다. */
  async assertInBusiness(businessId: string, participationId: string): Promise<Participation> {
    return this.findOne(businessId, participationId);
  }
}
