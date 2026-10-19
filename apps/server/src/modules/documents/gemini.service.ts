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
  // 사업장 가입내역 확인서는 보험 4종이 각 행으로 반복되고, 사업장명칭·대표자가 행마다 적혀 있다.
  // companyName·representativeName 을 스키마에 넣지 않으면 AI 가 그 항목을 읽지 않은 채
  // "공란"이라고 missingItems 에 적는 일이 생긴다(실제로 발생했음).
  WORKPLACE_INSURANCE:
    'businessRegistrationNumber, companyName(사업장 명칭 — 표의 행마다 반복되어 있으니 첫 행에서 읽어라), representativeName(대표자 — 표의 행마다 반복), nationalPension·healthInsurance·industrialAccident·employmentInsurance(각각 "가입"/"미가입")',
  BUSINESS_REGISTRATION: 'businessRegistrationNumber, companyName(상호), representativeName(대표자)',
  // 5단계 근로자신청 서류
  WORKER_APPLICATION:
    'name(성명), residentNumber(주민등록번호 — "######-#######" 형식으로 추출, 뒤 7자리는 마스킹되어 있을 수 있음), phone(연락처), applicantSignature(신청인 서명 있음: true/false), counselorName(상담자 성명)',
  PRIVACY_CONSENT:
    'name(성명), residentNumber(주민등록번호 — "######-#######" 형식, 서류에 표시된 경우), allConsentsChecked(모든 동의항목에 체크되어 있음: true/false), applicantSignature(신청인 서명 있음: true/false)',
  RESIDENT_ABSTRACT:
    'name(성명), residentNumber(주민등록번호 — "######-#######" 형식)',
  EMPLOYMENT_INSURANCE_HISTORY:
    'name(성명), residentNumber(주민등록번호 — "######-#######" 형식, 서류에 표시된 경우), birthDate(생년월일 YYYY-MM-DD), workplaces(사업장 목록 배열 — 각 항목: { companyName: 사업장명, startDate: 취득일 YYYY-MM-DD, lossDate: 상실일 YYYY-MM-DD or null(현재 재직 중) })',
  ELIGIBILITY_CONFIRM:
    'name(성명 — 서류에 기재된 참여자 성명, 있는 경우), item1None(제외기준1 없음: true/false), item2None(제외기준2 없음: true/false), item3None(제외기준3 없음: true/false), item4None(제외기준4 없음: true/false), item5None(제외기준5 없음: true/false), item6Yes(참여가능조건6 네: true/false), applicantSignature(신청인 서명: true/false), companyStaffSignature(기업담당자 서명: true/false)',
  // baseSalary 를 넣지 않으면 AI 가 임금 조항을 아예 읽지 않는다.
  // 그러면 근로자 대장의 급여가 비고 → 지원금 산정이 '자료 부족 0원'이 되고 → R-303·R-306 도 판정 불가.
  // 실제로 계약서에는 "월(일, 시간)급 : 2,600,000 원"이 또렷이 적혀 있었는데 항목이 없어 안 뽑혔다(2026-10-19).
  // key 이름은 규칙 원장 R-306 의 anchorField 와 같은 baseSalary 로 맞춘다 — 원장이 기준이다.
  LABOR_CONTRACT:
    'companyName(사업체명), phone(전화), representativeName(대표자명), workerName(근로자명), residentNumber(근로자 주민등록번호 — "######-#######" 형식, 표시된 경우), birthDate(근로자 생년월일 YYYY-MM-DD, 표시된 경우), internStartDate(인턴약정기간 시작일 YYYY-MM-DD), internEndDate(인턴약정기간 종료일 YYYY-MM-DD), hasInternKeyword(인턴/수습 또는 준하는 문구 있음: true/false), baseSalary(임금 조항의 "월(일, 시간)급" 금액 — 숫자만, 쉼표·"원" 제외), payUnit(그 금액의 단위: "월"/"일"/"시간" 중 하나), employerSignature(사업주 서명: true/false), workerSignature(근로자 서명: true/false)',
  EDUCATION_LEDGER:
    'participantName(참여자명), residentNumber(주민등록번호 — "######-#######" 형식, 표시된 경우), birthDate(생년월일 YYYY-MM-DD), educationName(교육명), educationOrg(교육기관), educationDate(교육일자 YYYY-MM-DD), participantSignature(참여자 서명 있음: true/false)',
  // 6단계 지원금 신청 서류
  SUBSIDY_APPLICATION:
    'businessRegistrationNumber(사업자등록번호), companyName(사업체명), representativeName(대표자명), bankName(은행명), bankAccount(계좌번호), accountHolder(예금주), applicantCount(신청인원 숫자), totalAmount(총 신청금액 숫자), applicantSignature(대표자 서명 있음: true/false)',
  SUBSIDY_CALCULATION:
    'entries(인원별 산출내역 배열 — 각 항목: { name: 성명, round: 회차 숫자, periodLabel: 급여월 "YYYY-MM", baseSalary: 기본급 숫자, subsidyAmount: 신청 지원금액 숫자, subsidyType: "INTERN"(인턴지원금) 또는 "HIRE"(계속고용지원금) 또는 "LONGTERM"(장기취업유지지원금) })',
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


/**
 * AI 응답 모양을 한 가지로 맞춘다.
 *
 * 같은 프롬프트에도 모델이 때로는 평탄하게({ documentType, businessRegistrationNumber, ... }),
 * 때로는 중첩해서({ documentType, extractedData: { ... }, missingItems }) 돌려준다.
 * 중첩된 채로 저장하면 검증엔진이 항목을 못 찾아 "서류가 없다"고 판정한다(실제로 발생).
 * 항상 평탄한 모양으로 바꿔 저장한다.
 */
export function flattenExtraction(raw: Record<string, unknown>): Record<string, unknown> {
  const inner = raw.extractedData;
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return raw;
  const { extractedData: _drop, ...rest } = raw;
  // 바깥쪽 값(documentType, missingItems 등)이 안쪽보다 우선한다.
  return { ...(inner as Record<string, unknown>), ...rest };
}

/** 분류·관찰 결과일 뿐 '추출된 항목'이 아닌 키. */
const NON_FIELD_KEYS = new Set(['documentType', 'missingItems']);

/**
 * 추출 결과가 사실상 비어 있는지 본다 (= 종류만 판단하고 항목은 하나도 못 뽑은 상태).
 *
 * 왜 필요한가:
 * 업로드할 때 서류 유형을 지정하지 않으면 프롬프트에 '그 유형의 표준 key' 목록이 들어가지 않는다.
 * 그러면 모델이 종류만 판단하고 멈춰서 `{ documentType, missingItems: [] }` 만 돌려준다.
 * 실측(2026-10-19): 같은 초본 PDF·같은 주석 힌트로 유형 지정 시 name·residentNumber 가 나오고,
 * 미지정 시 항목이 0개였다. 그 결과 근로자 자동등록(생년월일 필요)이 아예 시작되지 않았다.
 */
export function isEmptyExtraction(data: Record<string, unknown>): boolean {
  return !Object.keys(data).some((key) => {
    if (NON_FIELD_KEYS.has(key)) return false;
    const value = data[key];
    if (value == null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}

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
        'missingItems 는 눈으로 확인한 것만 적어라. 어떤 항목의 값을 읽어서 담았다면 그 항목은 공란이 아니므로 missingItems 에 넣지 마라. 표의 모든 행을 확인하고, 한 행이라도 값이 있으면 공란이라고 쓰지 마라. 값을 읽을 수 없으면 "공란"이라고 단정하지 말고 "확인 필요"라고 적어라.',
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
      'missingItems 는 눈으로 확인한 것만 적어라. 어떤 항목의 값을 읽어서 담았다면 그 항목은 공란이 아니므로 missingItems 에 넣지 마라. 표의 모든 행을 확인하고, 한 행이라도 값이 있으면 공란이라고 쓰지 마라. 값을 읽을 수 없으면 "공란"이라고 단정하지 말고 "확인 필요"라고 적어라.',
    ].join(' ');
  }

  /**
   * 1차 응답의 documentType 이 우리가 아는 코드이고, 그 유형에 표준 key 목록이 있으면 돌려준다.
   * 2차 추출을 할 가치가 있는지 판단하는 용도 — OTHER·모르는 코드면 재추출해봐야 소득이 없다.
   */
  private resolveClassifiedType(data: Record<string, unknown>): DocumentTypeCode | null {
    const raw = data.documentType;
    if (typeof raw !== 'string' || raw === 'OTHER') return null;
    const known = this.requiredDocumentsService.getDocumentTypes().some((t) => t.code === raw);
    if (!known) return null;
    const code = raw as DocumentTypeCode;
    return SCHEMA_BY_TYPE[code] ? code : null;
  }

  /**
   * 2단계 추출을 할 상황인지 판단한다.
   * - 유형을 지정하고 올렸으면(assignedType) 이미 1차에 표준 key 가 들어갔으므로 불필요
   * - 호출자가 직접 프롬프트를 넘겼으면 그 의도를 덮어쓰지 않는다
   * - 1차에서 항목이 하나라도 나왔으면 추가 호출 없이 그대로 쓴다 (API 호출 절약)
   */
  private needsSecondPass(
    first: Record<string, unknown>,
    assignedType: DocumentTypeCode | null | undefined,
    prompt: string | undefined,
  ): DocumentTypeCode | null {
    if (assignedType) return null;
    if (prompt?.trim()) return null;
    if (!isEmptyExtraction(first)) return null;
    return this.resolveClassifiedType(first);
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
    /** PDF 주석 레이어에서 뽑은 글자 */
    annotationHint?: string,
  ): Promise<Record<string, unknown>> {
    const client = this.getClient();
    const model = this.configService.get<string>('GEMINI_MODEL') ?? DEFAULT_MODEL;

    const baseText = prompt?.trim() || this.buildDefaultPrompt(assignedType, true);
    const withHintText = annotationHint ? baseText + String.fromCharCode(10, 10) + annotationHint : baseText;
    const promptText = maskResidentNumbers(withHintText);

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
    let first: Record<string, unknown>;
    try {
      first = flattenExtraction(JSON.parse(responseText) as Record<string, unknown>);
    } catch {
      this.logger.error(`Gemini 응답 JSON 파싱 실패: ${responseText}`);
      throw new BadRequestException('Gemini 응답을 JSON으로 해석하지 못했습니다.');
    }

    // 2단계 추출: 1차에서 종류만 나오고 항목이 비었으면, 그 종류의 표준 key 로 한 번 더 뽑는다.
    const resolved = this.needsSecondPass(first, assignedType, prompt);
    if (resolved) {
      this.logger.log(`[2단계 추출] 1차 분류=${resolved} → 해당 유형 표준 항목으로 재추출 (텍스트)`);
      return this.reExtract(() => this.extractFromText(text, undefined, resolved, annotationHint), first, resolved);
    }
    return first;
  }

  /**
   * 2차 추출을 실행하고 결과를 고른다.
   * 2차가 실패하거나 여전히 비면 1차 결과를 그대로 쓴다 — 분석 자체가 실패하면 안 된다.
   * documentType 은 1차 분류를 유지한다(2차는 그 유형을 전제로 돌린 것이므로 같아야 정상).
   */
  private async reExtract(
    run: () => Promise<Record<string, unknown>>,
    first: Record<string, unknown>,
    resolved: DocumentTypeCode,
  ): Promise<Record<string, unknown>> {
    try {
      const second = await run();
      if (isEmptyExtraction(second)) {
        this.logger.warn(`[2단계 추출] 재추출도 항목 0개 (type=${resolved}) — 1차 결과 유지`);
        return first;
      }
      const merged = { ...second, documentType: resolved };
      this.logger.log(
        `[2단계 추출] 완료 type=${resolved} 항목=${Object.keys(merged).filter((k) => !NON_FIELD_KEYS.has(k)).join(',')}`,
      );
      return merged;
    } catch (error) {
      this.logger.warn(`[2단계 추출] 실패(${resolved}): ${error instanceof Error ? error.message : error} — 1차 결과 유지`);
      return first;
    }
  }

  /**
   * 합본 PDF에서 포함된 모든 서류 유형을 한 번에 추출한다.
   * 반환값: [{ documentType, extractedData, missingItems }]
   */
  async extractAllFromPdf(
    filePath: string,
    /** PDF 주석 레이어에서 뽑은 글자 */
    annotationHint?: string,
  ): Promise<Array<{ documentType: string; extractedData: Record<string, unknown>; missingItems: string[] }>> {
    const client = this.getClient();
    const model = this.configService.get<string>('GEMINI_MODEL') ?? DEFAULT_MODEL;
    const fileBuffer = await fs.readFile(filePath);

    const codeList = this.requiredDocumentsService
      .getDocumentTypes()
      .map((t) => `${t.code}(${t.label})`)
      .join(', ');

    const schemaHints = [
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

    const promptText = [
      '이 PDF에는 여러 서류가 합쳐져 있을 수 있다.',
      '포함된 서류를 모두 찾아서 JSON 배열로 응답하라. 배열 원소는 각 서류 1건이며 다음 형태를 가진다:',
      '{ "documentType": "<코드>", "extractedData": { ... }, "missingItems": [ ... ] }',
      `사용 가능한 documentType 코드 목록: ${codeList}. 해당 없으면 "OTHER".`,
      '각 서류별 표준 key:',
      schemaHints,
      '각 서류마다 서명·날인·필수 기재 항목 누락 여부를 검토해서 missingItems 배열에 한글 문장으로 담아라. 없으면 빈 배열.',
      'missingItems 는 눈으로 확인한 것만 적어라. 어떤 항목의 값을 읽어서 담았다면 그 항목은 공란이 아니므로 missingItems 에 넣지 마라. 표의 모든 행을 확인하고, 한 행이라도 값이 있으면 공란이라고 쓰지 마라. 값을 읽을 수 없으면 "공란"이라고 단정하지 말고 "확인 필요"라고 적어라.',
      '값을 확인할 수 없는 항목은 extractedData에 넣지 마라.',
      '반드시 JSON 배열 하나만 응답하라.',
    ].join(' ') + (annotationHint ? String.fromCharCode(10, 10) + annotationHint : '');

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
    if (!text) throw new BadRequestException('Gemini 응답에서 텍스트를 받지 못했습니다.');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logger.error(`합본 Gemini 응답 파싱 실패: ${text}`);
      throw new BadRequestException('Gemini 응답을 JSON으로 해석하지 못했습니다.');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException(`Gemini가 배열 대신 다른 형식으로 응답했습니다: ${JSON.stringify(parsed).slice(0, 200)}`);
    }

    return (parsed as Array<Record<string, unknown>>).map((item) => ({
      documentType: typeof item.documentType === 'string' ? item.documentType : 'OTHER',
      extractedData: (item.extractedData && typeof item.extractedData === 'object' ? item.extractedData : {}) as Record<string, unknown>,
      missingItems: Array.isArray(item.missingItems) ? item.missingItems.map(String) : [],
    }));
  }

  /** @param assignedType 업로드 시 지정된 문서종류(있으면 그 서류로 스코프). */
  async extractFromPdf(
    filePath: string,
    prompt?: string,
    assignedType?: DocumentTypeCode | null,
    /** PDF 주석 레이어에서 뽑은 글자. 문서 이미지에 안 보이는 값을 AI 가 읽게 해준다. */
    annotationHint?: string,
  ): Promise<Record<string, unknown>> {
    const client = this.getClient();
    const model = this.configService.get<string>('GEMINI_MODEL') ?? DEFAULT_MODEL;
    const fileBuffer = await fs.readFile(filePath);

    // 외부 AI 전송 전, 텍스트 프롬프트에 섞일 수 있는 주민번호를 마스킹한다(보안 안내문 준수).
    const base = prompt?.trim() || this.buildDefaultPrompt(assignedType);
    // 주석 글자는 '문서에 실제로 적힌 값'이므로 프롬프트 뒤에 덧붙인다.
    const withHint = annotationHint ? base + String.fromCharCode(10, 10) + annotationHint : base;
    const promptText = maskResidentNumbers(withHint);

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
    let first: Record<string, unknown>;
    try {
      first = flattenExtraction(JSON.parse(text) as Record<string, unknown>);
    } catch {
      this.logger.error(`Gemini 응답 JSON 파싱 실패: ${text}`);
      throw new BadRequestException('Gemini 응답을 JSON으로 해석하지 못했습니다.');
    }

    // 2단계 추출: 1차에서 종류만 나오고 항목이 비었으면, 그 종류의 표준 key 로 한 번 더 뽑는다.
    const resolved = this.needsSecondPass(first, assignedType, prompt);
    if (resolved) {
      this.logger.log(`[2단계 추출] 1차 분류=${resolved} → 해당 유형 표준 항목으로 재추출 (PDF)`);
      return this.reExtract(() => this.extractFromPdf(filePath, undefined, resolved, annotationHint), first, resolved);
    }
    return first;
  }
}
