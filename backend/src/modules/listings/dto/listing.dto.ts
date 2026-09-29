import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  Amenity,
  ListingStatus,
  ListingType,
  PetPreference,
  QuietLevel,
  SmokingPreference,
} from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Editable fields are saved together. Workflow fields are never accepted here.
export class ListingInputDto {
  @IsEnum(ListingType)
  type: ListingType = ListingType.ROOMMATE;
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  title = '';
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description = '';
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  rent: number | null = null;
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  deposit = 0;
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  electricityCost = 0;
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  waterCost = 0;
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  internetCost = 0;
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  otherCost = 0;
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  costNote = '';
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  area: number | null = null;
  @IsInt()
  @Min(1)
  @Max(20)
  availableSlots = 1;
  @IsInt()
  @Min(0)
  @Max(20)
  currentResidents = 0;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  availableFrom: string | null = null;
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/)
  provinceCode: string | null = null;
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/)
  wardCode: string | null = null;
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  privateAddress = '';
  @IsOptional()
  @IsNumber()
  @Min(8)
  @Max(24)
  latitude: number | null = null;
  @IsOptional()
  @IsNumber()
  @Min(102)
  @Max(110)
  longitude: number | null = null;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(8)
  @IsEnum(Amenity, { each: true })
  amenities: Amenity[] = [];
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  roommateNote = '';
  @IsOptional()
  @IsEnum(SmokingPreference)
  smokingPreference: SmokingPreference | null = null;
  @IsOptional()
  @IsEnum(PetPreference)
  petPreference: PetPreference | null = null;
  @IsOptional()
  @IsEnum(QuietLevel)
  quietLevel: QuietLevel | null = null;
}

export class UpdateListingDto extends ListingInputDto {
  @IsInt()
  @Min(1)
  version: number;
}

export class ListingVersionDto {
  @IsInt()
  @Min(1)
  version: number;
}

export class ListingFullDto extends ListingVersionDto {
  @IsBoolean()
  isFull: boolean;
}

export class ReviewListingDto extends ListingVersionDto {
  @IsEnum({ PUBLISHED: 'PUBLISHED', REJECTED: 'REJECTED' })
  decision: 'PUBLISHED' | 'REJECTED';
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ListingQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit = 9;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  search?: string;
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/)
  provinceCode?: string;
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/)
  wardCode?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  minRent?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  maxRent?: number;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(8)
  @IsEnum(Amenity, { each: true })
  amenities?: Amenity[];
  @IsEnum({
    newest: 'newest',
    price_asc: 'price_asc',
    price_desc: 'price_desc',
  })
  sort: 'newest' | 'price_asc' | 'price_desc' = 'newest';
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;
  @IsOptional()
  @IsEnum(ListingType)
  type?: ListingType;
}
