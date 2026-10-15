import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AdminPageQuery } from '../../admin/dto/admin.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class SupportQuery extends AdminPageQuery {
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(150) search?: string;
}
export class CreateTicketDto {
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(150) subject!: string;
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(2000) body!: string;
  @IsOptional() @IsUUID() orderId?: string;
}
export class ReplyTicketDto {
  @IsInt() @Min(1) version!: number;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(2000) body!: string;
}
export class HandleTicketDto extends ReplyTicketDto {
  @IsIn(['IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'])
  status!: 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';
}

export class TicketStatusDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(['IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'])
  status!: 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';
}
