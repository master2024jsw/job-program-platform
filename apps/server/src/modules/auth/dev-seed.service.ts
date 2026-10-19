import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@job-program/shared';
import { Institution } from './institution.entity';
import { User } from './user.entity';
import { BusinessesService } from '../businesses/businesses.service';

const PASSWORD_SALT_ROUNDS = 10;

/**
 * 개발 단계 고정 계정 (CLAUDE.md "개발 진행 규칙" 규칙 2).
 * 비개발자 사용자가 매번 아이디·비밀번호를 찾지 않도록 가장 쉬운 값으로 고정한다.
 * NODE_ENV === 'production' 이면 전부 건너뛴다. 배포 전 차단은 scripts/check-release.ps1 이 담당.
 */
export const DEV_ACCOUNTS = [
  { loginId: 'admin123', password: 'adm123', name: '개발관리자', role: UserRole.ADMIN },
  { loginId: 'user123', password: 'usr123', name: '개발담당자', role: UserRole.STAFF },
] as const;

@Injectable()
export class DevSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger('DevSeed');

  constructor(
    @InjectRepository(Institution)
    private readonly institutionsRepository: Repository<Institution>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly businessesService: BusinessesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;
    if (process.env.DEV_SEED === 'off') {
      this.logger.log('DEV_SEED=off — 개발 계정 생성을 건너뜁니다.');
      return;
    }

    try {
      // 기관은 만들지 않는다. 초기 설정(/auth/setup)으로 만든 기존 기관에 계정만 보장한다.
      const institution = await this.institutionsRepository.findOne({ where: {}, order: { createdAt: 'ASC' } });
      if (!institution) {
        this.logger.log('기관이 없습니다 — 초기 설정 화면에서 기관을 먼저 만들어 주세요. (개발 계정 생성 보류)');
        return;
      }

      const lines: string[] = [];
      for (const acc of DEV_ACCOUNTS) {
        const result = await this.ensureAccount(institution.id, acc);
        lines.push(`  ${acc.loginId.padEnd(9)} / ${acc.password.padEnd(7)} ${acc.role.padEnd(5)} ${result}`);
      }

      this.logger.log(`개발용 로그인 계정 (기관: ${institution.name})`);
      for (const l of lines) this.logger.log(l);
      this.logger.warn('개발 전용 계정입니다. 실제 배포 전 npm run check:release 로 차단 여부를 확인하세요.');
    } catch (err) {
      // 시드 실패가 서버 기동을 막지 않게 한다 (기존 방어적 패턴).
      this.logger.error(`개발 계정 생성 실패 (서버는 정상 기동): ${(err as Error).message}`);
    }
  }

  private async ensureAccount(
    institutionId: string,
    acc: (typeof DEV_ACCOUNTS)[number],
  ): Promise<string> {
    const existing = await this.usersRepository.findOne({ where: { loginId: acc.loginId } });
    const passwordHash = await bcrypt.hash(acc.password, PASSWORD_SALT_ROUNDS);

    let user: User;
    let note: string;
    if (!existing) {
      user = await this.usersRepository.save(
        this.usersRepository.create({
          institutionId,
          loginId: acc.loginId,
          passwordHash,
          name: acc.name,
          role: acc.role,
          isActive: true,
        }),
      );
      note = '← 새로 생성';
    } else {
      // 비밀번호가 다르면 맞춰준다 (기존 이름·기관은 건드리지 않는다).
      const matches = await bcrypt.compare(acc.password, existing.passwordHash);
      if (!matches || !existing.isActive) {
        existing.passwordHash = passwordHash;
        existing.isActive = true;
        await this.usersRepository.save(existing);
        note = '← 비밀번호 재설정';
      } else {
        note = '';
      }
      user = existing;
    }

    // STAFF 는 사업에 배정돼 있어야 로그인된다 (resolveLoginBusinessId). 최신 사업에 배정한다.
    if (user.role !== UserRole.ADMIN) {
      const businesses = await this.businessesService.listForUser(institutionId, user.id, UserRole.ADMIN);
      const target = businesses[0];
      if (target && !(await this.businessesService.isUserAssigned(user.id, target.id))) {
        await this.businessesService.assignUser(user.id, target.id);
        note = `${note} (사업 배정: ${target.name})`.trim();
      }
    }
    return note;
  }
}
