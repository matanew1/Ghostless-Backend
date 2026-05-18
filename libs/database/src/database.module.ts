/**
 * @file Global Nest module exporting {@link PrismaService}.
 * @module @ghostless/database
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Registers Prisma as a global provider for all apps. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
