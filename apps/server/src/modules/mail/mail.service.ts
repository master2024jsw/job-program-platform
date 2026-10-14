import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { MailLogStatus } from '@job-program/shared';
import { MailLog } from './mail-log.entity';
import { MailTemplatesService } from './mail-templates.service';
import { SendMailDto } from './dto/send-mail.dto';
import { Company } from '../companies/company.entity';
import { Worker } from '../workers/worker.entity';
import { Business } from '../businesses/business.entity';
import { Institution } from '../auth/institution.entity';

function renderTemplate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match,
  );
}

/** 발송 시 즉석 첨부(발송 요청에 함께 업로드된 파일). */
export interface AdHocAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/** MAIL_FROM("표시이름 <email>" 또는 "email")에서 표시이름과 주소를 분리한다. */
function parseFromAddress(mailFrom?: string): { name: string | null; address: string } {
  const raw = (mailFrom ?? '').trim();
  const m = raw.match(/^(.*)<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim().replace(/^["']|["']$/g, '') || null;
    return { name, address: m[2].trim() };
  }
  return { name: null, address: raw };
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly mailTemplatesService: MailTemplatesService,
    @InjectRepository(MailLog)
    private readonly mailLogsRepository: Repository<MailLog>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
    @InjectRepository(Business)
    private readonly businessesRepository: Repository<Business>,
    @InjectRepository(Institution)
    private readonly institutionsRepository: Repository<Institution>,
  ) {}

  /** 발송자(from)를 결정한다. 발송자명은 사업의 운영기관명을 사용하고, 주소는 MAIL_FROM(또는 SMTP_USER)에서 가져온다. */
  private async resolveFrom(businessId?: string): Promise<nodemailer.SendMailOptions['from']> {
    const parsed = parseFromAddress(this.configService.get<string>('MAIL_FROM'));
    const address = parsed.address || this.configService.get<string>('SMTP_USER') || '';
    let name = parsed.name;

    if (businessId) {
      const business = await this.businessesRepository.findOne({ where: { id: businessId } });
      if (business) {
        const institution = await this.institutionsRepository.findOne({ where: { id: business.institutionId } });
        if (institution?.name) name = institution.name;
      }
    }

    if (!address) return name ?? undefined;
    // 객체 형태로 넘기면 nodemailer가 한글 표시이름을 RFC 2047로 올바르게 인코딩한다.
    return name ? { name, address } : address;
  }

  /** 템플릿 첨부 + 즉석 첨부를 nodemailer attachments 배열로 만든다. */
  private async buildAttachments(
    templateId: string | undefined,
    files?: AdHocAttachment[],
  ): Promise<nodemailer.SendMailOptions['attachments']> {
    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> = [];
    if (templateId) {
      const tplAttachments = await this.mailTemplatesService.getAttachmentsWithContent(templateId);
      for (const a of tplAttachments) {
        attachments.push({
          filename: a.fileName,
          content: Buffer.from(a.content, 'base64'),
          contentType: a.mimeType ?? undefined,
        });
      }
    }
    if (files?.length) {
      for (const f of files) {
        attachments.push({ filename: f.filename, content: f.content, contentType: f.contentType });
      }
    }
    return attachments.length ? attachments : undefined;
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      const host = this.configService.get<string>('SMTP_HOST');
      const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
      const secure = this.configService.get<string>('SMTP_SECURE') === 'true';
      const user = this.configService.get<string>('SMTP_USER');
      const pass = this.configService.get<string>('SMTP_PASS');

      if (!host) {
        throw new BadRequestException('SMTP_HOST가 설정되지 않았습니다. .env 파일을 확인하세요.');
      }

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
      });
    }
    return this.transporter;
  }

  private async resolveRecipients(dto: SendMailDto): Promise<string[]> {
    const recipients = new Set<string>(dto.to ?? []);

    if (dto.companyId) {
      const company = await this.companiesRepository.findOne({ where: { id: dto.companyId } });
      if (!company?.email) {
        throw new BadRequestException('해당 기업에 등록된 이메일이 없습니다.');
      }
      recipients.add(company.email);
    }

    if (dto.workerId) {
      const worker = await this.workersRepository.findOne({ where: { id: dto.workerId } });
      if (!worker?.email) {
        throw new BadRequestException('해당 근로자에게 등록된 이메일이 없습니다.');
      }
      recipients.add(worker.email);
    }

    if (recipients.size === 0) {
      throw new BadRequestException('수신자(to, companyId, workerId 중 하나 이상)가 필요합니다.');
    }

    return [...recipients];
  }

  private async resolveContent(dto: SendMailDto): Promise<{ subject: string; body: string; templateId?: string }> {
    const variables = dto.variables ?? {};

    if (dto.templateId) {
      const template = await this.mailTemplatesService.findOne(dto.templateId);
      return {
        subject: renderTemplate(template.subject, variables),
        body: renderTemplate(template.body, variables),
        templateId: template.id,
      };
    }

    if (!dto.subject || !dto.body) {
      throw new BadRequestException('templateId가 없으면 subject와 body가 필요합니다.');
    }

    return { subject: renderTemplate(dto.subject, variables), body: renderTemplate(dto.body, variables) };
  }

  async send(dto: SendMailDto, files?: AdHocAttachment[]): Promise<MailLog[]> {
    const recipients = await this.resolveRecipients(dto);
    const { subject, body, templateId } = await this.resolveContent(dto);
    const from = await this.resolveFrom(dto.businessId);
    const attachments = await this.buildAttachments(templateId, files);

    const results: MailLog[] = [];
    for (const to of recipients) {
      const log = this.mailLogsRepository.create({
        businessId: dto.businessId,
        to,
        subject,
        body,
        templateId,
        status: MailLogStatus.SUCCESS,
      });
      try {
        await this.getTransporter().sendMail({ from, to, subject, html: body, attachments });
      } catch (error) {
        log.status = MailLogStatus.FAILED;
        log.errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`메일 발송 실패 (to=${to}): ${log.errorMessage}`);
      }
      results.push(await this.mailLogsRepository.save(log));
    }
    return results;
  }

  findLogs(businessId?: string): Promise<MailLog[]> {
    return this.mailLogsRepository.find({
      where: businessId ? { businessId } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
