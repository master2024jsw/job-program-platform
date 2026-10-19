import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApplicationStatus, ContractType, WorkerStatus } from '@job-program/shared';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateParticipationDto {
  // Business.id 는 'BIZ-2026-SENIOR' 형식 문자열이므로 @IsUUID 를 쓰지 않는다 (CLAUDE.md).
  @IsString()
  businessId!: string;

  @IsString()
  companyBusinessId!: string;

  @IsString()
  workerId!: string;

  @IsOptional()
  @IsString()
  participationType?: string | null;

  @IsOptional()
  @IsString()
  position?: string | null;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType | null;

  @IsOptional()
  @Matches(DATE, { message: 'hireDate 는 YYYY-MM-DD 형식이어야 합니다.' })
  hireDate?: string | null;

  @IsOptional()
  @Matches(DATE, { message: 'internEndDate 는 YYYY-MM-DD 형식이어야 합니다.' })
  internEndDate?: string | null;

  @IsOptional()
  @Matches(DATE, { message: 'resignDate 는 YYYY-MM-DD 형식이어야 합니다.' })
  resignDate?: string | null;

  @IsOptional()
  @Matches(DATE, { message: 'continuousHireDate 는 YYYY-MM-DD 형식이어야 합니다.' })
  continuousHireDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salary?: number | null;

  @IsOptional()
  @IsEnum(WorkerStatus)
  status?: WorkerStatus;

  @IsOptional()
  @IsEnum(ApplicationStatus)
  applicationStatus?: ApplicationStatus | null;

  @IsOptional()
  @IsString()
  memo?: string | null;

  /**
   * 같은 기업·사업에 이미 진행중 참여기록이 있을 때도 일부러 하나 더 만들려면 true.
   * 설계서 §5.2 — 동일 사업 재참여 가능 여부는 지침 판단이라 DB 로 막지 않고 여기서 확인받는다.
   */
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}
