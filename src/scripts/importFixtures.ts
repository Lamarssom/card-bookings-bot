// scripts/importFixtures.ts
import 'dotenv/config';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { Fixture } from '../models/Fixture';
import mongoose from 'mongoose';
import { config } from '../config';

const teamNameMap: Record<string, string> = {
  'Man Utd': 'Manchester United',
  'Man City': 'Manchester City',
  'Nott\'m Forest': 'Nottingham Forest',
  'Spurs': 'Tottenham Hotspur',
  'Leicester': 'Leicester City',
  'Wolves': 'Wolverhampton Wanderers',
};

function normalizeTeamName(name: string): string {
  return teamNameMap[name.trim()] || name.trim();
}

async function importAllFixtures() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected for import');

  await Fixture.deleteMany({ league: 'Premier League' });
  console.log('Cleared existing Premier League fixtures');

  const fixturesDir = path.join(__dirname, '../data/fixtures');
  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.csv'));

  let totalImported = 0;

  for (const file of files) {
    console.log(`Processing ${file}...`);
    const filePath = path.join(fixturesDir, file);

    const results: any[] = [];
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: any) => {
          const home = normalizeTeamName(
            row.HomeTeam || row['Home Team'] || ''
          );

          const away = normalizeTeamName(
            row.AwayTeam || row['Away Team'] || ''
          );

          const dateStr = row.Date || row['Date/Time'] || '';
          const timeStr = row.Time || '15:00';

          if (!home || !away || !dateStr) return;

          const fullDate = new Date(`${dateStr} ${timeStr}`);
          if (isNaN(fullDate.getTime())) return;

          results.push({
            homeTeam: home,
            awayTeam: away,
            date: fullDate,
            league: 'Premier League',
            round: row.Round || row['Round Number'] || '',
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
            } catch (e) {
              console.warn('Duplicate/skip:', e);
            }
          }
          totalImported += results.length;
          console.log(`Imported ${results.length} from ${file}`);
          resolve();
        })
        .on('error', reject);
    });
  }

  console.log(`\nTotal fixtures imported across all files: ${totalImported}`);
  mongoose.disconnect();
  process.exit(0);
}

importAllFixtures().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});