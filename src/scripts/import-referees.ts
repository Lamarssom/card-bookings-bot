import { prisma } from '../db';
import fs from 'fs';
import csv from 'csv-parser';

async function importReferees() {
  const filePath = 'src/data/fixtures/Epl-2025-2026.csv'; // adjust path if needed

  const updates: { id: number; referee: string }[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        if (row.Referee && row.Referee.trim()) {
          // You'll need to match by home/away/date or some unique key
          // Simplest: assume you have a way to find fixture ID, or skip and update manually
          // For now, log them — later we can match
          console.log(`Found: ${row.HomeTeam} vs ${row.AwayTeam} on ${row.Date} → Ref: ${row.Referee}`);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // If you have fixture IDs, do bulk update:
  // await prisma.$transaction(updates.map(u => prisma.fixture.update({ where: { id: u.id }, data: { referee: u.referee } })));
  console.log('Referee import complete — check logs and update DB manually if needed.');
}

importReferees();