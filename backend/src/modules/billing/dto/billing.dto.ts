import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateServiceOrderDto {
  @IsUUID() clientId!: string;
  @IsUUID() listingId!: string;
}

export class ServiceOrderQueryDto {
  @IsIn(['all', 'boosts']) kind: 'all' | 'boosts' = 'all';
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 10;
}

export class RefundRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
