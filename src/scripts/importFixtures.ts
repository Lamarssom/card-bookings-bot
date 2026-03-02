import 'dotenv/config';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { prisma } from '../db';
import { parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const teamNameMap = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/team-normalization.json'), 'utf-8'));

function normalizeTeamName(name: string): string {
  const trimmed = name.trim();
  return teamNameMap[trimmed] || trimmed;
}

async function importAllFixtures() {
  await prisma.$connect();
  console.log('Connected to PostgreSQL');

  // Clear existing Premier League fixtures (optional: comment out if you want to keep and just update cards)
  await prisma.fixture.deleteMany({ where: { leagueName: 'Premier League' } });
  console.log('Cleared existing Premier League fixtures');

  const fixturesDir = path.join(__dirname, '../data/fixtures');
  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.csv'));

  let totalImported = 0;
  let totalSkipped = 0;

  for (const file of files) {
    console.log(`\nProcessing ${file}...`);
    const filePath = path.join(fixturesDir, file);

    const results: any[] = [];

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: any) => {
          const dateStrTrim = (row.Date || '').trim();
          const timeStrTrim = (row.Time || '').trim();  // Optional time column

          if (!row.HomeTeam || !row.AwayTeam || !dateStrTrim) {
            totalSkipped++;
            return;
          }

          // Parse date: dd/mm/yyyy + optional HH:mm
          let dateTimeStr = dateStrTrim;
          if (timeStrTrim) {
            dateTimeStr += `${timeStrTrim}`;
          }
          const format = timeStrTrim ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy';

          const parsedLocal = parse(dateTimeStr, format, new Date());
          if (isNaN(parsedLocal.getTime())) {
            console.warn(`Parse failed: "${dateTimeStr}" in ${file}`);
            totalSkipped++;
            return;
          }

          const parsedUTC = toZonedTime(parsedLocal, 'UTC');

          results.push({
            homeTeam: normalizeTeamName(row.HomeTeam),
            awayTeam: normalizeTeamName(row.AwayTeam),
            date: parsedUTC,
            leagueName: 'Premier League',
            round: row.Round || '',  // If available; otherwise empty

            // New: card totals (parse as int, default 0 if missing)
            homeYellowCards: parseInt(row.HY || '0', 10),
            awayYellowCards: parseInt(row.AY || '0', 10),
            homeRedCards: parseInt(row.HR || '0', 10),
            awayRedCards: parseInt(row.AR || '0', 10),
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Bulk upsert in batches (same as before for efficiency)
    if (results.length > 0) {
      const BATCH_SIZE = 100;
      let upsertedCount = 0;

      for (let i = 0; i < results.length; i += BATCH_SIZE) {
        const batch = results.slice(i, i + BATCH_SIZE);
        console.log(`  Upserting batch ${i / BATCH_SIZE + 1} (${batch.length} records)...`);

        const batchPromises = batch.map(async (fix) => {
          try {
            await prisma.fixture.upsert({
              where: {
                homeTeam_awayTeam_date: {
                  homeTeam: fix.homeTeam,
                  awayTeam: fix.awayTeam,
                  date: fix.date,
                },
              },
              update: fix,
              create: fix,
            });
            return true;
          } catch (err) {
            console.error(`Upsert failed for ${fix.homeTeam} vs ${fix.awayTeam} on ${fix.date}:`, err);
            return false;
          }
        });

        const resultsBatch = await Promise.allSettled(batchPromises);
        const successful = resultsBatch.filter(r => r.status === 'fulfilled' && r.value).length;
        upsertedCount += successful;
      }

      totalImported += upsertedCount;
      console.log(`Bulk upsert: upserted ≈ ${upsertedCount} (includes updates for cards)`);
    }
    console.log(`Processed ${file}: ${results.length} parsed, total imported so far: ${totalImported}`);
  }

  console.log(`\n=== FINAL SUMMARY ===\nTotal fixtures imported/updated: ${totalImported}\nTotal rows skipped: ${totalSkipped}`);

  await prisma.$disconnect();
  console.log('Disconnected from PostgreSQL');
  process.exit(0);
}

importAllFixtures().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});