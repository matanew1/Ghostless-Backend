/**
 * @file Validation DTO for sending a chat message.
 * @module @ghostless/chat-service
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** Body for `POST /matches/:matchId/messages`. */
export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  content!: string;
}
