import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ListingInputDto } from '../../listings/dto/listing.dto.js';

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
