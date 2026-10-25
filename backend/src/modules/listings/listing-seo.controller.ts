import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { PrismaService } from '../../database/prisma.service.js';

class SitemapQuery {
  @IsOptional()
  @IsUUID()
  after?: string;
}

@Controller('public/listing-sitemap')
export class ListingSeoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async sitemap(@Query() query: SitemapQuery) {
    const items = await this.prisma.listing.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        owner: { lockedAt: null, closedAt: null },
        ...(query.after ? { id: { gt: query.after } } : {}),
      },
      select: { id: true, updatedAt: true },
      orderBy: { id: 'asc' },
      take: 1000,
    });
    return { items, next: items.length === 1000 ? items.at(-1)!.id : null };
  }
}
