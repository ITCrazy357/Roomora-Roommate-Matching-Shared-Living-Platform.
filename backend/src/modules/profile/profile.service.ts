import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

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

    const desiredAreas = dto.desiredAreas
      ? [
          ...new Set(
            dto.desiredAreas.map((area) => area.trim()).filter(Boolean),
          ),
        ]
      : undefined;
    const { completeOnboarding, ...profileData } = dto;
    const profile = await this.prisma.profile.update({
      where: { userId },
      data: {
        ...profileData,
        desiredAreas,
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
      sleepSchedule: profile.showLifestyle ? profile.sleepSchedule : undefined,
      smokingPreference: profile.showLifestyle
        ? profile.smokingPreference
        : undefined,
      petPreference: profile.showLifestyle ? profile.petPreference : undefined,
      quietLevel: profile.showLifestyle ? profile.quietLevel : undefined,
    };
  }

  private fullProfile(profile: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    desiredAreas: string[];
    sleepSchedule: string | null;
    smokingPreference: string | null;
    petPreference: string | null;
    quietLevel: string | null;
    visibility: string;
    showBudget: boolean;
    showDesiredAreas: boolean;
    showLifestyle: boolean;
    onboardingCompletedAt: Date | null;
    updatedAt: Date;
  }) {
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      budgetMin: profile.budgetMin,
      budgetMax: profile.budgetMax,
      desiredAreas: profile.desiredAreas,
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
