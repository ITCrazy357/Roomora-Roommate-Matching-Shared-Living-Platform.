import { randomUUID } from 'node:crypto';
import { Transform, Type } from 'class-transformer';
import {
  Matches,
  IsDateString,
  IsUUID,
  Min,
  IsInt,
  Max,
  IsString,
  IsOptional,
  IsUrl,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  ValidateNested,
  IsEnum,
  Length,
  ValidateIf,
  IsIn,
} from 'class-validator';
import {
  ExpenseSplitMode,
  PaymentMethod,
} from '../../../generated/prisma/enums.js';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ExpenseSplitDto {
  // Keep accepting userId from the original API; participantId also supports guests.
  @ValidateIf(
    (split: ExpenseSplitDto) =>
      split.userId !== undefined || split.participantId === undefined,
  )
  @IsUUID()
  userId?: string;
  @ValidateIf((split: ExpenseSplitDto) => split.participantId !== undefined)
  @IsUUID()
  participantId?: string;
  @IsInt() @Min(0) @Max(2_000_000_000) amount!: number;
}
export class CreateExpenseDto {
  @Transform(trim) @IsString() @Length(1, 150) title!: string;
  @Transform(trim) @IsString() @Length(0, 2000) description = '';
  @IsUUID() payerId!: string;
  @Transform(trim) @IsString() @Length(1, 100) clientId: string = randomUUID();
  @IsInt() @Min(1) @Max(2_000_000_000) amount!: number;
  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Length(1, 2048)
  receiptUrl?: string;
  @IsEnum(ExpenseSplitMode) splitMode: ExpenseSplitMode =
    ExpenseSplitMode.CUSTOM;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  participantIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExpenseSplitDto)
  splits?: ExpenseSplitDto[];
}
export class ExpenseVersionDto {
  @IsInt() @Min(1) version!: number;
}
export class UploadReceiptDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class UpdateExpenseDto extends CreateExpenseDto {
  @IsInt() @Min(1) version!: number;
  @Transform(trim) @IsString() @Length(3, 1000) reason!: string;
}
export class CancelExpenseDto extends ExpenseVersionDto {
  @Transform(trim) @IsString() @Length(3, 1000) reason!: string;
}
export class ExpenseQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
export class CreateDebtPaymentDto {
  @IsOptional() @IsUUID() payerId?: string;
  @IsUUID() recipientId!: string;
  @Transform(trim) @IsString() @Length(1, 100) clientId!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  amount!: number;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @Transform(trim) @IsString() @Length(0, 1000) note = '';
}
export class PaymentActionDto extends ExpenseVersionDto {
  @IsIn(['confirm', 'reject', 'cancel']) action!:
    'confirm' | 'reject' | 'cancel';
}
export class GuestParticipantDto {
  @Transform(trim) @IsString() @Length(1, 120) displayName!: string;
}
export class RepaymentPromiseDto {
  @IsUUID() recipientId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  payOn!: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
