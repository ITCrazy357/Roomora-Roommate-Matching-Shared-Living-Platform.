import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RefundVersionDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class RefundNoteDto extends RefundVersionDto {
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(1000) note!: string;
}
export class ReviewRefundDto extends RefundNoteDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
}
export class RefundRecipientDto extends RefundVersionDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{2,50}$/)
  bankId!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) bankName!: string;
  @Transform(trim) @IsString() @Matches(/^\d{4,50}$/) accountNumber!: string;
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  accountName!: string;
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  differentAccountReason = '';
}
export class VerifyRefundRecipientDto extends RefundNoteDto {
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  evidenceReference!: string;
  @IsBoolean() differentAccountApproved = false;
}
export class BeginRefundDto extends RefundNoteDto {
  @IsBoolean() @Equals(true) originalUnrefunded!: boolean;
}
export class FailRefundDto extends RefundNoteDto {
  @IsBoolean() @Equals(true) confirmedNoTransfer!: boolean;
}
export class CompleteRefundDto extends RefundNoteDto {
  @Type(() => Number) @IsInt() @Min(1) amount!: number;
  @Transform(trim)
  @IsString()
  @Matches(/^[a-zA-Z0-9_:.-]{6,128}$/)
  reference!: string;
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  transferredAt!: string;
  @IsUUID() proofId!: string;
  @IsBoolean() @Equals(true) originalUnrefunded!: boolean;
}
export class RefundQueryDto {
  @IsIn([
    'all',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
  ])
  status = 'PENDING';
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 10;
}
