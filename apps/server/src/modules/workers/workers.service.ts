import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Worker } from './worker.entity';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker)
    private readonly workersRepository: Repository<Worker>,
  ) {}

  create(dto: CreateWorkerDto): Promise<Worker> {
    const worker = this.workersRepository.create(dto);
    return this.workersRepository.save(worker);
  }

  findAll(params: { keyword?: string; companyId?: string }): Promise<Worker[]> {
    const where: Record<string, unknown> = {};
    if (params.keyword) {
      where.name = Like(`%${params.keyword}%`);
    }
    if (params.companyId) {
      where.companyId = params.companyId;
    }
    return this.workersRepository.find({
      where: Object.keys(where).length ? where : undefined,
      relations: ['company'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Worker> {
    const worker = await this.workersRepository.findOne({ where: { id }, relations: ['company'] });
    if (!worker) {
      throw new NotFoundException(`근로자(id=${id})를 찾을 수 없습니다.`);
    }
    return worker;
  }

  async update(id: string, dto: UpdateWorkerDto): Promise<Worker> {
    const worker = await this.findOne(id);
    Object.assign(worker, dto);
    return this.workersRepository.save(worker);
  }

  async remove(id: string): Promise<void> {
    const result = await this.workersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`근로자(id=${id})를 찾을 수 없습니다.`);
    }
  }
}
