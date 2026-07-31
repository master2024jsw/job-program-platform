import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import type { SessionUser } from '@job-program/shared';
import { User } from './user.entity';
import { IS_PUBLIC_KEY } from './public.decorator';
import './session.types';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const userId = request.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    const user = await this.usersRepository.findOne({ where: { id: userId }, relations: ['institution'] });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('세션이 유효하지 않습니다. 다시 로그인해주세요.');
    }

    request.user = {
      id: user.id,
      institutionId: user.institutionId,
      institutionName: user.institution.name,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
    };
    return true;
  }
}
