import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AdminPageQuery {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 15;
}

export class AdminSummaryQuery {
  @IsOptional()
  @IsString()
  @Matches(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/)
  month?: string;
}

export class AdminUsersQuery extends AdminPageQuery {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'LOCKED']) status?: 'ACTIVE' | 'LOCKED';
}

export class AdminReportsQuery extends AdminPageQuery {
  @IsIn(['OPEN', 'RESOLVED', 'DISMISSED']) status:
    'OPEN' | 'RESOLVED' | 'DISMISSED' = 'OPEN';
}

export class AdminVersionDto {
  @IsInt() @Min(1) version!: number;
}

export class AccountLockDto extends AdminVersionDto {
  @IsBoolean() locked!: boolean;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
}

export class HandleReportDto extends AdminVersionDto {
  @IsIn(['RESOLVED', 'DISMISSED']) status!: 'RESOLVED' | 'DISMISSED';
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) note!: string;
}

export class AnnouncementDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(120) title!: string;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) message!: string;
  @IsIn(['GENERAL', 'MAINTENANCE']) kind!: 'GENERAL' | 'MAINTENANCE';
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  displayFrom!: string;
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  displayUntil!: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  maintenanceFrom?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  maintenanceUntil?: string;
}

export class UpdateAnnouncementDto extends AnnouncementDto {
  @IsInt() @Min(1) version!: number;
}
