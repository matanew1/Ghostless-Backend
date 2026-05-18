/**
 * @file Injectable Prisma client with Nest lifecycle hooks.
 * @module @ghostless/database
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Shared database access layer for all microservices.
 * Uses Prisma 7 driver adapter (PostgreSQL via `pg`).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  /** Open connection pool on module init. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Close connection pool on shutdown. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
