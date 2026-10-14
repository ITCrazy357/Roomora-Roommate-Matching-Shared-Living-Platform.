import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ListingInputDto } from '../../listings/dto/listing.dto.js';
import { ReportQueryDto } from '../../household/dto/household.dto.js';

export class AiSummaryDto extends ReportQueryDto {
  @IsOptional() @IsBoolean() regenerate?: boolean;
}
export class AiSummaryNotesDto extends ReportQueryDto {
  @IsString() @MaxLength(5000) notes!: string;
  @IsInt() @Min(0) version!: number;
}

export class AiDescriptionDto extends ListingInputDto {
  @IsIn(['FRIENDLY', 'CONCISE']) tone: 'FRIENDLY' | 'CONCISE' = 'CONCISE';
}
export class AiSearchDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  query!: string;
}
export class AiReceiptDto {
  @IsUUID() houseId!: string;
}
