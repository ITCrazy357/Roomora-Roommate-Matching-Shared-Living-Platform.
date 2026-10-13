import { Equals, IsBoolean } from 'class-validator';
import { OtpDto } from './auth.dto.js';

export class AccountClosureDto extends OtpDto {
  @IsBoolean() @Equals(true) confirmed!: boolean;
}
