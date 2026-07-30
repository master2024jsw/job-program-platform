import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as cheerio from 'cheerio';
import { JobAnnouncement } from './announcement.entity';

const LIST_URL = 'https://www.moel.go.kr/local/daegu/news/notice/noticeList.do';
const VIEW_URL = 'https://www.moel.go.kr/local/daegu/news/notice/noticeView.do';
const AGENCY_NAME = '대구고용노동청';
const DEFAULT_KEYWORD = '위탁';

interface ParsedNoticeRow {
  bbsSeq: string;
  title: string;
  dept: string;
  date: string;
}

export interface MoelCollectSummary {
  keyword: string;
  found: number;
  created: number;
  skipped: number;
}

@Injectable()
export class MoelDaeguCollectorService {
  private readonly logger = new Logger(MoelDaeguCollectorService.name);

  constructor(
    @InjectRepository(JobAnnouncement)
    private readonly announcementsRepository: Repository<JobAnnouncement>,
  ) {}

  async collectByKeyword(keyword: string = DEFAULT_KEYWORD): Promise<MoelCollectSummary> {
    const rows = await this.fetchAllPages(keyword);
    this.logger.log(`대구고용노동청 '${keyword}' 검색 결과 ${rows.length}건 조회`);

    const summary: MoelCollectSummary = { keyword, found: rows.length, created: 0, skipped: 0 };

    for (const row of rows) {
      const sourceUrl = `${VIEW_URL}?bbs_seq=${row.bbsSeq}`;
      const exists = await this.announcementsRepository.findOne({ where: { sourceUrl } });
      if (exists) {
        summary.skipped++;
        continue;
      }

      const announcement = this.announcementsRepository.create({
        title: row.title,
        agency: row.dept ? `${AGENCY_NAME} (${row.dept})` : AGENCY_NAME,
        sourceUrl,
        publishedDate: this.toIsoDate(row.date),
        category: keyword,
      });
      await this.announcementsRepository.save(announcement);
      summary.created++;
    }

    return summary;
  }

  private async fetchAllPages(keyword: string): Promise<ParsedNoticeRow[]> {
    const rows: ParsedNoticeRow[] = [];
    let pageIndex = 1;
    let totalPages = 1;

    do {
      const html = await this.fetchListPage(keyword, pageIndex);
      const { rows: pageRows, totalPages: parsedTotalPages } = this.parseListPage(html);
      rows.push(...pageRows);
      totalPages = parsedTotalPages;
      pageIndex++;
    } while (pageIndex <= totalPages);

    return rows;
  }

  private async fetchListPage(keyword: string, pageIndex: number): Promise<string> {
    const url = new URL(LIST_URL);
    url.searchParams.set('bbs_id', 'LOCAL1');
    url.searchParams.set('searchField', '1');
    url.searchParams.set('searchText', keyword);
    url.searchParams.set('pageIndex', String(pageIndex));

    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) {
      throw new Error(`대구고용노동청 게시판 조회에 실패했습니다. (${res.status})`);
    }
    return res.text();
  }

  private parseListPage(html: string): { rows: ParsedNoticeRow[]; totalPages: number } {
    const $ = cheerio.load(html);
    const rows: ParsedNoticeRow[] = [];

    $('.board_list table tbody tr').each((_, el) => {
      const $row = $(el);
      const $link = $row.find('a[href*="noticeView.do"]');
      const href = $link.attr('href');
      const bbsSeq = href ? new URLSearchParams(href.split('?')[1] ?? '').get('bbs_seq') : null;
      if (!bbsSeq) return;

      const title = ($link.attr('title') ?? $link.text()).trim();
      const dept = $row.find('td[aria-label="담당부서"]').text().trim();
      const date = $row.find('td').eq(4).text().trim();

      rows.push({ bbsSeq, title, dept, date });
    });

    const totalText = $('.board_info .total b').first().text().replace(/,/g, '').trim();
    const total = Number(totalText) || rows.length;
    const totalPages = Math.max(1, Math.ceil(total / 10));

    return { rows, totalPages };
  }

  private toIsoDate(date: string): string | undefined {
    const match = date.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    if (!match) return undefined;
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
}
