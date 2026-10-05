import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PageQuery {
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
export class MessageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after?: number;
}
export class SendMessageDto {
  @IsUUID() clientId!: string;
  @Transform(trim) @IsString() @Length(0, 2000) text = '';
}
export class TypingDto {
  @IsBoolean() typing!: boolean;
}
export class ReadMessagesDto {
  @IsInt() @Min(0) number!: number;
}
export class AppointmentDto {
  @IsOptional() @IsUUID() listingId?: string;
  @IsISO8601({ strict: true }) startsAt!: string;
  @Transform(trim) @IsString() @Length(3, 300) place!: string;
  @Transform(trim) @IsString() @Length(0, 1000) note = '';
}
export class ChangeAppointmentDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(['confirm', 'reschedule', 'cancel']) action!:
    'confirm' | 'reschedule' | 'cancel';
  @IsOptional() @IsISO8601({ strict: true }) startsAt?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(3, 300) place?: string;
  @IsOptional() @Transform(trim) @IsString() @Length(0, 1000) note?: string;
}
export class NotificationQuery extends PageQuery {
  @IsOptional() @IsIn(['all', 'unread']) tab: 'all' | 'unread' = 'all';
  @IsOptional() @IsIn(['CONNECTION', 'MESSAGE', 'APPOINTMENT']) type?:
    'CONNECTION' | 'MESSAGE' | 'APPOINTMENT';
}
export class AppointmentQuery extends PageQuery {
  @IsOptional() @IsIn(['all', 'upcoming', 'pending', 'past']) tab:
    'all' | 'upcoming' | 'pending' | 'past' = 'all';
}
