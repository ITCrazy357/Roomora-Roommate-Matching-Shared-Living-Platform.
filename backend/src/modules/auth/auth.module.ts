import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard, OptionalAuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { MailService } from './mail.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { GoogleAuthService } from './google-auth.service.js';
import { GoogleClientService } from './google-client.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController, GoogleAuthController],
  providers: [
    AuthService,
    AuthGuard,
    OptionalAuthGuard,
    MailService,
    PasswordService,
    SessionService,
    GoogleAuthService,
    GoogleClientService,
  ],
  exports: [AuthGuard, OptionalAuthGuard, SessionService],
})
export class AuthModule {}
