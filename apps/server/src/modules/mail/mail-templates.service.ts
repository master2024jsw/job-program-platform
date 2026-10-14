import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailTemplate } from './mail-template.entity';
import { MailTemplateAttachment } from './mail-template-attachment.entity';
import { CreateMailTemplateDto } from './dto/create-mail-template.dto';
import { UpdateMailTemplateDto } from './dto/update-mail-template.dto';

/** 첨부파일 1개당 최대 크기 (10MB). */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** 첨부 메타데이터 컬럼(내용 제외). */
const ATTACHMENT_META_COLUMNS = ['id', 'templateId', 'fileName', 'mimeType', 'fileSize', 'createdAt'] as const;

/** Multer가 latin1로 준 한글 파일명을 UTF-8로 복원한다. */
function decodeFileName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

@Injectable()
export class MailTemplatesService {
  constructor(
    @InjectRepository(MailTemplate)
    private readonly templatesRepository: Repository<MailTemplate>,
    @InjectRepository(MailTemplateAttachment)
    private readonly attachmentsRepository: Repository<MailTemplateAttachment>,
  ) {}

  /** 템플릿에 첨부 메타데이터(내용 제외)를 붙여서 반환한다. */
  private async withAttachments(template: MailTemplate): Promise<MailTemplate> {
    const attachments = await this.attachmentsRepository.find({
      where: { templateId: template.id },
      select: ATTACHMENT_META_COLUMNS as unknown as (keyof MailTemplateAttachment)[],
      order: { createdAt: 'ASC' },
    });
    return { ...template, attachments } as MailTemplate & { attachments: MailTemplateAttachment[] };
  }

  /** 발송용: 템플릿 첨부를 내용(base64)까지 포함해 반환한다. */
  getAttachmentsWithContent(templateId: string): Promise<MailTemplateAttachment[]> {
    return this.attachmentsRepository.find({ where: { templateId }, order: { createdAt: 'ASC' } });
  }

  async addAttachments(
    templateId: string,
    files: Array<{ originalname: string; mimetype?: string; size: number; buffer: Buffer }>,
  ): Promise<MailTemplateAttachment[]> {
    await this.findOne(templateId);
    if (!files?.length) throw new BadRequestException('첨부할 파일이 없습니다.');
    const saved: MailTemplateAttachment[] = [];
    for (const f of files) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        throw new BadRequestException(`첨부파일이 너무 큽니다(최대 10MB): ${decodeFileName(f.originalname)}`);
      }
      const entity = this.attachmentsRepository.create({
        templateId,
        fileName: decodeFileName(f.originalname),
        mimeType: f.mimetype ?? null,
        fileSize: f.size,
        content: f.buffer.toString('base64'),
      });
      saved.push(await this.attachmentsRepository.save(entity));
    }
    // 메타데이터만 돌려준다(내용 제외)
    return saved.map(({ content, ...meta }) => meta as MailTemplateAttachment);
  }

  async removeAttachment(templateId: string, attachmentId: string): Promise<void> {
    const result = await this.attachmentsRepository.delete({ id: attachmentId, templateId });
    if (result.affected === 0) {
      throw new NotFoundException('첨부파일을 찾을 수 없습니다.');
    }
  }

  async create(dto: CreateMailTemplateDto): Promise<MailTemplate> {
    const existing = await this.templatesRepository.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('이미 사용 중인 템플릿 이름입니다.');
    }
    const template = this.templatesRepository.create(dto);
    return this.templatesRepository.save(template);
  }

  async findAll(): Promise<MailTemplate[]> {
    const templates = await this.templatesRepository.find({ order: { createdAt: 'DESC' } });
    return Promise.all(templates.map((t) => this.withAttachments(t)));
  }

  async findOne(id: string): Promise<MailTemplate> {
    const template = await this.templatesRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`메일 템플릿(id=${id})을 찾을 수 없습니다.`);
    }
    return this.withAttachments(template);
  }

  async update(id: string, dto: UpdateMailTemplateDto): Promise<MailTemplate> {
    const template = await this.findOne(id);
    if (dto.name && dto.name !== template.name) {
      const existing = await this.templatesRepository.findOne({ where: { name: dto.name } });
      if (existing) {
        throw new ConflictException('이미 사용 중인 템플릿 이름입니다.');
      }
    }
    Object.assign(template, dto);
    const saved = await this.templatesRepository.save(template);
    return this.withAttachments(saved);
  }

  async remove(id: string): Promise<void> {
    const result = await this.templatesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`메일 템플릿(id=${id})을 찾을 수 없습니다.`);
    }
    // 고아 첨부 제거
    await this.attachmentsRepository.delete({ templateId: id });
  }
}
