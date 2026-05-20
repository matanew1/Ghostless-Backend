/**
 * @file Socket.IO gateway for realtime match rooms (join, typing, Redis fan-out).
 * @module @ghostless/chat-service
 */

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';

/**
 * WebSocket namespace `/chat` — authenticates via JWT handshake,
 * joins match rooms, and relays Redis pub/sub to connected clients.
 */
@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  /** Tracks per-socket Redis subscribers so they are cleaned up on disconnect. */
  private readonly socketSubs = new Map<string, Redis[]>();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verifies JWT from handshake auth or Authorization header; disconnects on failure.
   *
   * @param client - Connecting socket
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') ?? '');
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      client.data.userId = payload.sub;
      this.socketSubs.set(client.id, []);
    } catch {
      client.disconnect();
    }
  }

  /** Disconnects all Redis subscribers opened by this socket. */
  async handleDisconnect(client: Socket): Promise<void> {
    const subs = this.socketSubs.get(client.id) ?? [];
    await Promise.all(subs.map((s) => s.disconnect()));
    this.socketSubs.delete(client.id);
  }

  /**
   * Joins a match room and subscribes to Redis channel for live events.
   *
   * @param client - Authenticated socket
   * @param data - `{ matchId }` payload
   */
  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ): Promise<void> {
    await this.chatService.assertMatchParticipant(data.matchId, client.data.userId);
    await client.join(`match:${data.matchId}`);
    const sub = this.chatService.getRedis().duplicate();
    (this.socketSubs.get(client.id) ?? []).push(sub);
    await sub.subscribe(`match:${data.matchId}`);
    sub.on('message', (_ch, msg) => {
      client.emit('event', JSON.parse(msg) as unknown);
    });
  }

  /**
   * Broadcasts typing indicator to other participants in the match room.
   *
   * @param client - Authenticated socket
   * @param data - `{ matchId }` payload
   */
  @SubscribeMessage('typing')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ): void {
    client.to(`match:${data.matchId}`).emit('typing', { userId: client.data.userId });
  }
}
