import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserRole, type SessionUser, type SetupStatus } from '@job-program/shared';
import { Institution } from './institution.entity';
import { User } from './user.entity';
import { SetupDto } from './dto/setup.dto';
import { LoginDto } from './dto/login.dto';
import { BusinessesService } from '../businesses/businesses.service';

const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Institution)
    private readonly institutionsRepository: Repository<Institution>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly businessesService: BusinessesService,
  ) {}

  async getSetupStatus(): Promise<SetupStatus> {
    const count = await this.institutionsRepository.count();
    return { needsSetup: count === 0 };
  }

  /** 최초 실행 세팅: 기관 생성 → 관리자 담당자 생성 → 첫 사업 등록 → 관리자를 첫 사업에 배정 */
  async setup(dto: SetupDto): Promise<SessionUser> {
    const status = await this.getSetupStatus();
    if (!status.needsSetup) {
      throw new BadRequestException('이미 초기 설정이 완료된 시스템입니다.');
    }

    const institution = await this.institutionsRepository.save(
      this.institutionsRepository.create({ name: dto.institutionName }),
    );

    const passwordHash = await bcrypt.hash(dto.adminPassword, PASSWORD_SALT_ROUNDS);
    const admin = await this.usersRepository.save(
      this.usersRepository.create({
        institutionId: institution.id,
        loginId: dto.adminLoginId,
        passwordHash,
        name: dto.adminName,
        role: UserRole.ADMIN,
        isActive: true,
      }),
    );

    const business = await this.businessesService.create(institution.id, {
      name: dto.businessName,
      typeCode: dto.businessTypeCode,
      baseYear: dto.businessBaseYear,
    });
    await this.businessesService.assignUser(admin.id, business.id);

    return {
      id: admin.id,
      institutionId: institution.id,
      institutionName: institution.name,
      loginId: admin.loginId,
      name: admin.name,
      role: admin.role,
    };
  }

  async login(dto: LoginDto): Promise<{ user: User & { institution: Institution } }> {
    const user = await this.usersRepository.findOne({
      where: { loginId: dto.loginId },
      relations: ['institution'],
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('로그인 정보가 올바르지 않습니다.');
    }
    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('로그인 정보가 올바르지 않습니다.');
    }
    return { user: user as User & { institution: Institution } };
  }

  toSessionUser(user: User & { institution: Institution }): SessionUser {
    return {
      id: user.id,
      institutionId: user.institutionId,
      institutionName: user.institution.name,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
    };
  }
}
