import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { ApiResponse } from '@job-program/shared';
import type { SessionUser, SetupStatus } from '@job-program/shared';
import { AuthService } from './auth.service';
import { SetupDto } from './dto/setup.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import './session.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('setup-status')
  async setupStatus(): Promise<ApiResponse<SetupStatus>> {
    const data = await this.authService.getSetupStatus();
    return { success: true, data };
  }

  @Public()
  @Post('setup')
  async setup(@Body() dto: SetupDto, @Req() req: Request): Promise<ApiResponse<SessionUser>> {
    const sessionUser = await this.authService.setup(dto);
    req.session.userId = sessionUser.id;
    req.session.institutionId = sessionUser.institutionId;
    req.session.role = sessionUser.role;
    return { success: true, data: sessionUser };
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<ApiResponse<SessionUser>> {
    const { user } = await this.authService.login(dto);
    const sessionUser = this.authService.toSessionUser(user);
    req.session.userId = sessionUser.id;
    req.session.institutionId = sessionUser.institutionId;
    req.session.role = sessionUser.role;
    if (!dto.keepLoggedIn) {
      // 브라우저 세션 쿠키로 전환 (창을 닫으면 삭제). 서버측 유휴 타임아웃은 rolling 옵션으로 계속 적용된다.
      // @types/express-session의 타입 정의가 `false` 대입을 누락하고 있어 문서화된 동작대로 단언한다.
      (req.session.cookie as unknown as { expires: false | Date | null }).expires = false;
    }
    return { success: true, data: sessionUser };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request): Promise<ApiResponse<null>> {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    return { success: true };
  }

  @Get('me')
  async me(@CurrentUser() user: SessionUser): Promise<ApiResponse<SessionUser>> {
    return { success: true, data: user };
  }
}
