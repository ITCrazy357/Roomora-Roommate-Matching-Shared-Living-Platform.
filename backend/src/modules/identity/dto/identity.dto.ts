import { Transform } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminPageQuery } from '../../admin/dto/admin.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DeclareIdentityDto {
  @IsInt() @Min(0) version!: number;
  @Transform(trim) @IsString() @Length(2, 100) fullName!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate!: string;
  @IsString() @Matches(/^\d{12}$/) documentNumber!: string;
  @IsString() @Matches(/^0\d{9}$/) phone!: string;
  @Transform(trim) @IsString() @Length(5, 300) contactAddress!: string;
  @Equals(true) confirmDemo!: boolean;
}

export class IdentityQuery extends AdminPageQuery {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status?:
    'PENDING' | 'APPROVED' | 'REJECTED';
}

export class IdentityAccessDto {
  @IsInt() @Min(1) version!: number;
  @Transform(trim) @IsString() @Length(5, 1000) reason!: string;
}

export class ReviewIdentityDto extends IdentityAccessDto {
  @IsIn(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
}
