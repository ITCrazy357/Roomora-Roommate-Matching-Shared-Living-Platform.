import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CostSharingChoice,
  CostSharingMode,
  ExpenseCategory,
} from '../../../generated/prisma/enums.js';

export class SharingQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month!: string;
}
export class SharingRuleQueryDto extends SharingQueryDto {
  @IsEnum(ExpenseCategory) category!: ExpenseCategory;
}
export class SharingSettingDto {
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(1) @Max(31) deadlineDay = 7;
}
export class SharingDefaultDto {
  @IsEnum(ExpenseCategory) category!: ExpenseCategory;
  @IsDateString({ strict: true }) deadlineAt!: string;
}
export class SharingReopenDto {
  @IsUUID() roundId!: string;
  @IsDateString({ strict: true }) deadlineAt!: string;
}
export class SharingVoteDto {
  @IsUUID() roundId!: string;
  @IsInt() @Min(0) version!: number;
  @IsEnum(CostSharingChoice) choice!: CostSharingChoice;
}
export class SharingShareDto {
  @IsUUID() participantId!: string;
  @IsInt() @Min(0) @Max(10000) basisPoints!: number;
}
export class SharingProposalDto {
  @IsUUID() roundId!: string;
  @IsEnum(CostSharingMode) mode!: CostSharingMode;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(3, 1000)
  @IsString()
  reason!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SharingShareDto)
  shares!: SharingShareDto[];
}
