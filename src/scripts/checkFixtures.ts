// src/scripts/checkFixtures.ts
import { prisma } from '../db';

async function check() {
  await prisma.$connect();

  const total = await prisma.fixture.count();
  console.log(`Total fixtures: ${total}`);  // Should be ~2280

  const recent = await prisma.fixture.count({
    where: { date: { gt: new Date('2025-01-01') } },
  });
  console.log(`Fixtures after 2025: ${recent}`);

  const manUtd = await prisma.fixture.findMany({
    where: {
      OR: [
        { homeTeam: { contains: 'United', mode: 'insensitive' } },
        { awayTeam: { contains: 'United', mode: 'insensitive' } },
      ],
    },
    orderBy: { date: 'asc' },
    take: 5,
  });
  console.log('Sample Man Utd fixtures:', manUtd);

  await prisma.$disconnect();
}

check().catch(console.error);