import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailTemplate } from './mail-template.entity';
import { CreateMailTemplateDto } from './dto/create-mail-template.dto';
import { UpdateMailTemplateDto } from './dto/update-mail-template.dto';

@Injectable()
export class MailTemplatesService {
  constructor(
    @InjectRepository(MailTemplate)
    private readonly templatesRepository: Repository<MailTemplate>,
  ) {}

  async create(dto: CreateMailTemplateDto): Promise<MailTemplate> {
    const existing = await this.templatesRepository.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('이미 사용 중인 템플릿 이름입니다.');
    }
    const template = this.templatesRepository.create(dto);
    return this.templatesRepository.save(template);
  }

  findAll(): Promise<MailTemplate[]> {
    return this.templatesRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<MailTemplate> {
    const template = await this.templatesRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`메일 템플릿(id=${id})을 찾을 수 없습니다.`);
    }
    return template;
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
    return this.templatesRepository.save(template);
  }

  async remove(id: string): Promise<void> {
    const result = await this.templatesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`메일 템플릿(id=${id})을 찾을 수 없습니다.`);
    }
  }
}
