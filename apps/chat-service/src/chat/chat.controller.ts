/**
 * @file REST endpoints for match-scoped messages (send, list, mark read).
 * @module @ghostless/chat-service
 */

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '@ghostless/common';
import { ChatService } from './chat.service';
import { SendMessageDto } from '../dto/message.dto';

/** Message API under `/matches/:matchId/messages`. */
@ApiTags('chat')
@ApiBearerAuth()
@Controller('matches/:matchId/messages')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Persists a message and publishes domain events.
   *
   * @param matchId - Match conversation id
   * @param user - JWT payload of sender
   * @param dto - Message body
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  send(
    @Param('matchId') matchId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(matchId, user.sub, dto.content);
  }

  /**
   * Returns recent messages in ascending order.
   *
   * @param matchId - Match conversation id
   * @param user - JWT payload of reader
   * @param limit - Optional max rows (default 50)
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @Param('matchId') matchId: string,
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(matchId, user.sub, limit ? parseInt(limit, 10) : 50);
  }

  /**
   * Marks peer messages as read and emits read events.
   *
   * @param matchId - Match conversation id
   * @param user - JWT payload of reader
   */
  @Patch('read')
  @UseGuards(JwtAuthGuard)
  read(@Param('matchId') matchId: string, @CurrentUser() user: JwtPayload) {
    return this.chatService.markRead(matchId, user.sub);
  }
}
