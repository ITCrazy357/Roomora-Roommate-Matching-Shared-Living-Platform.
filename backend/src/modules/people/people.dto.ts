import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PetPreference,
  QuietLevel,
  SleepSchedule,
  SmokingPreference,
  UserReportReason,
} from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class PeopleQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit = 12;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
  @IsOptional()
  @Matches(/^\d{2}$/)
  provinceCode?: string;
  @IsOptional()
  @Matches(/^\d{5}$/)
  wardCode?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  budgetMin?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  budgetMax?: number;
  @IsOptional()
  @IsEnum(SleepSchedule)
  sleepSchedule?: SleepSchedule;
  @IsOptional()
  @IsEnum(SmokingPreference)
  smokingPreference?: SmokingPreference;
  @IsOptional()
  @IsEnum(PetPreference)
  petPreference?: PetPreference;
  @IsOptional()
  @IsEnum(QuietLevel)
  quietLevel?: QuietLevel;
}
export class ConnectionQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit = 12;
  @IsIn(['received', 'sent', 'accepted', 'blocked'])
  tab: 'received' | 'sent' | 'accepted' | 'blocked' = 'received';
}
export class SendConnectionDto {
  @IsUUID()
  targetId: string;
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  message = '';
}
export class ConnectionVersionDto {
  @IsInt()
  @Min(1)
  version: number;
}
export class ReportUserDto {
  @IsEnum(UserReportReason)
  reason: UserReportReason;
  @Transform(trim)
  @IsString()
  @Length(10, 1000)
  details: string;
}
