/**
 * 합성 테스트 서류 16종의 HTML 템플릿.
 *
 * 검증엔진이 읽는 항목(resources/validation-rules/*.json 의 documentFields)이
 * 모두 들어가도록 만들었다. 서식 자체는 실제 공문 양식이 아니라, AI 가 항목을
 * 읽어낼 수 있는 수준의 단순한 표 형태다.
 *
 * 모든 문서에 '합성 테스트 자료' 표시를 넣는다 — 실제 제출 서류와 섞이면 안 된다.
 */

const won = (n) => Number(n).toLocaleString('ko-KR');
const esc = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** 두 열짜리 항목 표 */
function rows(pairs) {
  return pairs
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v === undefined ? '' : esc(v)}</td></tr>`)
    .join('');
}

/** 문서 한 장의 공통 뼈대 */
function page({ title, subtitle, body, signature }) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Malgun Gothic", "맑은 고딕", sans-serif; font-size: 11pt; color: #111; margin: 0; }
  .watermark {
    border: 1.5px dashed #c00; color: #c00; text-align: center;
    padding: 5px; margin-bottom: 14px; font-size: 9.5pt; font-weight: bold; letter-spacing: 1px;
  }
  h1 { font-size: 17pt; text-align: center; margin: 0 0 4px; letter-spacing: 2px; }
  .sub { text-align: center; color: #555; font-size: 10pt; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { border: 1px solid #333; padding: 7px 9px; font-size: 10.5pt; vertical-align: middle; }
  th { background: #f0f0f0; width: 32%; text-align: left; font-weight: normal; }
  table.grid th { width: auto; text-align: center; background: #f0f0f0; }
  table.grid td { text-align: center; }
  .sign { margin-top: 26px; text-align: right; line-height: 2.1; font-size: 10.5pt; }
  .sign .line { display: inline-block; min-width: 150px; border-bottom: 1px solid #333; text-align: center; }
  .note { font-size: 9.5pt; color: #555; margin-top: 10px; line-height: 1.6; }
  .stamp { color: #c00; font-weight: bold; }
</style></head><body>
<div class="watermark">합성 테스트 자료 — 실제 개인정보 아님 / 제출용 아님</div>
<h1>${esc(title)}</h1>
${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
${body}
${signature ?? ''}
</body></html>`;
}

/** 서명란 */
function signBlock(lines) {
  return `<div class="sign">${lines
    .map(([label, name]) => `${esc(label)} <span class="line">${esc(name)} <span class="stamp">(인)</span></span><br>`)
    .join('')}</div>`;
}

export function buildDocuments(d) {
  const c = d.company;
  const w = d.worker;
  const it = d.intern;
  const docs = [];
  const add = (code, label, html) => docs.push({ code, label, html });

  // ── 1단계: 기업 적격 확인 ──────────────────────────────────────
  add('COMPANY_APPLICATION', '기업 참여신청서', page({
    title: '참여기업 신청서',
    subtitle: `${d.institution.businessName} (${d.institution.year})`,
    body: `<table>${rows([
      ['기업명', c.name],
      ['사업자등록번호', c.businessRegistrationNumber],
      ['대표자명', c.representativeName],
      ['전화번호', c.phone],
      ['이메일', c.email],
      ['팩스', c.fax],
      ['소재지', c.address],
      ['업종', c.industryType],
      ['모집직종', c.recruitJobTitle],
      ['모집직종코드', c.recruitJobCode],
    ])}</table>
    <div class="note">위와 같이 ${esc(d.institution.businessName)} 참여를 신청합니다.</div>`,
    signature: signBlock([['신청인(대표자)', c.representativeName]]),
  }));

  add('BUSINESS_REGISTRATION', '사업자등록증', page({
    title: '사업자등록증',
    subtitle: '( 법인사업자 )',
    body: `<table>${rows([
      ['등록번호', c.businessRegistrationNumber],
      ['법인명(단체명)', c.name],
      ['대표자', c.representativeName],
      ['개업연월일', '2015-03-02'],
      ['사업장 소재지', c.address],
      ['업태', '운수업'],
      ['종목', c.industryType],
    ])}</table>
    <div class="note">위와 같이 등록하였음을 증명합니다.</div>`,
    signature: signBlock([['북대구세무서장', '']]),
  }));

  add('WORKPLACE_INSURANCE', '4대보험 사업장 가입증명', page({
    title: '4대 사회보험 사업장 가입자 명부',
    body: `<table>${rows([
      ['사업장명', c.name],
      ['사업자등록번호', c.businessRegistrationNumber],
    ])}</table>
    <table class="grid">
      <tr><th>국민연금</th><th>건강보험</th><th>산재보험</th><th>고용보험</th></tr>
      <tr>
        <td>${esc(d.insurance.nationalPension)}</td>
        <td>${esc(d.insurance.healthInsurance)}</td>
        <td>${esc(d.insurance.industrialAccident)}</td>
        <td>${esc(d.insurance.employmentInsurance)}</td>
      </tr>
    </table>
    <div class="note">위 사업장은 4대 사회보험에 모두 가입되어 있음을 증명합니다.</div>`,
    signature: signBlock([['국민건강보험공단 이사장', '']]),
  }));

  add('OPERATION_PLAN', '사업운영계획서', page({
    title: '사업 운영계획서',
    subtitle: `${d.institution.businessName} (${d.institution.year})`,
    body: `<table>${rows([
      ['기업명', c.name],
      ['사업자등록번호', c.businessRegistrationNumber],
      ['총 채용예정인원', `${d.operationPlan.plannedHeadcount} 명`],
      ['일반형 인원', `${d.operationPlan.generalTypeCount} 명`],
      ['세대통합형 인원', `${d.operationPlan.intergenerationalTypeCount} 명`],
      ['모집직종', c.recruitJobTitle],
      ['근무시간', it.workHours],
      ['월 급여(예정)', `${won(it.monthlySalary)} 원`],
      ['대표자 행정정보 공동이용 동의', d.operationPlan.representativeConsentToShareAdminInfo],
    ])}</table>
    <div class="note">행정정보 공동이용에 동의하며, 위와 같이 사업 운영계획을 제출합니다.</div>`,
    signature: signBlock([['대표자', c.representativeName]]),
  }));

  // ── 2단계: 참여자 적격 확인 ────────────────────────────────────
  add('WORKER_APPLICATION', '참여자 신청서', page({
    title: '참여자 신청서',
    subtitle: `${d.institution.businessName} (${d.institution.year})`,
    body: `<table>${rows([
      ['성명', w.name],
      ['주민등록번호', w.residentNumber],
      ['생년월일', w.birthDate],
      ['성별', w.gender],
      ['연락처', w.phone],
      ['이메일', w.email],
      ['주소', w.address],
      ['참여기업', c.name],
      ['희망직종', c.recruitJobTitle],
    ])}</table>
    <div class="note">위와 같이 ${esc(d.institution.businessName)} 참여를 신청합니다.</div>`,
    signature: signBlock([['신청인', w.name], ['상담원', '이상담']]),
  }));

  add('PRIVACY_CONSENT', '개인정보 수집·이용 동의서', page({
    title: '개인정보 수집·이용 동의서',
    body: `<table>${rows([
      ['성명', w.name],
      ['생년월일', w.birthDate],
    ])}</table>
    <table class="grid">
      <tr><th>동의 항목</th><th>동의 여부</th></tr>
      <tr><td>개인정보 수집·이용 동의</td><td>동의함 (V)</td></tr>
      <tr><td>고유식별정보 처리 동의</td><td>동의함 (V)</td></tr>
      <tr><td>제3자 제공 동의</td><td>동의함 (V)</td></tr>
      <tr><td>민감정보 처리 동의</td><td>동의함 (V)</td></tr>
    </table>
    <div class="note">위 모든 항목에 동의합니다.</div>`,
    signature: signBlock([['동의자', w.name]]),
  }));

  add('RESIDENT_ABSTRACT', '주민등록초본', page({
    title: '주민등록표 초본',
    body: `<table>${rows([
      ['성명', w.name],
      ['주민등록번호', w.residentNumber],
      ['주소', w.address],
      ['세대주와의 관계', '본인'],
      ['발급일', '2026-05-28'],
    ])}</table>
    <div class="note">위 기재사항은 주민등록표 초본의 내용과 틀림없음을 증명합니다.</div>`,
    signature: signBlock([['대구광역시 동구청장', '']]),
  }));

  const eh = d.employmentHistory;
  add('EMPLOYMENT_INSURANCE_HISTORY', '고용보험 피보험자격 이력내역서', page({
    title: '고용보험 피보험자격 이력내역서',
    body: `<table>${rows([
      ['성명', w.name],
      ['생년월일', w.birthDate],
      ['주민등록번호', w.residentNumber],
    ])}</table>
    <table class="grid">
      <tr><th>사업장명</th><th>취득일</th><th>상실일</th><th>비고</th></tr>
      <tr>
        <td>${esc(eh.previousWorkplace)}</td>
        <td>${esc(eh.previousAcquiredDate)}</td>
        <td>${esc(eh.previousLostDate)}</td>
        <td>이직</td>
      </tr>
    </table>
    <div class="note">위 이력은 고용보험 전산자료와 일치합니다. 현재 피보험자격 취득 사업장 없음.</div>`,
    signature: signBlock([['근로복지공단 이사장', '']]),
  }));

  add('ELIGIBILITY_CONFIRM', '참여자격 확인서', page({
    title: '참여자격 확인서',
    body: `<table>${rows([['성명', w.name], ['생년월일', w.birthDate], ['참여기업', c.name]])}</table>
    <table class="grid">
      <tr><th>확인 항목</th><th>해당 여부</th></tr>
      <tr><td>1. 최근 3개월 내 동일 사업장 근무 이력</td><td>없음</td></tr>
      <tr><td>2. 사업주의 배우자·직계존비속 여부</td><td>없음</td></tr>
      <tr><td>3. 타 재정지원 일자리사업 참여 중</td><td>없음</td></tr>
      <tr><td>4. 고용보험 피보험자격 유지 중</td><td>없음</td></tr>
      <tr><td>5. 참여 제한 대상 해당</td><td>없음</td></tr>
      <tr><td>6. 만 60세 이상 여부</td><td>네</td></tr>
    </table>
    <div class="note">위 내용이 사실과 다름없음을 확인합니다.</div>`,
    signature: signBlock([['참여자', w.name], ['기업 담당자', '최담당']]),
  }));

  const laborContract = page({
    title: '근로계약서',
    subtitle: `${it.probationKeyword} 포함`,
    body: `<table>${rows([
      ['사업장명', c.name],
      ['대표자', c.representativeName],
      ['연락처', c.phone],
      ['소재지', c.address],
      ['근로자 성명', w.name],
      ['생년월일', w.birthDate],
      ['담당업무', it.position],
      ['인턴(수습) 시작일', it.startDate],
      ['인턴(수습) 종료일', it.endDate],
      ['인턴 약정기간', `${it.startDate} ~ ${it.endDate} (${it.probationKeyword})`],
      ['월 급여', `${won(it.monthlySalary)} 원`],
      ['근로시간', it.workHours],
      ['근무일', '주 5일 (월~금)'],
    ])}</table>
    <div class="note">위 조건으로 근로계약을 체결하며, ${esc(it.probationKeyword)} 중 근로조건은 본 계약에 따른다.</div>`,
    signature: signBlock([['사용자(대표자)', c.representativeName], ['근로자', w.name]]),
  });
  add('LABOR_CONTRACT', '근로계약서', laborContract);

  const ed = d.education;
  add('EDUCATION_LEDGER', '교육 실시대장', page({
    title: '교육 실시대장',
    body: `<table>${rows([
      ['교육명', ed.name],
      ['교육기관', ed.org],
      ['교육일자', ed.date],
      ['교육장소', '이노비즈 교육장'],
    ])}</table>
    <table class="grid">
      <tr><th>참여자 성명</th><th>생년월일</th><th>소속기업</th><th>서명</th></tr>
      <tr><td>${esc(w.name)}</td><td>${esc(w.birthDate)}</td><td>${esc(c.name)}</td><td>${esc(w.name)} (서명)</td></tr>
    </table>`,
    signature: signBlock([['교육담당자', '이상담']]),
  }));

  // ── 3단계: 지원금 신청 서류검증 ────────────────────────────────
  const s = d.subsidy;
  add('SUBSIDY_APPLICATION', '지원금 신청서', page({
    title: '참여기업 지원금 신청서',
    subtitle: `${s.benefitType} / ${d.institution.businessName}`,
    body: `<table>${rows([
      ['기업명', c.name],
      ['사업자등록번호', c.businessRegistrationNumber],
      ['대표자명', c.representativeName],
      ['신청 인원', `${s.applicantCount} 명`],
      ['신청 금액', `${won(s.totalAmount)} 원`],
      ['입금 은행', d.bankAccount.bankName],
      ['계좌번호', d.bankAccount.accountNumber],
      ['예금주', d.bankAccount.accountHolder],
    ])}</table>
    <div class="note">위와 같이 ${esc(s.benefitType)} 지급을 신청합니다.</div>`,
    signature: signBlock([['신청인(대표자)', c.representativeName]]),
  }));

  add('SUBSIDY_CALCULATION', '지원금 산출내역서', page({
    title: '지원금 산출내역서',
    body: `<table class="grid">
      <tr><th>성명</th><th>생년월일</th><th>지원금 유형</th><th>회차</th><th>지원기간</th><th>월 급여</th><th>지원금액</th></tr>
      ${s.rounds
        .map(
          (r) => `<tr>
        <td>${esc(w.name)}</td><td>${esc(w.birthDate)}</td><td>${esc(s.benefitType)}</td>
        <td>${r.round}회차</td><td>${esc(r.periodStart)} ~ ${esc(r.periodEnd)}</td>
        <td>${won(it.monthlySalary)}</td><td>${won(r.amount)}</td></tr>`,
        )
        .join('')}
      <tr><th colspan="6">합계</th><th>${won(s.totalAmount)}</th></tr>
    </table>
    <div class="note">산정 기준: 월 급여의 50%, 월 최대 400,000원 한도 (일반형 인턴 지원금)</div>`,
    signature: signBlock([['작성자', '최담당']]),
  }));

  add('INSURANCE_ROSTER', '4대보험 가입자명부', page({
    title: '4대 사회보험 가입자 명부',
    body: `<table>${rows([
      ['사업장명', c.name],
      ['사업자등록번호', c.businessRegistrationNumber],
    ])}</table>
    <table class="grid">
      <tr><th>성명</th><th>주민등록번호</th><th>취득일</th><th>국민연금</th><th>건강보험</th><th>고용보험</th><th>산재보험</th></tr>
      <tr><td>${esc(w.name)}</td><td>${esc(w.residentNumber)}</td><td>${esc(it.startDate)}</td>
          <td>가입</td><td>가입</td><td>가입</td><td>가입</td></tr>
    </table>`,
    signature: signBlock([['국민건강보험공단 이사장', '']]),
  }));

  const p = d.payroll;
  add('PAYROLL', '급여명세서', page({
    title: '급여명세서',
    subtitle: `${p.month} 귀속`,
    body: `<table>${rows([
      ['사업장명', c.name],
      ['근로자 성명', w.name],
      ['귀속 월', p.month],
    ])}</table>
    <table class="grid">
      <tr><th>지급 항목</th><th>금액</th><th>공제 항목</th><th>금액</th></tr>
      <tr><td>기본급</td><td>${won(p.baseSalary)}</td><td>국민연금</td><td>90,000</td></tr>
      <tr><td>-</td><td>-</td><td>건강보험</td><td>70,000</td></tr>
      <tr><td>-</td><td>-</td><td>고용보험</td><td>20,000</td></tr>
      <tr><th>지급 총액</th><th>${won(p.totalPay)}</th><th>공제 총액</th><th>${won(p.totalDeduction)}</th></tr>
      <tr><th colspan="3">차감 지급액</th><th>${won(p.netPay)}</th></tr>
    </table>`,
    signature: signBlock([['사업주', c.representativeName]]),
  }));

  const tr = d.transfer;
  add('SALARY_TRANSFER', '급여 이체확인증', page({
    title: '이체 확인증',
    body: `<table>${rows([
      ['출금 계좌', `${d.bankAccount.bankName} ${d.bankAccount.accountNumber}`],
      ['출금 계좌주', c.name],
      ['입금 받는 분', w.name],
      ['이체 금액', `${won(tr.amount)} 원`],
      ['이체 일자', tr.date],
      ['적요', `${esc(p.month)} 급여`],
    ])}</table>
    <div class="note">위와 같이 이체되었음을 확인합니다.</div>`,
    signature: signBlock([[`${d.bankAccount.bankName}`, '']]),
  }));

  const ba = d.bankAccount;
  add('BANK_ACCOUNT_COPY', '통장 사본', page({
    title: '예금 통장 사본',
    body: `<table>${rows([
      ['은행명', ba.bankName],
      ['계좌번호', ba.accountNumber],
      ['예금주', ba.accountHolder],
      ['계좌 종류', ba.isBusinessAccount ? '법인(사업자) 계좌' : '개인 계좌'],
      ['개설일', '2015-03-10'],
    ])}</table>
    <div class="note">위 계좌는 ${esc(ba.accountHolder)} 명의의 법인 계좌입니다.</div>`,
    signature: signBlock([[`${ba.bankName}`, '']]),
  }));

  return docs;
}
