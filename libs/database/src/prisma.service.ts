/**
 * @file Injectable Prisma client with Nest lifecycle hooks.
 * @module @ghostless/database
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Shared database access layer for all microservices.
 * Uses a single PostgreSQL database in MVP (table ownership by convention).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /** Open connection pool on module init. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Close connection pool on shutdown. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
