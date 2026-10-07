import * as path from 'path';

export interface StageMapping {
  folder: string;
  hasWorkerSubfolder: boolean;
  hasSubsidyTypeSubfolder: boolean;
  documents: Record<string, string>;
}

export interface FolderMapping {
  stages: StageMapping[];
  subsidyTypeLabels: Record<string, string>;
}

export interface PathContext {
  dataDir: string;
  businessName: string | null;
  companyName: string | null;
  companyBrn: string | null;
  documentType: string | null;
  workerName: string | null;
  workerBirthDate: string | null;
  subsidyType: string | null;
  existingSubsidyFolderNames: string[];
  originalFileName: string;
  senderEmail: string | null;
  isDirectUpload: boolean;
}

export interface ResolvedPath {
  dir: string;
  baseName: string;
  originalDir: string;
}

const WINDOWS_FORBIDDEN = /[\\/:*?"<>|\x00-\x1F]/g;
const MAX_NAME_LEN = 30;

export function sanitizeName(s: string): string {
  let r = s.replace(WINDOWS_FORBIDDEN, '_').trim();
  r = r.replace(/^\.+|\.+$/g, '').replace(/_+/g, '_');
  if (r.length > MAX_NAME_LEN) r = r.slice(0, MAX_NAME_LEN).trimEnd().replace(/_+$/g, '');
  return r || '_미상';
}

function brnDigits(brn: string | null | undefined): string {
  if (!brn) return '번호미등록';
  const digits = brn.replace(/\D/g, '');
  return digits || '번호미등록';
}

function birthDateShort(bd: string | null | undefined): string | null {
  if (!bd) return null;
  const digits = bd.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.slice(2, 8); // YYMMDD from YYYYMMDD
}

function findStage(mapping: FolderMapping, documentType: string | null): StageMapping | null {
  if (!documentType) return null;
  return mapping.stages.find((s) => documentType in s.documents) ?? null;
}

export function resolveFolder(ctx: PathContext, mapping: FolderMapping): ResolvedPath {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (!ctx.companyName) {
    const senderPart = ctx.senderEmail
      ? sanitizeName(ctx.senderEmail)
      : ctx.isDirectUpload
        ? '직접업로드'
        : '미상';
    const dir = path.join(ctx.dataDir, '_미분류', `${today}_${senderPart}`);
    const baseName = sanitizeName(path.basename(ctx.originalFileName, path.extname(ctx.originalFileName)));
    return { dir, baseName, originalDir: dir };
  }

  const bizFolder = sanitizeName(ctx.businessName ?? '_사업미지정');
  const companyFolder = sanitizeName(`${ctx.companyName}_${brnDigits(ctx.companyBrn)}`);

  const stage = findStage(mapping, ctx.documentType);

  if (!stage) {
    const dir = path.join(ctx.dataDir, bizFolder, companyFolder, '_단계미지정');
    const baseName = sanitizeName(
      `99_기타_${path.basename(ctx.originalFileName, path.extname(ctx.originalFileName))}`,
    );
    return { dir, baseName, originalDir: path.join(dir, '_원본') };
  }

  let stageDir = path.join(ctx.dataDir, bizFolder, companyFolder, stage.folder);

  if (stage.hasWorkerSubfolder) {
    const wName = sanitizeName(ctx.workerName ?? '_근로자미지정');
    const wBd = birthDateShort(ctx.workerBirthDate);
    const workerFolder = wBd ? `${wName}_${wBd}` : wName;
    stageDir = path.join(stageDir, workerFolder);
  }

  if (stage.hasSubsidyTypeSubfolder) {
    const wName = sanitizeName(ctx.workerName ?? '_근로자미지정');
    let typeLabel: string;
    if (ctx.subsidyType && mapping.subsidyTypeLabels[ctx.subsidyType]) {
      typeLabel = mapping.subsidyTypeLabels[ctx.subsidyType];
    } else if (ctx.existingSubsidyFolderNames.length === 1) {
      const existing = ctx.existingSubsidyFolderNames[0];
      const prefix = wName + '_';
      typeLabel = existing.startsWith(prefix) ? existing.slice(prefix.length) : '_유형미지정';
    } else {
      typeLabel = '_유형미지정';
    }
    stageDir = path.join(stageDir, `${wName}_${typeLabel}`);
  }

  const docFileName = ctx.documentType ? (stage.documents[ctx.documentType] ?? null) : null;
  const baseName = docFileName
    ? docFileName
    : sanitizeName(`99_기타_${path.basename(ctx.originalFileName, path.extname(ctx.originalFileName))}`);

  return { dir: stageDir, baseName, originalDir: path.join(stageDir, '_원본') };
}

/** 대상 경로 파일명이 existingFilenames에 있으면 _재제출_YYYYMMDD[_N] 접미사를 붙인 충돌 없는 경로를 반환한다. */
export function resolveConflict(targetPath: string, existingFilenames: Set<string>, today: string): string {
  if (!existingFilenames.has(path.basename(targetPath))) return targetPath;
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  let candidate = path.join(dir, `${base}_재제출_${today}${ext}`);
  if (!existingFilenames.has(path.basename(candidate))) return candidate;
  for (let i = 2; i < 100; i++) {
    candidate = path.join(dir, `${base}_재제출_${today}_${i}${ext}`);
    if (!existingFilenames.has(path.basename(candidate))) return candidate;
  }
  return path.join(dir, `${base}_재제출_${today}_${Date.now()}${ext}`);
}
