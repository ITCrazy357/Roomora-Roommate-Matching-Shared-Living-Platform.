import { Transform, Type } from 'class-transformer';
import {
  IsUUID,
  Min,
  IsInt,
  Max,
  IsString,
  MaxLength,
  IsOptional,
  IsUrl,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ExpenseSplitDto {
  @IsUUID()
  userId: string;

  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  amount!: number;
}

export class CreateExpenseDto {
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description = '';

  @IsUUID()
  payerId!: string;

  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  amount!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsUrl()
  @MaxLength(2048)
  receiptUrl?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExpenseSplitDto)
  splits!: ExpenseSplitDto[];
}

export class ExpenseQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
