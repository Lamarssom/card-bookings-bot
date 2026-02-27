// src/db.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set in .env');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  // Optional: log: ['query', 'info', 'warn', 'error'] for debugging
});

export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('PostgreSQL connected successfully via adapter! 📦');
  } catch (err) {
    console.error('PostgreSQL connection error:', err);
    process.exit(1);
  }
}