import { Controller, Get, Res } from '@nestjs/common';
import * as path from 'path';
import type { Response } from 'express';
import { AppService } from './app.service';
import { Public } from './modules/auth/public.decorator';

const STANDARD_TEMPLATE_FILENAME = '잡도리AI_표준양식.xlsx';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  /** 홈 화면의 "대상기업 표준양식 다운로드" 버튼이 내려받는 파일. 기업 DB 임포트 파서의 기대 열과 반드시 일치해야 한다. */
  @Get('resources/standard-template')
  downloadStandardTemplate(@Res() res: Response): void {
    const filePath = path.join(process.cwd(), 'resources', STANDARD_TEMPLATE_FILENAME);
    res.download(filePath, STANDARD_TEMPLATE_FILENAME);
  }
}
