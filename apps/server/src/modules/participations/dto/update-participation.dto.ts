import { IsEnum, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApplicationStatus, ContractType, WorkerStatus } from '@job-program/shared';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 소속(businessId / companyBusinessId / workerId)은 일부러 받지 않는다.
 * 설계서 §8.2 — 소속이 바뀌면 그건 다른 참여기록이다.
 * 바꾸려면 기존 기록을 종료하고 새로 만든다. 전역 ValidationPipe 가 whitelist:true 라 무시된다.
 */
export class UpdateParticipationDto {
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
}
