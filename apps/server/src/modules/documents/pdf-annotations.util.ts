import * as fs from 'fs/promises';
import { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, PDFDict } from 'pdf-lib';

/**
 * PDF 주석(annotation)에 적힌 글자를 뽑아낸다.
 *
 * 왜 필요한가:
 * 관공서·은행 서식에 값을 적을 때 본문이 아니라 **주석 레이어**(FreeText 등)로 얹는 경우가 있다.
 * 사람 눈에는 겹쳐 보이지만, 본문 텍스트 추출에도 안 잡히고 AI 가 문서 이미지를 볼 때도 빠질 수 있다.
 * 실제로 주민등록초본의 성명·4대보험 확인서의 사업장명칭이 전부 주석이라
 * AI 가 "공란입니다"라고 판단한 일이 있었다 (2026-10-16).
 *
 * 그래서 분석 전에 주석 글자를 따로 뽑아 AI 에게 같이 넘긴다.
 * 이 값은 '문서에 실제로 적혀 있는 값'이지 우리가 지어낸 값이 아니다.
 */

/** 주석에서 글자를 담고 있는 키들. /Contents 가 기본이고, 폼 필드 값은 /V 에 있다. */
const TEXT_KEYS = ['Contents', 'V'] as const;

function readString(dict: PDFDict, key: string): string | null {
  const raw = dict.get(PDFName.of(key));
  if (raw instanceof PDFString || raw instanceof PDFHexString) {
    const s = raw.decodeText().trim();
    return s.length > 0 ? s : null;
  }
  return null;
}

/**
 * PDF 파일에서 주석 글자를 페이지 순서대로 뽑는다.
 * 중복(같은 값이 여러 칸에 반복되는 표 등)은 한 번만 남긴다.
 *
 * 실패해도 예외를 던지지 않는다 — 주석이 없거나 PDF 가 특이해도 분석은 계속되어야 한다.
 */
export async function extractPdfAnnotationTexts(filePath: string): Promise<string[]> {
  try {
    const bytes = await fs.readFile(filePath);
    // 손상되거나 암호가 걸린 PDF 도 가능한 한 읽어본다.
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });

    const seen = new Set<string>();
    const out: string[] = [];

    for (const page of doc.getPages()) {
      const annots = page.node.get(PDFName.of('Annots'));
      const array =
        annots instanceof PDFArray ? annots : annots ? page.node.context.lookup(annots, PDFArray) : undefined;
      if (!array) continue;

      for (let i = 0; i < array.size(); i++) {
        let dict: PDFDict | undefined;
        try {
          dict = array.lookup(i, PDFDict);
        } catch {
          continue; // 깨진 항목은 건너뛴다
        }
        if (!dict) continue;

        for (const key of TEXT_KEYS) {
          const text = readString(dict, key);
          if (!text) continue;
          // 줄바꿈이 섞인 주석은 한 줄로 합친다 (표 칸에 두 줄로 적힌 경우가 많다).
          const normalized = text.replace(/\s*\n\s*/g, ' ').trim();
          if (!normalized || seen.has(normalized)) continue;
          seen.add(normalized);
          out.push(normalized);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 뽑은 주석 글자를 AI 프롬프트에 붙일 문단으로 만든다.
 * 주석이 없으면 빈 문자열 — 프롬프트에 아무것도 더하지 않는다.
 */
export function buildAnnotationHint(texts: string[]): string {
  if (texts.length === 0) return '';
  const nl = String.fromCharCode(10);
  return [
    '아래는 이 PDF 에 주석(덧붙인 텍스트) 레이어로 들어 있는 글자를 그대로 뽑은 것이다.',
    '문서 이미지에서 잘 보이지 않더라도 이 글자들은 실제로 문서에 적혀 있는 값이니,',
    '해당하는 항목에 채워 넣고 그 항목을 공란이라고 적지 마라.',
    '--- 주석 텍스트 ---',
    texts.join(nl),
    '--- 주석 텍스트 끝 ---',
  ].join(nl);
}
