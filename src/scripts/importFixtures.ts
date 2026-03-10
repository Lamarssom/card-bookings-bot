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

// Map filename prefix → Prisma League enum value
const LEAGUE_FROM_FILENAME: Record<string, string> = {
  'merged-Epl': 'EPL',
  'merged-Bundesliga': 'BUNDESLIGA',
  'merged-SerieA': 'SERIE_A',
  'merged-LaLiga': 'LALIGA',
  'merged-Ligue1': 'LIGUE_1',
};

async function importAllFixtures() {
  await prisma.$connect();
  console.log('Connected to PostgreSQL');

  const fixturesDir = path.join(__dirname, '../data/fixtures');
  const files = fs.readdirSync(fixturesDir).filter(f => f.startsWith('merged-') && f.endsWith('.csv'));

  console.log('Fixtures directory:', fixturesDir);
  console.log('Detected CSV files:', files);
  if (files.length === 0) {
    console.warn('No merged-*.csv files found! Check path:', fixturesDir);
  }

  let totalImported = 0;
  let totalSkipped = 0;
  let totalWithCards = 0;

  for (const file of files) {
    console.log(`\nProcessing ${file}...`);

    // Detect league from filename
    const leaguePrefix = Object.keys(LEAGUE_FROM_FILENAME).find(prefix => file.includes(prefix));
    if (!leaguePrefix) {
      console.warn(`Skipping ${file} - no league mapping found`);
      continue;
    }
    const leagueEnum = LEAGUE_FROM_FILENAME[leaguePrefix];

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

          const datePart = (row.Date || '').trim();
          const timePart = (row.Time || '').trim();

          // Handle cases where time is accidentally glued to date
          let cleanDateTime = datePart;
          if (timePart) {
            // If date already ends with time-like string, don't add again
            if (!/\d{2}:\d{2}$/.test(datePart)) {
              cleanDateTime += ' ' + timePart;
            }
          } else if (datePart.includes(' ')) {
            // Already has space → use as is
            cleanDateTime = datePart;
          }

          // Try multiple possible formats
          let parsedLocal: Date | null = null;

          const possibleFormats = [
            'dd/MM/yyyy HH:mm',
            'dd/MM/yyyyHH:mm',     // no space
            'dd/MM/yyyy',
          ];

          for (const fmt of possibleFormats) {
            parsedLocal = parse(cleanDateTime, fmt, new Date());
            if (!isNaN(parsedLocal.getTime())) break;
          }

          if (!parsedLocal || isNaN(parsedLocal.getTime())) {
            console.warn(`Parse failed: "${cleanDateTime}" (original Date="${datePart}", Time="${timePart}") in ${file}`);
            totalSkipped++;
            return;
          }

          const parsedUTC = toZonedTime(parsedLocal, 'UTC');

          const homeY = parseInt(row.HY || '0', 10);
          const awayY = parseInt(row.AY || '0', 10);
          const homeR = parseInt(row.HR || '0', 10);
          const awayR = parseInt(row.AR || '0', 10);

          if (homeY || awayY || homeR || awayR) totalWithCards++;

          results.push({
            league: leagueEnum,
            div: row.Div || null,
            homeTeam: normalizeTeamName(row.HomeTeam),
            awayTeam: normalizeTeamName(row.AwayTeam),
            date: parsedUTC,
            referee: row.Referee?.trim() || null,
            homeYellowCards: homeY,
            awayYellowCards: awayY,
            homeRedCards: homeR,
            awayRedCards: awayR,
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (results.length === 0) continue;

    const BATCH_SIZE = 200;
    let upsertedCount = 0;

    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);
      console.log(`  Upserting batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} records)...`);

      const promises = batch.map(fix =>
        prisma.fixture.upsert({
          where: {
            league_homeTeam_awayTeam_date: {
              league: fix.league,
              homeTeam: fix.homeTeam,
              awayTeam: fix.awayTeam,
              date: fix.date,
            },
          },
          update: fix,
          create: fix,
        }).catch(err => {
          console.error(`Upsert failed for ${fix.homeTeam} vs ${fix.awayTeam}:`, err.message);
          return null;
        })
      );

      await Promise.all(promises);
      upsertedCount += batch.length; // optimistic count; adjust if needed
    }
    totalImported += upsertedCount;
    console.log(`→ ${upsertedCount} records processed for ${leagueEnum}`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total fixtures imported/updated: ${totalImported}`);
  console.log(`Total rows skipped: ${totalSkipped}`);
  console.log(`Fixtures with card data: ${totalWithCards}`);
  console.log('Done.');
  process.exit(0);
}

importAllFixtures().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});