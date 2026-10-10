import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { MulterError } from 'multer';
import type { Response } from 'express';

// Handle remaining Multer errors by code: newer versions changed some messages.
@Catch(MulterError)
export class MessageUploadFilter implements ExceptionFilter {
  catch(error: MulterError, host: ArgumentsHost) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        statusCode: status,
        code:
          error.code === 'LIMIT_FILE_SIZE'
            ? 'MESSAGE_FILE_SIZE'
            : 'MESSAGE_MEDIA_LIMIT',
      });
  }
}
