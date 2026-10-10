import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  ExpenseCategory,
  HouseActivityStatus,
} from '../../../generated/prisma/enums.js';
import {
  CreateExpenseDto,
  ExpenseVersionDto,
} from '../../expenses/dto/expenses.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ActivityDto {
  @IsUUID() clientId!: string;
  @Transform(trim) @IsString() @Length(1, 150) title!: string;
  @Transform(trim) @IsString() @Length(0, 2000) note = '';
  @Transform(trim) @IsString() @Length(0, 100) quantity = '';
  @IsOptional() @IsUUID() assigneeId?: string | null;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueOn?: string | null;
}
export class UpdateActivityDto extends ActivityDto {
  @IsInt() @Min(1) version!: number;
}
export class ActivityStatusDto extends ExpenseVersionDto {
  @IsEnum(HouseActivityStatus) status!: HouseActivityStatus;
}
export class ActivityQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsEnum(HouseActivityStatus) status?: HouseActivityStatus;
}
export class RecurringRuleDto {
  @IsUUID() clientId!: string;
  @Transform(trim) @IsString() @Length(1, 150) title!: string;
  @Transform(trim) @IsString() @Length(0, 2000) description = '';
  @IsEnum(ExpenseCategory) category: ExpenseCategory = ExpenseCategory.OTHER;
  // Null means a variable bill. Zero never becomes a ledger amount.
  @ValidateIf((dto: RecurringRuleDto) => dto.amount !== null)
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  amount!: number | null;
  @IsUUID() payerId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  participantIds!: string[];
  @IsInt() @Min(1) @Max(31) dayOfMonth!: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  firstOn!: string;
}
export class UpdateRecurringRuleDto extends RecurringRuleDto {
  @IsInt() @Min(1) version!: number;
}
export class RecurringEnabledDto extends ExpenseVersionDto {
  @IsBoolean() enabled!: boolean;
}
export class ConfirmRecurringDraftDto extends CreateExpenseDto {
  @IsInt() @Min(1) version!: number;
}
export class ReportQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month!: string;
}
