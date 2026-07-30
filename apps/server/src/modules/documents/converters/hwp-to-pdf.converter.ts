import { Injectable, Logger } from '@nestjs/common';

/**
 * HWP는 한컴 독점 포맷이라 순수 Node 라이브러리로 변환할 수 없다.
 * 로컬에 설치된 한글 프로그램을 COM(winax)으로 자동화해서 PDF로 저장한다.
 * Windows + 한글 프로그램이 설치된 환경에서만 동작한다.
 */
@Injectable()
export class HwpToPdfConverter {
  private readonly logger = new Logger(HwpToPdfConverter.name);

  async convert(hwpFilePath: string, outputPdfPath: string): Promise<void> {
    let winax: typeof import('winax');
    try {
      winax = require('winax');
    } catch {
      throw new Error(
        'HWP 변환을 사용할 수 없습니다. Windows 환경에 winax 네이티브 모듈이 빌드되어 있고 한글 프로그램이 설치되어 있어야 합니다.',
      );
    }

    let hwp: import('winax').Object | undefined;
    try {
      hwp = new winax.Object('HWPFrame.HwpObject', { activate: true });
      hwp.RegisterModule('FilePathCheckDLL', 'FilePathCheckerModuleExample');
      hwp.XHwpWindows.Item(0).Visible = false;

      const opened = hwp.Open(hwpFilePath, 'HWP', '');
      if (!opened) {
        throw new Error(`HWP 파일을 열 수 없습니다: ${hwpFilePath}`);
      }

      const saved = hwp.SaveAs(outputPdfPath, 'PDF', '');
      if (!saved) {
        throw new Error('PDF로 저장하지 못했습니다.');
      }
    } finally {
      if (hwp) {
        try {
          hwp.Clear(1);
          hwp.Quit();
        } catch (error) {
          this.logger.warn(`한글 프로세스 종료 중 오류: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
  }
}
