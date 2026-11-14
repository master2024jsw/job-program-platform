import { ScanRedactionService, toDigitish, countRrnLikeRuns } from './scan-redaction.service';

/** OCR 결과 모양을 흉내낸 단어 하나 만들기 — 글자 bbox 를 균등 분할한다. */
function word(text: string, x0: number, y0: number, charWidth = 10, height = 20) {
  const symbols = [...text].map((ch, i) => ({
    text: ch,
    bbox: { x0: x0 + i * charWidth, y0, x1: x0 + (i + 1) * charWidth, y1: y0 + height },
  }));
  return {
    text,
    bbox: { x0, y0, x1: x0 + text.length * charWidth, y1: y0 + height },
    symbols,
  } as never;
}

describe('scan-redaction (스캔 PDF 비식별)', () => {
  const svc = new ScanRedactionService();

  describe('toDigitish — OCR 오인식 보정', () => {
    it('숫자로 잘못 읽힌 글자를 숫자로 되돌린다', () => {
      expect(toDigitish('56O1O1-l2345S7')).toBe('560101-1234557');
    });

    it('한글은 건드리지 않는다', () => {
      expect(toDigitish('주민등록번호')).toBe('주민등록번호');
    });
  });

  describe('countRrnLikeRuns — 읽힌 주민번호 수', () => {
    it('정상 표기를 센다', () => {
      expect(countRrnLikeRuns('주민등록번호 620315-1234567 확인')).toBe(1);
    });

    it('구분자 없는 13자리도 센다', () => {
      expect(countRrnLikeRuns('6203151234567')).toBe(1);
    });

    it('여러 건을 모두 센다', () => {
      expect(countRrnLikeRuns('620315-1234567 850202-2345678')).toBe(2);
    });

    // 오탐 차단: 보정 때문에 글자가 13자리처럼 보이는 경우를 세면 정상 서류가 차단된다.
    it('영문자만으로 만들어진 가짜 13자리는 세지 않는다', () => {
      expect(countRrnLikeRuns('OOOOOO-lOOOOOO')).toBe(0);
      expect(countRrnLikeRuns('SOBIGS-lESSOQB')).toBe(0);
    });

    it('숫자가 일부 섞인 정도는 주민번호로 본다 (OCR 오인식 1~4자)', () => {
      expect(countRrnLikeRuns('62O315-1234567')).toBe(1);
    });

    it('사업자등록번호(10자리)·금액·날짜는 세지 않는다', () => {
      expect(countRrnLikeRuns('123-45-67890')).toBe(0);
      expect(countRrnLikeRuns('1,466,667원')).toBe(0);
      expect(countRrnLikeRuns('2026-06-01')).toBe(0);
    });

    it('뒤 첫 자리가 5~9면 주민번호가 아니다', () => {
      expect(countRrnLikeRuns('6203159234567')).toBe(0);
    });
  });

  describe('rectsForLine — 가릴 영역', () => {
    it('뒤 6자리만 덮고 생년월일·성별 자리는 남긴다', () => {
      // "620315-1234567" → 앞 6 + 하이픈 + 성별 1 = 8글자(x 0~80)는 남고, 뒤 6글자(x 80~140)를 덮는다.
      const rects = svc.rectsForLine({ words: [word('620315-1234567', 0, 100)] });
      expect(rects).toHaveLength(1);
      expect(rects[0].x0).toBeGreaterThanOrEqual(75); // 성별 자리(70~80)는 살려 둔다
      expect(rects[0].x1).toBeGreaterThanOrEqual(140);
    });

    it('OCR이 단어를 쪼개 놓아도 찾는다', () => {
      const rects = svc.rectsForLine({
        words: [word('620315-', 0, 100), word('1234567', 80, 100)],
      });
      expect(rects).toHaveLength(1);
      // 뒤 6자리는 두 번째 단어 안에 있다 (90~150)
      expect(rects[0].x0).toBeGreaterThanOrEqual(85);
    });

    it('OCR 오인식이 섞여 있어도 찾는다', () => {
      const rects = svc.rectsForLine({ words: [word('62O315-1234567', 0, 100)] });
      expect(rects).toHaveLength(1);
    });

    it('글자만 있는 줄은 가리지 않는다', () => {
      expect(svc.rectsForLine({ words: [word('OOOOOO-lOOOOOO', 0, 100)] })).toHaveLength(0);
    });

    it('주민번호가 없는 줄은 가리지 않는다', () => {
      expect(svc.rectsForLine({ words: [word('사업장명칭', 0, 100)] })).toHaveLength(0);
      expect(svc.rectsForLine({ words: [word('123-45-67890', 0, 100)] })).toHaveLength(0);
    });

    it('한 줄에 두 건이 있으면 둘 다 가린다', () => {
      const rects = svc.rectsForLine({
        words: [word('620315-1234567', 0, 100), word('850202-2345678', 200, 100)],
      });
      expect(rects).toHaveLength(2);
    });
  });

  describe('mergeRects — 중복 영역 합치기', () => {
    it('겹치는 사각형은 하나로 합친다 (두 OCR 패스가 같은 번호를 찾은 경우)', () => {
      const merged = svc.mergeRects([
        { x0: 10, y0: 10, x1: 50, y1: 30 },
        { x0: 20, y0: 12, x1: 60, y1: 28 },
      ]);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual({ x0: 10, y0: 10, x1: 60, y1: 30 });
    });

    it('떨어진 사각형은 그대로 둔다 (표의 다른 행에 있는 주민번호)', () => {
      const merged = svc.mergeRects([
        { x0: 10, y0: 10, x1: 50, y1: 30 },
        { x0: 10, y0: 100, x1: 50, y1: 120 },
      ]);
      expect(merged).toHaveLength(2);
    });
  });
});
