import {
  ArgumentsHost,
  Catch,
  HttpException,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status >= 500) {
      this.logger.error({
        event: 'http_error',
        status,
        requestId: response.getHeader('X-Request-ID'),
        errorType:
          error instanceof Error ? error.constructor.name : 'UnknownError',
      });
    }
    if (response.headersSent) {
      response.end();
      return;
    }
    const body =
      error instanceof HttpException
        ? error.getResponse()
        : {
            statusCode: 500,
            message: 'Internal server error',
          };
    response
      .status(status)
      .json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
  }
}
