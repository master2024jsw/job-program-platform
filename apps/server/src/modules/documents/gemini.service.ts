import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs/promises';

const DEFAULT_MODEL = 'gemini-2.5-flash';

const DEFAULT_PROMPT = [
  '첨부된 PDF 문서의 내용을 분석해서 문서에 담긴 정보를 JSON 객체로 추출해줘.',
  '문서 종류를 스스로 판단하고, 사람 이름·생년월일·연락처·기업명·사업자등록번호·날짜 등',
  '문서에서 확인 가능한 항목들을 key-value 형태로 담아줘.',
  '값을 확인할 수 없는 항목은 넣지 말고, 반드시 JSON 객체 하나만 응답해.',
  '또한 이 문서 종류를 기준으로 볼 때 서명·날인·필수 기재 항목·첨부가 누락되었거나',
  '내용이 불명확한 부분이 있는지 검토해서, 문제가 있는 항목을 한글 설명 문장으로 만들어',
  '"missingItems"라는 배열 필드에 담아줘. 누락되거나 불명확한 부분이 없으면 빈 배열로 둬.',
].join(' ');

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenAI | null = null;

  constructor(private readonly configService: ConfigService) {}

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

  async extractFromPdf(filePath: string, prompt?: string): Promise<Record<string, unknown>> {
    const client = this.getClient();
    const model = this.configService.get<string>('GEMINI_MODEL') ?? DEFAULT_MODEL;
    const fileBuffer = await fs.readFile(filePath);

    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: fileBuffer.toString('base64') } },
            { text: prompt?.trim() || DEFAULT_PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) {
      throw new BadRequestException('Gemini 응답에서 텍스트를 받지 못했습니다.');
    }

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch (error) {
      this.logger.error(`Gemini 응답 JSON 파싱 실패: ${text}`);
      throw new BadRequestException('Gemini 응답을 JSON으로 해석하지 못했습니다.');
    }
  }
}
