import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './database/prisma.module.js';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment.validation.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { APP_GUARD } from '@nestjs/core';
import { OriginGuard } from './common/origin.guard.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { PeopleModule } from './modules/people/people.module.js';
import { CommunicationsModule } from './modules/communications/communications.module.js';
import { HousesModule } from './modules/houses/houses.module.js';
import { ExpensesModule } from './modules/expenses/expenses.module.js';
import { HouseholdModule } from './modules/household/household.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { SupportModule } from './modules/support/support.module.js';
import { AiModule } from './modules/ai/ai.module.js';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ProfileModule,
    ListingsModule,
    PeopleModule,
    CommunicationsModule,
    HousesModule,
    ExpensesModule,
    HouseholdModule,
    AdminModule,
    BillingModule,
    SupportModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: OriginGuard,
    },
  ],
})
export class AppModule {}
