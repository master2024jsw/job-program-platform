import { Injectable } from '@nestjs/common';
import type { ApiResponse } from '@job-program/shared';

@Injectable()
export class AppService {
  getHealth(): ApiResponse<{ status: string; timestamp: string }> {
    return {
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
