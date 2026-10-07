import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Company } from '../companies/company.entity';
import { CompanyBusiness } from '../companies/company-business.entity';
import { Worker } from '../workers/worker.entity';
import { DocumentsService } from '../documents/documents.service';

const inboxDir = path.join(process.cwd(), 'data', '_inbox');

export interface CollectSummary {
  messagesProcessed: number;
  attachmentsSaved: number;
  errors: string[];
}

@Injectable()
export class MailCollectorService {
  private readonly logger = new Logger(MailCollectorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly documentsService: DocumentsService,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(CompanyBusiness)
    private readonly companyBusinessRepository: Repository<CompanyBusiness>,
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
  ) {}

  async collect(filter?: { since?: Date; before?: Date }): Promise<CollectSummary> {
    const host = this.configService.get<string>('IMAP_HOST');
    const port = Number(this.configService.get<string>('IMAP_PORT') ?? 993);
    const secure = this.configService.get<string>('IMAP_SECURE') !== 'false';
    const user = this.configService.get<string>('IMAP_USER');
    const pass = this.configService.get<string>('IMAP_PASS');
    const mailbox = this.configService.get<string>('IMAP_MAILBOX') ?? 'INBOX';

    if (!host || !user || !pass) {
      throw new BadRequestException('IMAP_HOST/IMAP_USER/IMAP_PASS가 설정되지 않았습니다. .env 파일을 확인하세요.');
    }

    const client = new ImapFlow({ host, port, secure, auth: { user, pass }, logger: false });
    const summary: CollectSummary = { messagesProcessed: 0, attachmentsSaved: 0, errors: [] };

    await client.connect();
    try {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const uids = await client.search(
          { ...(filter?.since && { since: filter.since }), ...(filter?.before && { before: filter.before }) },
          { uid: true },
        );
        if (!uids || uids.length === 0) {
          return summary;
        }

        for (const uid of uids) {
          try {
            await this.processMessage(client, uid, summary, filter);
            summary.messagesProcessed++;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`메일(uid=${uid}) 처리 실패: ${message}`);
            summary.errors.push(`uid=${uid}: ${message}`);
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    return summary;
  }

  private async processMessage(
    client: ImapFlow,
    uid: number,
    summary: CollectSummary,
    filter?: { since?: Date; before?: Date },
  ): Promise<void> {
    const { content } = await client.download(uid, undefined, { uid: true });
    const parsed = await simpleParser(content);

    // IMAP 서버가 SINCE/BEFORE 날짜 검색을 정확히 구현하지 않는 경우를 대비한 클라이언트 측 필터
    if (parsed.date) {
      const msgDate = new Date(parsed.date);
      msgDate.setHours(0, 0, 0, 0);
      if (filter?.since) {
        const since = new Date(filter.since);
        since.setHours(0, 0, 0, 0);
        if (msgDate < since) return;
      }
      if (filter?.before) {
        const before = new Date(filter.before);
        before.setHours(0, 0, 0, 0);
        if (msgDate >= before) return;
      }
    }

    const senderEmail = parsed.from?.value?.[0]?.address ?? '';
    const imapMessageId = parsed.messageId ?? null;
    const { companyId, workerId } = await this.resolveSender(senderEmail);
    const businessId = await this.resolveBusinessId(companyId, workerId);

    await fs.mkdir(inboxDir, { recursive: true });

    for (const attachment of parsed.attachments) {
      if (!attachment.filename) continue;

      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const hash = randomUUID().replace(/-/g, '').slice(0, 4);
      const savedName = `${ts}_${hash}${path.extname(attachment.filename)}`;
      const savedPath = path.join(inboxDir, savedName);
      await fs.writeFile(savedPath, attachment.content);

      const doc = await this.documentsService.createFromCollectedFile({
        fileName: attachment.filename,
        filePath: savedPath,
        mimeType: attachment.contentType,
        fileSize: attachment.size,
        senderEmail,
        imapMessageId,
        businessId,
        companyId,
        workerId,
      });

      // 이미 수집된 첨부파일이면 건너뜀
      if (!doc) {
        await fs.rm(savedPath, { force: true });
        continue;
      }

      summary.attachmentsSaved++;
    }

    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
  }

  private async resolveSender(email: string): Promise<{ companyId?: string; workerId?: string }> {
    if (!email) return {};
    const company = await this.companiesRepository.findOne({ where: { email } });
    if (company) return { companyId: company.id };
    const worker = await this.workersRepository.findOne({ where: { email } });
    if (worker) return { workerId: worker.id };
    return {};
  }

  /**
   * 매칭된 기업(근로자면 소속기업)의 CompanyBusiness를 조회해 사업이 정확히 1개면 그 businessId를,
   * 0개·2개 이상이거나 매칭된 기업이 없으면 null(문서함 "미분류")을 반환한다.
   */
  private async resolveBusinessId(companyId?: string, workerId?: string): Promise<string | null> {
    let targetCompanyId = companyId;
    if (!targetCompanyId && workerId) {
      const worker = await this.workersRepository.findOne({ where: { id: workerId } });
      targetCompanyId = worker?.companyId ?? undefined;
    }
    if (!targetCompanyId) return null;

    const companyBusinesses = await this.companyBusinessRepository.find({ where: { companyId: targetCompanyId } });
    return companyBusinesses.length === 1 ? companyBusinesses[0].businessId : null;
  }
}
