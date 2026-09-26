import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  PetPreference,
  ProfileVisibility,
  QuietLevel,
  SleepSchedule,
  SmokingPreference,
} from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateProfileDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  displayName?: string;

  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  avatarUrl?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  bio?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  budgetMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  budgetMax?: number | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  desiredAreas?: string[];

  @IsOptional()
  @IsEnum(SleepSchedule)
  sleepSchedule?: SleepSchedule | null;

  @IsOptional()
  @IsEnum(SmokingPreference)
  smokingPreference?: SmokingPreference | null;

  @IsOptional()
  @IsEnum(PetPreference)
  petPreference?: PetPreference | null;

  @IsOptional()
  @IsEnum(QuietLevel)
  quietLevel?: QuietLevel | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(ProfileVisibility)
  visibility?: ProfileVisibility;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  showBudget?: boolean;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  showDesiredAreas?: boolean;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  showLifestyle?: boolean;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  completeOnboarding?: boolean;
}
