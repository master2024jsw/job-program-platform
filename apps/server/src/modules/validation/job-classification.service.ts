import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export type JobJudgment = 'ELIGIBLE' | 'EXCLUDED' | 'NEEDS_REVIEW';

export interface JobClassification {
  code: string;
  jobName: string;
  judgment: JobJudgment;
  detail?: string;
}

const resourcesDir = path.join(process.cwd(), 'resources');

/**
 * 직종분류표(job-classifications.json) 조회 — R-104 소스.
 * 규칙값을 코드에 하드코딩하지 않고 데이터 파일로 로드한다(REQ3).
 * 4자리 코드로만 조회한다(직종명 매칭 금지: 6222 가능 vs 6229 확인필요).
 */
@Injectable()
export class JobClassificationService {
  private readonly logger = new Logger(JobClassificationService.name);
  private readonly byCode = new Map<string, JobClassification>();

  constructor() {
    this.load();
  }

  private load(): void {
    const filePath = path.join(resourcesDir, 'job-classifications.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { items: JobClassification[] };
      for (const item of parsed.items ?? []) {
        this.byCode.set(String(item.code).trim(), item);
      }
      this.logger.log(`직종분류표 ${this.byCode.size}건 로드`);
    } catch (error) {
      this.logger.error(`직종분류표 로드 실패(${filePath}): ${error instanceof Error ? error.message : error}`);
    }
  }

  /** 4자리 코드로 조회. 없으면 null (호출부에서 '담당자확인' 보류 처리). */
  lookup(code: string | null | undefined): JobClassification | null {
    if (!code) return null;
    const normalized = String(code).trim();
    return this.byCode.get(normalized) ?? null;
  }
}
