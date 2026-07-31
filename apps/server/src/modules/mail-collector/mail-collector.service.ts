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
import { Worker } from '../workers/worker.entity';
import { DocumentsService } from '../documents/documents.service';

const uploadDir = path.join(process.cwd(), 'data', 'uploads');

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
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
  ) {}

  async collect(): Promise<CollectSummary> {
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
        const uids = await client.search({ seen: false }, { uid: true });
        if (!uids || uids.length === 0) {
          return summary;
        }

        for (const uid of uids) {
          try {
            await this.processMessage(client, uid, summary);
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

  private async processMessage(client: ImapFlow, uid: number, summary: CollectSummary): Promise<void> {
    const { content } = await client.download(uid, undefined, { uid: true });
    const parsed = await simpleParser(content);

    const senderEmail = parsed.from?.value?.[0]?.address ?? '';
    const { companyId, workerId } = await this.resolveSender(senderEmail);

    await fs.mkdir(uploadDir, { recursive: true });

    for (const attachment of parsed.attachments) {
      if (!attachment.filename) continue;

      const savedName = `${randomUUID()}${path.extname(attachment.filename)}`;
      const savedPath = path.join(uploadDir, savedName);
      await fs.writeFile(savedPath, attachment.content);

      await this.documentsService.createFromCollectedFile({
        fileName: attachment.filename,
        filePath: savedPath,
        mimeType: attachment.contentType,
        fileSize: attachment.size,
        senderEmail,
        companyId,
        workerId,
      });
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
}
