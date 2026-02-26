// scripts/importFixtures.ts
import 'dotenv/config';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { Fixture } from '../models/Fixture';
import mongoose from 'mongoose';
import { config } from '../config';

const teamNameMap = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/team-normalization.json'), 'utf-8'));

function normalizeTeamName(name: string): string {
  const trimmed = name.trim();
  return teamNameMap[trimmed] || trimmed;
}

async function importAllFixtures() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected for import');

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
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: any) => {
          const homeRaw = row['Home Team'] || row.HomeTeam || '';
          const awayRaw = row['Away Team'] || row.AwayTeam || '';
          const dateTimeStr = row.Date || row['Date/Time'] || '';

          console.log(`Raw row date: "${dateTimeStr}" | home: "${homeRaw}" | away: "${awayRaw}"`);

          if (!homeRaw || !awayRaw || !dateTimeStr) {
            totalSkipped++;
            console.log('Skipped: missing fields');
            return;
          }

          const [datePart, timePart = ''] = dateTimeStr.trim().split(/\s+/);
          console.log(`Split → datePart: "${datePart}" | timePart: "${timePart}"`);

          if (!datePart) {
            totalSkipped++;
            return;
          }

          const dateParts = datePart.split('/');
          if (dateParts.length !== 3) {
            console.warn(`Bad date format: ${datePart}`);
            totalSkipped++;
            return;
          }

          const [day, month, year] = dateParts.map(Number);
          const [hour = 0, min = 0] = timePart.split(':').map(Number);

          const fullDate = new Date(year, month - 1, day, hour, min);

          if (isNaN(fullDate.getTime())) {
            console.warn(`Invalid Date created from: year=${year}, month=${month}, day=${day}, hour=${hour}, min=${min} → ${fullDate}`);
            totalSkipped++;
            return;
          }

          console.log(`Parsed OK: ${fullDate.toISOString()}`);

          const home = normalizeTeamName(homeRaw);
          const away = normalizeTeamName(awayRaw);

          results.push({
            homeTeam: home,
            awayTeam: away,
            date: fullDate,
            league: 'Premier League',
            round: row['Round Number'] || row.Round || '',
          });
        })
        .on('end', async () => {
          for (const fix of results) {
            try {
              await Fixture.findOneAndUpdate(
                { homeTeam: fix.homeTeam, awayTeam: fix.awayTeam, date: fix.date },
                fix,
                { upsert: true }
              );
            } catch (e: any) {
              if (e.code !== 11000) console.warn('Save warning:', e.message);
            }
          }
          totalImported += results.length;
          console.log(`Imported ${results.length} fixtures from ${file} (skipped ${totalSkipped} invalid rows)`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`CSV parse error in ${file}:`, err);
          reject(err);
        });
    });
  }

  console.log(`\n=== FINAL SUMMARY ===\nTotal fixtures imported: ${totalImported}\nTotal rows skipped (invalid): ${totalSkipped}`);
  mongoose.disconnect();
  process.exit(0);
}

importAllFixtures().catch(err => {
  console.
  error('Import failed:', err);
  process.exit(1);
});
