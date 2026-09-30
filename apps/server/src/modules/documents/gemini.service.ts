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
  COMPANY_APPLICATION:
    'businessRegistrationNumber, companyName, representativeName, phone(전화(팩스)에서 전화만), email, recruitJobTitle(모집직종명), recruitJobCode(모집직종 4자리 코드)',
  OPERATION_PLAN:
    "generalTypeCount(일반형 인원 숫자 — 운영계획서에 '인턴' 또는 '인턴형'으로 표기되면 반드시 여기에 넣어라), intergenerationalTypeCount(세대통합형 인원 숫자 — '세대통합'으로 표기된 경우만), plannedHeadcount(부서배치 참여인원 숫자), representativeConsentToShareAdminInfo(대표자 행정정보 공동이용 동의: true/false)",
  WORKPLACE_INSURANCE:
    'businessRegistrationNumber, nationalPension·healthInsurance·industrialAccident·employmentInsurance(각각 "가입"/"미가입")',
  BUSINESS_REGISTRATION: 'businessRegistrationNumber, companyName(상호), representativeName(대표자)',
};

const SCHEMA_HINT_ALL = [
  '문서 종류에 해당하면 아래 표준 key 이름으로 값을 담아라(값을 못 찾으면 생략):',
  `- 참여기업 신청서(COMPANY_APPLICATION): ${SCHEMA_BY_TYPE.COMPANY_APPLICATION}`,
  `- 운영계획서(OPERATION_PLAN): ${SCHEMA_BY_TYPE.OPERATION_PLAN}`,
  `- 4대보험 사업장 가입내역(WORKPLACE_INSURANCE): ${SCHEMA_BY_TYPE.WORKPLACE_INSURANCE}`,
  `- 사업자등록증(BUSINESS_REGISTRATION): ${SCHEMA_BY_TYPE.BUSINESS_REGISTRATION}`,
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
  private buildDefaultPrompt(assignedType?: DocumentTypeCode | null): string {
    const base = [
      '첨부된 PDF 문서를 분석해서 정보를 JSON 객체로 추출해줘.',
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
