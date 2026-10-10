import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { MulterError } from 'multer';
import type { Response } from 'express';

@Catch(MulterError)
export class PaymentProofUploadFilter implements ExceptionFilter {
  catch(error: MulterError, host: ArgumentsHost) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    host.switchToHttp().getResponse<Response>().status(status).json({
      statusCode: status,
      code: 'PAYMENT_PROOF_INVALID',
    });
  }
}
