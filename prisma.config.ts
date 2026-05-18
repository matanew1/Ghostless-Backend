/**
 * @file Prisma CLI configuration (database URL, migrations path).
 * Connection URLs belong here in Prisma 7+ — not in schema.prisma.
 */
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
