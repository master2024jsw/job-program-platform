import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs/promises';
import type { DocumentTypeCode } from '@job-program/shared';
import { RequiredDocumentsService } from '../required-documents/required-documents.service';
import { maskResidentNumbers } from '../../common/masking.util';

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * 검증엔진(R-101~104)이 참조하는 표준 추출 키. 서류유형별로 이 키에 담도록 프롬프트로 지시해
 * extractedData 키와 규칙 원장의 필드 참조를 일치시킨다.
 */
const SCHEMA_BY_TYPE: Partial<Record<DocumentTypeCode, string>> = {
  // 4단계 기업신청 서류
  COMPANY_APPLICATION:
    'businessRegistrationNumber, companyName, representativeName, phone(전화(팩스)에서 전화만), email, recruitJobTitle(모집직종명), recruitJobCode(모집직종 4자리 코드)',
  OPERATION_PLAN:
    "generalTypeCount(일반형 인원 숫자 — 운영계획서에 '인턴' 또는 '인턴형'으로 표기되면 반드시 여기에 넣어라), intergenerationalTypeCount(세대통합형 인원 숫자 — '세대통합'으로 표기된 경우만), plannedHeadcount(부서배치 참여인원 숫자), representativeConsentToShareAdminInfo(대표자 행정정보 공동이용 동의: true/false)",
  WORKPLACE_INSURANCE:
    'businessRegistrationNumber, nationalPension·healthInsurance·industrialAccident·employmentInsurance(각각 "가입"/"미가입")',
  BUSINESS_REGISTRATION: 'businessRegistrationNumber, companyName(상호), representativeName(대표자)',
  // 5단계 근로자신청 서류
  WORKER_APPLICATION:
    'name(성명), residentNumber(주민등록번호 — "######-#######" 형식으로 추출, 뒤 7자리는 마스킹되어 있을 수 있음), phone(연락처), applicantSignature(신청인 서명 있음: true/false), counselorName(상담자 성명)',
  PRIVACY_CONSENT:
    'allConsentsChecked(모든 동의항목에 체크되어 있음: true/false), applicantSignature(신청인 서명 있음: true/false)',
  RESIDENT_ABSTRACT:
    'name(성명), residentNumber(주민등록번호 — "######-#######" 형식)',
  EMPLOYMENT_INSURANCE_HISTORY:
    'name(성명), birthDate(생년월일 YYYY-MM-DD), workplaces(사업장 목록 배열 — 각 항목: { companyName: 사업장명, startDate: 취득일 YYYY-MM-DD, lossDate: 상실일 YYYY-MM-DD or null(현재 재직 중) })',
  ELIGIBILITY_CONFIRM:
    'item1None(제외기준1 없음: true/false), item2None(제외기준2 없음: true/false), item3None(제외기준3 없음: true/false), item4None(제외기준4 없음: true/false), item5None(제외기준5 없음: true/false), item6Yes(참여가능조건6 네: true/false), applicantSignature(신청인 서명: true/false), companyStaffSignature(기업담당자 서명: true/false)',
  LABOR_CONTRACT:
    'companyName(사업체명), phone(전화), representativeName(대표자명), workerName(근로자명), internStartDate(인턴약정기간 시작일 YYYY-MM-DD), internEndDate(인턴약정기간 종료일 YYYY-MM-DD), hasInternKeyword(인턴/수습 또는 준하는 문구 있음: true/false), employerSignature(사업주 서명: true/false), workerSignature(근로자 서명: true/false)',
  EDUCATION_LEDGER:
    'participantName(참여자명), birthDate(생년월일 YYYY-MM-DD), educationName(교육명), educationOrg(교육기관), educationDate(교육일자 YYYY-MM-DD), participantSignature(참여자 서명 있음: true/false)',
  // 6단계 지원금 신청 서류
  SUBSIDY_APPLICATION:
    'businessRegistrationNumber(사업자등록번호), companyName(사업체명), representativeName(대표자명), bankName(은행명), bankAccount(계좌번호), accountHolder(예금주), applicantCount(신청인원 숫자), totalAmount(총 신청금액 숫자), applicantSignature(대표자 서명 있음: true/false)',
  SUBSIDY_CALCULATION:
    'entries(인원별 산출내역 배열 — 각 항목: { name: 성명, round: 회차 숫자, periodLabel: 급여월 "YYYY-MM", baseSalary: 기본급 숫자, subsidyAmount: 신청 지원금액 숫자, subsidyType: "INTERN" 또는 "HIRE" })',
  INSURANCE_ROSTER:
    'businessRegistrationNumber(사업자등록번호), companyName(사업체명), entries(가입자 목록 배열 — 각 항목: { name: 성명, acquisitionDate: 취득일 YYYY-MM-DD, healthInsuranceDate: 건강보험 취득일 YYYY-MM-DD, employmentInsuranceDate: 고용보험 취득일 YYYY-MM-DD })',
  PAYROLL:
    'companyName(사업체명), workerName(근로자명), month(급여월 "YYYY-MM"), baseSalary(기본급 숫자), totalPay(지급합계 숫자), totalDeduction(공제합계 숫자), netPay(차감지급액 숫자)',
  SALARY_TRANSFER:
    'workerName(근로자명), transferAmount(이체금액 숫자), transferDate(이체일자 YYYY-MM-DD)',
  BANK_ACCOUNT_COPY:
    'bankName(은행명), accountHolder(예금주), accountNumber(계좌번호), isBusinessAccount(사업체 계좌 여부: true/false)',
};

const SCHEMA_HINT_ALL = [
  '문서 종류에 해당하면 아래 표준 key 이름으로 값을 담아라(값을 못 찾으면 생략):',
  `- 참여기업 신청서(COMPANY_APPLICATION): ${SCHEMA_BY_TYPE.COMPANY_APPLICATION}`,
  `- 운영계획서(OPERATION_PLAN): ${SCHEMA_BY_TYPE.OPERATION_PLAN}`,
  `- 4대보험 사업장 가입내역(WORKPLACE_INSURANCE): ${SCHEMA_BY_TYPE.WORKPLACE_INSURANCE}`,
  `- 사업자등록증(BUSINESS_REGISTRATION): ${SCHEMA_BY_TYPE.BUSINESS_REGISTRATION}`,
  `- 지원금 지급신청서(SUBSIDY_APPLICATION): ${SCHEMA_BY_TYPE.SUBSIDY_APPLICATION}`,
  `- 지원금 산출내역(SUBSIDY_CALCULATION): ${SCHEMA_BY_TYPE.SUBSIDY_CALCULATION}`,
  `- 4대보험 가입자명부(INSURANCE_ROSTER): ${SCHEMA_BY_TYPE.INSURANCE_ROSTER}`,
  `- 급여명세서(PAYROLL): ${SCHEMA_BY_TYPE.PAYROLL}`,
  `- 급여 이체확인증(SALARY_TRANSFER): ${SCHEMA_BY_TYPE.SALARY_TRANSFER}`,
  `- 통장사본(BANK_ACCOUNT_COPY): ${SCHEMA_BY_TYPE.BANK_ACCOUNT_COPY}`,
].join('\n');

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly requiredDocumentsService: RequiredDocumentsService,
  ) {}

  /**
   * 기본 프롬프트. assignedType이 있으면 그 서류 종류로 스코프한다
   * (한 파일에 여러 서류가 섞여 있어도 지정된 서류 항목·미비사항만 추출).
   * assignedType이 없으면(AI 자동분류) 코드 목록 중에서 종류를 판단하게 한다.
   */
  private buildDefaultPrompt(assignedType?: DocumentTypeCode | null, isText = false): string {
    const base = [
      isText
        ? '위 텍스트 내용을 분석해서 정보를 JSON 객체로 추출해줘.'
        : '첨부된 PDF 문서를 분석해서 정보를 JSON 객체로 추출해줘.',
      '값을 확인할 수 없는 항목은 넣지 말고, 반드시 JSON 객체 하나만 응답해(배열 금지).',
    ];

    if (assignedType) {
      const label = this.requiredDocumentsService.getDocumentTypes().find((t) => t.code === assignedType)?.label ?? assignedType;
      const schema = SCHEMA_BY_TYPE[assignedType];
      return [
        ...base,
        `이 문서는 '${label}'(${assignedType})로 이미 지정되어 있다. "documentType" 필드에 "${assignedType}"를 그대로 담아라.`,
        '한 PDF에 다른 서류가 함께 스캔되어 있어도, 오직 이 서류 종류에 해당하는 내용만 추출하고 다른 서류의 내용은 완전히 무시하라.',
        schema ? `이 서류의 표준 key: ${schema}. 확인 가능한 값만 담아라.` : '',
        `또한 이 서류('${label}')만을 기준으로 서명·날인·필수 기재 항목·첨부가 누락되었거나 불명확한 부분을 검토해서,`,
        '문제 항목을 한글 설명 문장으로 "missingItems" 배열에 담아라. 다른 서류에 대한 지적은 절대 넣지 말고, 없으면 빈 배열로 둬라.',
      ]
        .filter(Boolean)
        .join(' ');
    }

    const codeList = this.requiredDocumentsService
      .getDocumentTypes()
      .map((t) => `${t.code}(${t.label})`)
      .join(', ');
    return [
      ...base,
      `이 문서의 종류를 다음 코드 목록 중에서만 판단해서 "documentType" 필드에 코드값으로 담아줘: ${codeList}. 해당 없으면 "OTHER".`,
      SCHEMA_HINT_ALL,
      '또한 판단한 문서 종류를 기준으로 서명·날인·필수 기재 항목·첨부가 누락되었거나 불명확한 부분을 검토해서,',
      '문제 항목을 한글 설명 문장으로 "missingItems" 배열에 담아줘. 없으면 빈 배열로 둬.',
    ].join(' ');
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('GEMINI_API_KEY');
      if (!apiKey) {
        throw new BadRequestException('GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
      }
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  /**
   * Markdown 텍스트에서 문서 정보를 추출한다. PDF보다 토큰 절약.
   * @param text PDF에서 추출된 Markdown 텍스트
   */
  async extractFromText(
    text: string,
    prompt?: string,
    assignedType?: DocumentTypeCode | null,
  ): Promise<Record<string, unknown>> {
    const client = this.getClient();
    const model = this.configService.get<string>('GEMINI_MODEL') ?? DEFAULT_MODEL;

    const promptText = maskResidentNumbers(prompt?.trim() || this.buildDefaultPrompt(assignedType, true));

    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: `다음은 문서에서 추출한 텍스트입니다:\n\n${text}\n\n---\n\n${promptText}` },
          ],
        },
      ],
      config: { responseMimeType: 'application/json' },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new BadRequestException('Gemini 응답에서 텍스트를 받지 못했습니다.');
    }
    try {
      return JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      this.logger.error(`Gemini 응답 JSON 파싱 실패: ${responseText}`);
      throw new BadRequestException('Gemini 응답을 JSON으로 해석하지 못했습니다.');
    }
  }

  /** @param assignedType 업로드 시 지정된 문서종류(있으면 그 서류로 스코프). */
  async extractFromPdf(
    filePath: string,
    prompt?: string,
    assignedType?: DocumentTypeCode | null,
  ): Promise<Record<string, unknown>> {
    const client = this.getClient();
    const model = this.configService.get<string>('GEMINI_MODEL') ?? DEFAULT_MODEL;
    const fileBuffer = await fs.readFile(filePath);

    // 외부 AI 전송 전, 텍스트 프롬프트에 섞일 수 있는 주민번호를 마스킹한다(보안 안내문 준수).
    const promptText = maskResidentNumbers(prompt?.trim() || this.buildDefaultPrompt(assignedType));

    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: fileBuffer.toString('base64') } },
            { text: promptText },
          ],
        },
      ],
      config: { responseMimeType: 'application/json' },
    });

    const text = response.text;
    if (!text) {
      throw new BadRequestException('Gemini 응답에서 텍스트를 받지 못했습니다.');
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.logger.error(`Gemini 응답 JSON 파싱 실패: ${text}`);
      throw new BadRequestException('Gemini 응답을 JSON으로 해석하지 못했습니다.');
    }
  }
}
