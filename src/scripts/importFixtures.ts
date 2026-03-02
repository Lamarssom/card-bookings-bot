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

  const fixturesDir = path.join(__dirname, '../data/fixtures');
  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.csv'));

  let totalImported = 0;
  let totalSkipped = 0;
  let totalWithCards = 0;

  for (const file of files) {
    console.log(`\nProcessing ${file}...`);
    const filePath = path.join(fixturesDir, file);

    const results: any[] = [];

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: any) => {
          const dateStr = (row.Date || '').trim();
          const timeStr = (row.Time || '').trim();

          if (!row.HomeTeam || !row.AwayTeam || !dateStr) {
            totalSkipped++;
            return;
          }

          // Build date-time string correctly with space if time exists
          let dateTimeStr = dateStr;
          if (timeStr) {
            dateTimeStr +=  ` ${timeStr}`;
          }

          const format = timeStr ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy';

          const parsedLocal = parse(dateTimeStr, format, new Date());
          if (isNaN(parsedLocal.getTime())) {
            console.warn(`Parse failed: "${dateTimeStr}" (format: ${format}) in ${file}`);
            totalSkipped++;
            return;
          }

          const parsedUTC = toZonedTime(parsedLocal, 'UTC');

          const homeY = parseInt(row.HY || '0', 10);
          const awayY = parseInt(row.AY || '0', 10);
          const homeR = parseInt(row.HR || '0', 10);
          const awayR = parseInt(row.AR || '0', 10);

          if (homeY > 0 || awayY > 0 || homeR > 0 || awayR > 0) {
            totalWithCards++;
          }

          results.push({
            homeTeam: normalizeTeamName(row.HomeTeam),
            awayTeam: normalizeTeamName(row.AwayTeam),
            date: parsedUTC,
            leagueName: 'Premier League',
            round: row.Round || row['Round Number'] || '',

            homeYellowCards: homeY,
            awayYellowCards: awayY,
            homeRedCards: homeR,
            awayRedCards: awayR,
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (results.length > 0) {
      const BATCH_SIZE = 100;
      let upsertedCount = 0;

      for (let i = 0; i < results.length; i += BATCH_SIZE) {
        const batch = results.slice(i, i + BATCH_SIZE);
        console.log(`  Upserting batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} records)...`);

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
            console.error(`Upsert failed for ${fix.homeTeam} vs ${fix.awayTeam} on ${fix.date.toISOString()}:`, err);
            return false;
          }
        });

        const settled = await Promise.allSettled(batchPromises);
        const successful = settled.filter(r => r.status === 'fulfilled' && r.value === true).length;
        upsertedCount += successful;
      }

      totalImported += upsertedCount;
      console.log(`Bulk upsert: upserted/updated ≈ ${upsertedCount} records`);
    }

    console.log(
      `Processed ${file}: ${results.length} parsed, ${totalSkipped} skipped this file, total imported so far: ${totalImported}`
    );
  }

  console.log(`\n=== FINAL SUMMARY ===`);
  console.log(`Total fixtures imported/updated: ${totalImported}`);
  console.log(`Total rows skipped across all files: ${totalSkipped}`);
  console.log(`Fixtures with card data detected: ${totalWithCards}`);
  console.log('Disconnected from PostgreSQL');
  process.exit(0);
}

importAllFixtures().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});