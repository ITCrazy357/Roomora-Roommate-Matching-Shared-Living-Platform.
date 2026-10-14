import {
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Res,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'express';
import { observeHttp } from '../src/common/http-observability.js';
import { ApiExceptionFilter } from '../src/common/api-exception.filter.js';

@Controller('probe')
class ProbeController {
  @Get('stream/healthy')
  async healthyStream(@Res() response: Response) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.write('event: sync\ndata: {}\n\n');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    response.end();
  }
  @Get('stream/close')
  stream(@Res() response: Response) {
    response.write('event: sync\ndata: {}\n\n');
    throw new Error('private-stream-error');
  }
  @Get(':id')
  fail() {
    throw new Error('postgresql://user:private-secret@internal/db');
  }
  @Get()
  unavailable() {
    throw new InternalServerErrorException('Expected failure');
  }
}

describe('Operational logs and errors', () => {
  it('correlates errors, redacts secrets and keeps the HTTP contract', async () => {
    const logs: unknown[] = [];
    const errors = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((entry) => {
        logs.push(entry);
      });
    const warnings = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((entry) => {
        logs.push(entry);
      });
    const module = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    const app = module.createNestApplication();
    app.use(observeHttp);
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    try {
      const reply = await request(app.getHttpServer())
        .get('/probe/private-person?token=private-token')
        .set('Cookie', 'session=private-cookie')
        .expect(500);
      expect(reply.headers['x-request-id']).toMatch(/^[\da-f-]{36}$/);
      expect(reply.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
      expect(logs).toContainEqual(
        expect.objectContaining({
          event: 'http_error',
          requestId: reply.headers['x-request-id'],
        }),
      );
      expect(logs).toContainEqual(
        expect.objectContaining({
          event: 'http_request',
          route: '/probe/:id',
          status: 500,
        }),
      );
      expect(JSON.stringify(logs)).not.toMatch(
        /private-|postgresql|internal\/db/,
      );
      await request(app.getHttpServer())
        .get('/probe')
        .expect(500)
        .expect(({ body }) => {
          expect(body.message).toBe('Expected failure');
        });
      const streamed = await request(app.getHttpServer())
        .get('/probe/stream/close')
        .timeout(1000)
        .expect(200);
      expect(streamed.text).toBe('event: sync\ndata: {}\n\n');
      await request(app.getHttpServer())
        .get('/probe/stream/healthy')
        .timeout(2500)
        .expect(200);
      expect(logs).not.toContainEqual(
        expect.objectContaining({
          event: 'http_request',
          route: '/probe/stream/healthy',
        }),
      );
    } finally {
      await app.close();
      errors.mockRestore();
      warnings.mockRestore();
    }
  });
});
