import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PDFiumLibrary } from '@hyzyla/pdfium';
import { PNG } from 'pngjs';
import { createWorker, PSM, type Worker as TesseractWorker, type Bbox, type Word } from 'tesseract.js';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * 스캔 PDF 비식별 전송.
 *
 * 글자가 추출되는 PDF는 본문 텍스트를 마스킹해 보내면 되지만(gemini.service.extractFromText),
 * 스캔 PDF는 글자가 '이미지'라서 텍스트 마스킹이 통하지 않는다. 그래서 원본 바이트를 그대로
 * 외부 AI에 보내고 있었고, 이미지에 찍힌 주민등록번호가 평문으로 전송됐다.
 *
 * 여기서는 이렇게 처리한다.
 *   ① PDFium(WASM)으로 페이지를 이미지로 렌더링한다 — 복합기 스캔은 JPEG 배경 + CCITTFax
 *      글자층 수십 개가 겹친 MRC 구조여서, 내장 이미지를 꺼내는 방식으로는 페이지를 복원할 수 없다.
 *   ② Tesseract(WASM)로 OCR해 주민등록번호 위치를 '글자 단위 bbox'로 찾는다.
 *   ③ 뒤 6자리에 해당하는 픽셀을 검은색으로 덮는다. 생년월일 6자리와 성별 1자리는 남긴다 —
 *      만연령 산정(R-200)에 생년월일이 필요하고, 텍스트 경로의 마스킹 형태(`######-G******`)와
 *      같게 맞춰야 서류 간 대조(R-201)가 성립한다.
 *   ④ 덮은 이미지만 AI로 보낸다. 원본 PDF는 전송하지 않는다.
 *
 * 원본 파일은 건드리지 않는다. 가린 이미지는 메모리에만 있고 전송 후 버린다.
 *
 * 한계: OCR이 숫자를 못 읽으면 가릴 위치를 모른다. 그 경우 '가렸다'고 단정하지 않고
 * ocrChars·redactions 를 그대로 돌려주어, 호출자가 전송 여부를 정책에 따라 결정하게 한다
 * (설계서 §10.4 — 모르는 것을 통과로 집계하지 않는다).
 */

/** 주민등록번호: 앞 6자리 + (하이픈) + 뒤 7자리(첫 자리 1~4). OCR 문자열은 공백을 제거한 뒤 검사한다. */
const RRN_IN_OCR = /([0-9]{6})[-–—]?([1-4][0-9]{6})/g;

/**
 * OCR이 숫자를 비슷한 글자로 잘못 읽는 경우를 되돌린다.
 * 스캔 품질에 따라 `0`을 `O`, `1`을 `l`·`I`·`|`, `5`를 `S` 로 읽는 일이 흔하고,
 * 이걸 보정하지 않으면 주민번호를 못 찾아 **가리지 못한 채 전송**된다.
 */
const OCR_DIGIT_CONFUSIONS: Record<string, string> = {
  O: '0', o: '0', Q: '0', D: '0',
  l: '1', I: '1', '|': '1', i: '1', '!': '1', L: '1',
  Z: '2', z: '2',
  E: '3',
  A: '4',
  S: '5', s: '5',
  G: '6', b: '6',
  T: '7', '/': '7',
  B: '8',
  g: '9', q: '9',
};
// 보정은 일부러 넉넉하게 한다 — 놓치면 번호가 평문으로 나가기 때문이다.
// 그 대신 `RRN_MIN_REAL_DIGITS` 로 오탐을 걸러, 글자만 있는 줄에 검은 칠이 생기지 않게 한다.

export function toDigitish(text: string): string {
  let out = '';
  for (const ch of text) out += OCR_DIGIT_CONFUSIONS[ch] ?? ch;
  return out;
}

/**
 * 13자리 중 '진짜 숫자'가 최소 몇 개여야 주민번호로 볼지.
 * OCR 오인식 보정(O→0 등)을 거치면 글자만 있는 줄도 13자리처럼 보일 수 있어서,
 * 원문에 숫자가 이만큼은 있어야 가린다 (오탐으로 엉뚱한 숫자를 덮으면 추출이 망가진다).
 */
const RRN_MIN_REAL_DIGITS = 9;

/** 뒤 6자리만 덮는다 — 성별 1자리는 남긴다. */
const KEEP_GENDER_DIGITS = 1;

/**
 * 렌더링 배율. 2배면 ≈144dpi, 3배면 ≈216dpi.
 * 원본 스캔이 보통 1240x1754(150dpi)이므로 2배는 원본보다 살짝 낮아진다 —
 * 작은 한글(성명 등)이 뭉개져 AI가 못 읽는 경우가 있어 기본을 3배로 둔다.
 * `.env` 의 `AI_SCAN_RENDER_SCALE` 로 조정한다(전송량·시간이 배율의 제곱으로 늘어난다).
 */
function renderScale(): number {
  const raw = Number(process.env.AI_SCAN_RENDER_SCALE);
  return Number.isFinite(raw) && raw >= 1 && raw <= 6 ? raw : 2;
}

/**
 * OCR(탐지)용 배율. 전송용과 분리한다 — 실데이터로 확인한 결과 배율을 올리면
 * OCR이 줄을 다르게 쪼개면서 주민번호를 **놓치는** 경우가 있었다(참여신청서, 2026-11-14).
 * 탐지는 2배가 가장 안정적이었고, 전송 품질은 `AI_SCAN_RENDER_SCALE` 로 따로 올린다.
 */
function ocrRenderScale(): number {
  const raw = Number(process.env.AI_SCAN_OCR_SCALE);
  return Number.isFinite(raw) && raw >= 1 && raw <= 6 ? raw : 2;
}

/** 이 글자 수 미만이면 OCR이 실패한 것으로 본다 (빈 페이지가 아니라 인식 실패). */
export const OCR_FAILURE_THRESHOLD = 50;

/**
 * 주민번호처럼 보이는 13자리 덩어리 수.
 *
 * 가릴 위치를 잡는 쪽(`rectsForLine`)과 **같은 기준**을 써야 한다. 기준이 다르면
 * "읽히는데 못 가렸다"는 거짓 경보가 나거나(정상 서류가 차단), 반대로 놓친 번호를 못 센다.
 */
export function countRrnLikeRuns(text: string): number {
  const raw = text.replace(/\s/g, '');
  const flat = toDigitish(raw);
  RRN_IN_OCR.lastIndex = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = RRN_IN_OCR.exec(flat)) !== null) {
    const slice = raw.slice(m.index, m.index + m[0].length);
    if ((slice.match(/\d/g) ?? []).length >= RRN_MIN_REAL_DIGITS) n += 1;
  }
  return n;
}

export interface ScanRedactionResult {
  /** 주민번호를 덮은 페이지 PNG. 이것만 외부로 보낸다. */
  pages: Buffer[];
  /** 덮은 주민번호 개수. */
  redactions: number;
  /** OCR이 읽은 글자 수(공백 제외). 적으면 OCR 실패로 본다. */
  ocrChars: number;
  /** 페이지 수. */
  pageCount: number;
  /** OCR이 사실상 아무것도 읽지 못한 페이지 번호(1-base). */
  ocrFailedPages: number[];
  /**
   * OCR 글자열에서 '주민번호처럼 보이는 13자리'로 읽힌 횟수.
   *
   * **안전 불변식: `rrnLikeRuns <= redactions`.**
   * 읽히기는 했는데 가린 수가 그보다 적으면, 못 가린 번호가 이미지에 남아 있다는 뜻이다.
   * 그 상태로 보내면 평문으로 나가므로 호출자는 전송하지 않고 멈춰야 한다.
   */
  rrnLikeRuns: number;
}

interface SymbolBox {
  text: string;
  bbox: Bbox;
  /** 이 글자가 속한 단어의 bbox — 덮을 범위를 단어 끝까지 넓힐 때 쓴다. */
  wordBbox: Bbox;
  /** 단어의 마지막 글자인지 */
  lastInWord: boolean;
}

@Injectable()
export class ScanRedactionService implements OnModuleDestroy {
  private readonly logger = new Logger(ScanRedactionService.name);
  private library: PDFiumLibrary | null = null;
  private worker: TesseractWorker | null = null;
  private workerInit: Promise<TesseractWorker> | null = null;

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate().catch(() => undefined);
      this.worker = null;
    }
    if (this.library) {
      this.library.destroy();
      this.library = null;
    }
  }

  /**
   * 스캔 PDF의 주민등록번호 뒤 6자리를 덮은 페이지 이미지를 돌려준다.
   * 원본 파일은 수정하지 않는다.
   */
  async redact(pdfPath: string): Promise<ScanRedactionResult> {
    const library = await this.getLibrary();
    const bytes = await fs.readFile(pdfPath);
    const doc = await library.loadDocument(bytes);

    const pages: Buffer[] = [];
    const ocrFailedPages: number[] = [];
    let redactions = 0;
    let ocrChars = 0;
    let rrnLikeRuns = 0;
    const sendScale = renderScale();
    const ocrScale = ocrRenderScale();

    try {
      let pageNo = 0;
      for (const page of doc.pages()) {
        pageNo += 1;

        // ① 탐지용 렌더 — 배율은 실데이터로 확인한 값(2배)을 쓴다. 더 키우면 OCR이
        //    줄을 다르게 쪼개면서 주민번호를 놓치는 경우가 있었다(2026-11-14 확인).
        const forDetect = await page.render({ scale: ocrScale, render: 'bitmap', colorSpace: 'RGBA' });
        const detectPng = this.encodePng(Buffer.from(forDetect.data), forDetect.width, forDetect.height);
        const boxes = await this.findRrnBoxes(detectPng);
        ocrChars += boxes.chars;
        rrnLikeRuns += boxes.digitRuns;
        if (boxes.chars < OCR_FAILURE_THRESHOLD) {
          ocrFailedPages.push(pageNo);
        }

        // ② 전송용 렌더 — 더 높은 배율로 다시 그린다. 작은 한글(성명 등)이 뭉개지면
        //    AI가 "공란"으로 판단하므로 전송 품질은 탐지 배율과 분리한다.
        const rendered =
          sendScale === ocrScale
            ? forDetect
            : await page.render({ scale: sendScale, render: 'bitmap', colorSpace: 'RGBA' });
        const rgba = Buffer.from(rendered.data);

        // 좌표를 전송용 해상도로 환산한다(가로·세로 비율은 같다).
        const factor = rendered.width / forDetect.width;
        for (const rect of boxes.rects) {
          this.fillBlack(rgba, rendered.width, rendered.height, this.scaleRect(rect, factor));
        }
        redactions += boxes.rects.length;

        pages.push(this.encodePng(rgba, rendered.width, rendered.height));
      }
    } finally {
      doc.destroy();
    }

    this.logger.log(
      `스캔 비식별: ${path.basename(pdfPath)} — ${pages.length}쪽, 주민번호 ${redactions}건 가림, ` +
        `OCR ${ocrChars}자${ocrFailedPages.length ? `, OCR실패 ${ocrFailedPages.join('·')}쪽` : ''}`,
    );

    return { pages, redactions, ocrChars, pageCount: pages.length, ocrFailedPages, rrnLikeRuns };
  }

  private async getLibrary(): Promise<PDFiumLibrary> {
    if (!this.library) {
      this.library = await PDFiumLibrary.init();
    }
    return this.library;
  }

  /**
   * OCR 워커는 한 번 띄워서 재사용한다 (언어데이터 로딩이 매번 1~2초).
   * 언어데이터는 저장소에 동봉한 파일을 쓴다 — 망이 끊긴 기관 서버에서도 동작해야 한다.
   */
  private async getWorker(): Promise<TesseractWorker> {
    if (this.worker) return this.worker;
    if (!this.workerInit) {
      const langPath = path.resolve(__dirname, '../../../resources/tessdata');
      // 압축을 푼 언어데이터(4MB)를 둘 곳. 지정하지 않으면 **현재 작업 폴더에 풀어놓는다**
      // (저장소 루트가 더러워진다). 임시 폴더에 두고 재사용한다.
      const cachePath = path.join(os.tmpdir(), 'jobdori-tessdata');
      await fsSync.promises.mkdir(cachePath, { recursive: true }).catch(() => undefined);
      this.workerInit = createWorker('eng', 1, {
        langPath,
        cachePath,
        gzip: true,
        logger: () => undefined,
        errorHandler: (err: unknown) => this.logger.warn(`OCR 경고: ${String(err)}`),
      }).then((w) => {
        this.worker = w;
        return w;
      });
    }
    return this.workerInit;
  }

  /**
   * 페이지 PNG에서 주민등록번호 뒤 6자리의 픽셀 영역을 찾는다.
   *
   * **OCR 한 번으로는 놓친다.** 실제 서류로 확인한 결과, 같은 페이지를 배율만 바꿔도
   * 한쪽에서 찾은 주민번호를 다른 쪽에서는 못 찾았다. 그래서 두 가지 방식으로 읽고 합집합을 쓴다.
   *   ① 기본 인식 — 일반 문서 레이아웃 가정
   *   ② 숫자만 허용(whitelist) + 흩어진 글자 모드(PSM 11) — 표·도장 사이에 있는 번호를 잡는다
   * 둘 다 '찾은 곳'만 더하므로, 한쪽이 놓쳐도 다른 쪽이 가린다.
   */
  private async findRrnBoxes(png: Buffer): Promise<{ rects: Bbox[]; chars: number; digitRuns: number }> {
    const worker = await this.getWorker();

    // ① 기본 패스
    await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.AUTO });
    const first = await worker.recognize(png, {}, { blocks: true, text: true });
    const chars = (first.data.text ?? '').replace(/\s/g, '').length;
    const rects: Bbox[] = [];
    for (const line of this.collectLines(first.data.blocks)) rects.push(...this.rectsForLine(line));

    // 가리지 못한 '주민번호처럼 보이는 숫자 덩어리'가 남았는지 세어 둔다(안전장치용).
    const digitRuns = countRrnLikeRuns(first.data.text ?? '');

    // ② 숫자 전용 패스
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789-',
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });
    const second = await worker.recognize(png, {}, { blocks: true });
    for (const line of this.collectLines(second.data.blocks)) rects.push(...this.rectsForLine(line));

    // 다음 페이지를 위해 기본값으로 되돌린다.
    await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.AUTO });

    return { rects: this.mergeRects(rects), chars, digitRuns };
  }


  /** 겹치는 사각형을 합친다 (두 패스가 같은 번호를 찾았을 때 중복 칠하기 방지). */
  mergeRects(rects: Bbox[]): Bbox[] {
    const merged: Bbox[] = [];
    for (const r of rects) {
      const hit = merged.find(
        (m) => !(r.x1 < m.x0 || r.x0 > m.x1 || r.y1 < m.y0 || r.y0 > m.y1),
      );
      if (hit) {
        hit.x0 = Math.min(hit.x0, r.x0);
        hit.y0 = Math.min(hit.y0, r.y0);
        hit.x1 = Math.max(hit.x1, r.x1);
        hit.y1 = Math.max(hit.y1, r.y1);
      } else {
        merged.push({ ...r });
      }
    }
    return merged;
  }

  /** 결과 트리에서 줄(words 를 가진 노드)만 모은다. */
  collectLines(blocks: unknown): Array<{ words: Word[] }> {
    const lines: Array<{ words: Word[] }> = [];
    const walk = (node: unknown): void => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj.words)) {
        lines.push({ words: obj.words as Word[] });
      }
      for (const key of ['blocks', 'paragraphs', 'lines']) {
        if (obj[key]) walk(obj[key]);
      }
    };
    walk(blocks);
    return lines;
  }

  /**
   * 한 줄에서 주민등록번호를 찾아 덮을 사각형을 만든다.
   *
   * OCR이 `560101-`, `2345678` 처럼 단어를 쪼개 놓는 경우가 있어, 줄 단위로 글자를 이어 붙여
   * 검사한 뒤 글자 bbox로 되돌린다. 비례 추정이 아니라 글자 단위 bbox 를 쓰므로 위치가 정확하다.
   */
  rectsForLine(line: { words: Word[] }): Bbox[] {
    const symbols: SymbolBox[] = [];
    for (const word of line.words ?? []) {
      const list = word.symbols ?? [];
      if (list.length) {
        list.forEach((s, i) => {
          const t = (s.text ?? '').replace(/\s/g, '');
          if (t) symbols.push({ text: t, bbox: s.bbox, wordBbox: word.bbox, lastInWord: i === list.length - 1 });
        });
        continue;
      }
      // symbols 가 없으면 단어 전체를 한 덩어리로 취급한다(위치는 단어 bbox).
      const t = (word.text ?? '').replace(/\s/g, '');
      if (t) symbols.push({ text: t, bbox: word.bbox, wordBbox: word.bbox, lastInWord: true });
    }

    // 글자 → 문자열 인덱스 매핑 (한 symbol 이 두 글자 이상일 수도 있다).
    // OCR 오인식(O→0, l→1 등)을 보정한 문자열로 검사한다.
    const owner: number[] = [];
    let joined = '';
    symbols.forEach((s, i) => {
      const t = toDigitish(s.text);
      for (const _ch of t) owner.push(i);
      joined += t;
    });

    // 보정 전 원문 — 오탐을 걸러내는 데 쓴다.
    let rawJoined = '';
    symbols.forEach((s) => {
      rawJoined += s.text;
    });

    const rects: Bbox[] = [];
    RRN_IN_OCR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RRN_IN_OCR.exec(joined)) !== null) {
      // 오탐 차단: 보정 덕분에 생긴 '가짜 13자리'를 거른다.
      // 한글·영문이 섞인 줄에서 O→0, l→1 식 보정을 하면 숫자가 아닌 글자가 13자리로 보일 수 있다.
      // 실제 주민번호라면 OCR이 대부분을 숫자로 읽으므로, 원문에 진짜 숫자가 9개 이상일 때만 가린다.
      const rawSlice = rawJoined.slice(m.index, m.index + m[0].length);
      const realDigits = (rawSlice.match(/\d/g) ?? []).length;
      if (realDigits < RRN_MIN_REAL_DIGITS) continue;

      const backStart = m.index + m[0].length - (m[2].length - KEEP_GENDER_DIGITS);
      const backEnd = m.index + m[0].length; // exclusive
      const covered = new Set<number>();
      for (let i = backStart; i < backEnd; i += 1) {
        if (owner[i] !== undefined) covered.add(owner[i]);
      }
      if (!covered.size) continue;

      const parts = [...covered].map((i) => symbols[i]);
      let x0 = Math.min(...parts.map((p) => p.bbox.x0));
      let x1 = Math.max(...parts.map((p) => p.bbox.x1));
      const y0 = Math.min(...parts.map((p) => p.bbox.y0));
      const y1 = Math.max(...parts.map((p) => p.bbox.y1));

      // OCR이 뒤 자리를 실제보다 적게 읽었을 수 있다. 마지막 글자가 단어의 끝이면
      // 그 단어 오른쪽 끝까지 덮어, 못 읽은 숫자가 남지 않게 한다.
      const last = parts[parts.length - 1];
      if (last.lastInWord) x1 = Math.max(x1, last.wordBbox.x1);

      // 글자 한 칸의 1/4 만큼 좌우로 넓힌다(글자 경계가 바짝 잘려 일부 획이 남는 것 방지).
      const pad = Math.max(2, Math.round((x1 - x0) / (backEnd - backStart) / 4));
      x0 = Math.max(0, x0 - pad);
      x1 = x1 + pad;

      rects.push({ x0, y0: Math.max(0, y0 - 2), x1, y1: y1 + 2 });
    }
    return rects;
  }

  /**
   * 탐지 해상도에서 찾은 사각형을 전송 해상도로 환산한다.
   * 환산 오차로 획이 남지 않도록 사방 2px 넉넉하게 잡는다.
   */
  private scaleRect(rect: Bbox, factor: number): Bbox {
    if (factor === 1) return rect;
    return {
      x0: rect.x0 * factor - 2,
      y0: rect.y0 * factor - 2,
      x1: rect.x1 * factor + 2,
      y1: rect.y1 * factor + 2,
    };
  }

  /** RGBA 버퍼의 사각형 영역을 검은색으로 덮는다. */
  private fillBlack(rgba: Buffer, width: number, height: number, rect: Bbox): void {
    const x0 = Math.max(0, Math.floor(rect.x0));
    const x1 = Math.min(width, Math.ceil(rect.x1));
    const y0 = Math.max(0, Math.floor(rect.y0));
    const y1 = Math.min(height, Math.ceil(rect.y1));
    for (let y = y0; y < y1; y += 1) {
      let idx = (y * width + x0) * 4;
      for (let x = x0; x < x1; x += 1) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 255;
        idx += 4;
      }
    }
  }

  private encodePng(rgba: Buffer, width: number, height: number): Buffer {
    const png = new PNG({ width, height });
    png.data = rgba;
    return PNG.sync.write(png);
  }
}
