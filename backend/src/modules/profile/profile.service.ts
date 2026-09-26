import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import type { Profile } from '../../generated/prisma/client.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { LocationsService } from '../locations/locations.service.js';
import type { DesiredLocation } from '../locations/locations.service.js';

@Injectable()
export class ProfileService {
  private readonly avatarAttempts = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly locations: LocationsService,
  ) {}

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const now = Date.now();
    for (const [key, entry] of this.avatarAttempts)
      if (entry.resetAt <= now) this.avatarAttempts.delete(key);
    const attempts = this.avatarAttempts.get(userId) ?? {
      count: 0,
      resetAt: now + 10 * 60_000,
    };
    if (attempts.count >= 10 || this.avatarAttempts.size >= 10_000) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Vui lòng chờ trước khi tải ảnh tiếp',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    attempts.count++;
    this.avatarAttempts.set(userId, attempts);
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!existing) throw this.notFound();
    const uploaded = await this.cloudinary.uploadAvatar(file, userId);
    try {
      const result = await this.prisma.profile.updateMany({
        where: {
          userId,
          updatedAt: existing.updatedAt,
          avatarPublicId: existing.avatarPublicId,
        },
        data: {
          avatarUrl: uploaded.secureUrl,
          avatarPublicId: uploaded.publicId,
        },
      });
      if (!result.count)
        throw new ConflictException({
          code: 'PROFILE_CHANGED',
          message: 'Hồ sơ vừa thay đổi. Vui lòng thử lại',
        });
    } catch (error) {
      await this.cloudinary.deleteAvatar(uploaded.publicId, userId);
      throw error;
    }
    await this.cloudinary.deleteAvatar(existing.avatarPublicId, userId);
    return this.getMine(userId);
  }

  async removeAvatar(userId: string) {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!existing) throw this.notFound();
    const result = await this.prisma.profile.updateMany({
      where: {
        userId,
        updatedAt: existing.updatedAt,
        avatarPublicId: existing.avatarPublicId,
      },
      data: { avatarUrl: null, avatarPublicId: null },
    });
    if (!result.count)
      throw new ConflictException({
        code: 'PROFILE_CHANGED',
        message: 'Hồ sơ vừa thay đổi. Vui lòng thử lại',
      });
    await this.cloudinary.deleteAvatar(existing.avatarPublicId, userId);
    return this.getMine(userId);
  }

  async getMine(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user?.profile) throw this.notFound();

    return {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      ...this.fullProfile(user.profile),
    };
  }

  async updateMine(userId: string, dto: UpdateProfileDto) {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!existing) throw this.notFound();

    const budgetMin =
      dto.budgetMin === undefined ? existing.budgetMin : dto.budgetMin;
    const budgetMax =
      dto.budgetMax === undefined ? existing.budgetMax : dto.budgetMax;
    if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
      throw new BadRequestException({
        code: 'BUDGET_RANGE_INVALID',
        message: 'Ngân sách tối thiểu không được lớn hơn tối đa',
      });
    }

    if (dto.desiredLocations !== undefined && dto.desiredAreas !== undefined) {
      throw new BadRequestException({
        code: 'LOCATION_INVALID',
        message: 'Chỉ gửi một định dạng khu vực',
      });
    }
    const resolvedLocations =
      dto.desiredLocations === undefined
        ? undefined
        : this.locations.resolve(dto.desiredLocations);
    const desiredAreas = resolvedLocations
      ? resolvedLocations.map((item) =>
          [item.wardName, item.provinceName].filter(Boolean).join(', '),
        )
      : dto.desiredAreas
        ? [
            ...new Set(
              dto.desiredAreas.map((area) => area.trim()).filter(Boolean),
            ),
          ]
        : undefined;
    const { completeOnboarding, desiredLocations, ...profileData } = dto;
    const profile = await this.prisma.profile.update({
      where: { userId },
      data: {
        ...profileData,
        desiredAreas,
        desiredLocations:
          desiredLocations?.map(({ provinceCode, wardCode }) => ({
            provinceCode,
            wardCode: wardCode ?? null,
          })) ?? (dto.desiredAreas !== undefined ? [] : undefined),
        onboardingCompletedAt:
          completeOnboarding === true
            ? (existing.onboardingCompletedAt ?? new Date())
            : undefined,
      },
    });
    return this.fullProfile(profile);
  }

  async getPublic(userId: string, requesterId?: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!profile) throw this.notFound();

    const owner = requesterId === userId;
    if (!owner && profile.visibility === 'PRIVATE') throw this.notFound();
    if (owner) return this.fullProfile(profile);

    return {
      userId: profile.userId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      visibility: profile.visibility,
      budgetMin: profile.showBudget ? profile.budgetMin : undefined,
      budgetMax: profile.showBudget ? profile.budgetMax : undefined,
      desiredAreas: profile.showDesiredAreas ? profile.desiredAreas : undefined,
      desiredLocations: profile.showDesiredAreas
        ? this.profileLocations(profile)
        : undefined,
      sleepSchedule: profile.showLifestyle ? profile.sleepSchedule : undefined,
      smokingPreference: profile.showLifestyle
        ? profile.smokingPreference
        : undefined,
      petPreference: profile.showLifestyle ? profile.petPreference : undefined,
      quietLevel: profile.showLifestyle ? profile.quietLevel : undefined,
    };
  }

  private profileLocations(profile: Profile) {
    return this.locations.resolve(
      profile.desiredLocations as unknown as DesiredLocation[],
    );
  }

  private fullProfile(profile: Profile) {
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      budgetMin: profile.budgetMin,
      budgetMax: profile.budgetMax,
      desiredAreas: profile.desiredAreas,
      desiredLocations: this.profileLocations(profile),
      sleepSchedule: profile.sleepSchedule,
      smokingPreference: profile.smokingPreference,
      petPreference: profile.petPreference,
      quietLevel: profile.quietLevel,
      visibility: profile.visibility,
      showBudget: profile.showBudget,
      showDesiredAreas: profile.showDesiredAreas,
      showLifestyle: profile.showLifestyle,
      onboardingCompleted: Boolean(profile.onboardingCompletedAt),
      updatedAt: profile.updatedAt,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PROFILE_NOT_FOUND',
      message: 'Không tìm thấy hồ sơ',
    });
  }
}
