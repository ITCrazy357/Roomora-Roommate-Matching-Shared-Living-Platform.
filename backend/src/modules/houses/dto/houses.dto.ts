import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class HouseInfoDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address = '';

  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description = '';

  @Transform(trim)
  @IsString()
  @MaxLength(3000)
  rules = '';
}

export class InviteHouseDto {
  @IsUUID()
  userId: string;
}

export class TransferHouseDto {
  @IsUUID()
  userId: string;
}

export class HouseAnnouncementDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;

  @IsBoolean()
  pinned = false;
}
