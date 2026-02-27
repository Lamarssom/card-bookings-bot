import 'dotenv/config';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { prisma } from '../db'; // Adjust path if needed
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

  // Clear existing Premier League fixtures (equivalent to deleteMany)
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

    // Read CSV (same as before)
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: any) => {
          const dateTimeStrTrim = (row.Date || row['Date/Time'] || '').trim();

          if (!row['Home Team'] || !row['Away Team'] || !dateTimeStrTrim) {
            totalSkipped++;
            return;
          }

          const parsedLocal = parse(dateTimeStrTrim, 'dd/MM/yyyy HH:mm', new Date());
          if (isNaN(parsedLocal.getTime())) {
            console.warn(`Parse failed: "${dateTimeStrTrim}"`);
            totalSkipped++;
            return;
          }

          const parsedUTC = toZonedTime(parsedLocal, 'UTC');

          results.push({
            homeTeam: normalizeTeamName(row['Home Team']),
            awayTeam: normalizeTeamName(row['Away Team']),
            date: parsedUTC,
            leagueName: 'Premier League', // Adjusted from 'league' to match schema
            round: row['Round Number'] || row.Round || '',
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Bulk upsert in smaller batches without one giant transaction
    if (results.length > 0) {
      const BATCH_SIZE = 100; // Tune: 50–200; larger = fewer roundtrips, but riskier if one fails
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
            return true; // success
          } catch (err) {
            console.error(`Upsert failed for ${fix.homeTeam} vs ${fix.awayTeam} on ${fix.date}:`, err);
            return false;
          }
        });

        // Wait for batch to complete (parallel within batch)
        const resultsBatch = await Promise.allSettled(batchPromises);
        const successful = resultsBatch.filter(r => r.status === 'fulfilled' && r.value).length;
        upsertedCount += successful;

        // Optional: small delay if you're hitting connection limits
        // await new Promise(r => setTimeout(r, 200));
      }

      totalImported += upsertedCount;
      console.log(`Bulk upsert: upserted ≈ ${upsertedCount} (some may have been matches/updates)`);

    }

    console.log(`Processed ${file}: ${results.length} parsed, total imported so far: ${totalImported}`);
  }

  console.log(`\n=== FINAL SUMMARY ===\nTotal fixtures imported: ${totalImported}\nTotal rows skipped: ${totalSkipped}`);

  await prisma.$disconnect();
  console.log('Disconnected from PostgreSQL');
  process.exit(0);
}

importAllFixtures().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});