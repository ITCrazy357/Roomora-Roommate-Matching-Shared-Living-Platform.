import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [PrismaModule, AuthModule, CloudinaryModule, LocationsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
