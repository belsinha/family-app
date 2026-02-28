import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

if (!process.env.CHORES_DATABASE_URL) {
  process.env.CHORES_DATABASE_URL = config.choresDatabaseUrl;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
