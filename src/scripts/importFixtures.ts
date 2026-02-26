// scripts/importFixtures.ts
import 'dotenv/config';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { Fixture } from '../models/Fixture';
import mongoose from 'mongoose';
import { config } from '../config';
import { parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const teamNameMap = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/team-normalization.json'), 'utf-8'));

function normalizeTeamName(name: string): string {
  const trimmed = name.trim();
  return teamNameMap[trimmed] || trimmed;
}

async function importAllFixtures() {
  await mongoose.connect(config.mongoUri);
  console.log(`Connected to: ${mongoose.connection.db!.databaseName}`);

  await Fixture.deleteMany({ league: 'Premier League' });
  console.log('Cleared existing Premier League fixtures');

  const fixturesDir = path.join(__dirname, '../data/fixtures');
  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.csv'));

  let totalImported = 0;
  let totalSkipped = 0;

  for (const file of files) {
    console.log(`\nProcessing ${file}...`);
    const filePath = path.join(fixturesDir, file);

    const results: any[] = [];

    // Read CSV
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: any) => {
          // ... your existing parsing logic ...
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
            league: 'Premier League',
            round: row['Round Number'] || row.Round || '',
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Now bulk upsert all at once (faster + waits properly)
    if (results.length > 0) {
      const operations = results.map(fix => ({
        updateOne: {
          filter: { homeTeam: fix.homeTeam, awayTeam: fix.awayTeam, date: fix.date },
          update: { $set: fix },
          upsert: true
        }
      }));

      try {
        const bulkResult = await Fixture.bulkWrite(operations, { ordered: false });
        totalImported += bulkResult.matchedCount + bulkResult.upsertedCount;
        console.log(`Bulk upsert: matched ${bulkResult.matchedCount}, upserted ${bulkResult.upsertedCount}, modified ${bulkResult.modifiedCount}`);
      } catch (e: any) {
        console.error(`Bulk write error in ${file}:`, e.message);
      }
    }

    console.log(`Processed ${file}: ${results.length} parsed, total imported so far: ${totalImported}`);
  }

  console.log(`\n=== FINAL SUMMARY ===\nTotal fixtures imported: ${totalImported}\nTotal rows skipped: ${totalSkipped}`);

  // Disconnect ONLY after everything
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
  process.exit(0);
}

importAllFixtures().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
