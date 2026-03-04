import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';

const ROOT = process.cwd();

const INPUT_PAST_CSV = path.join(ROOT, 'src/data/fixtures/Epl-2025-2026.csv');
const INPUT_FIXTURES_CSV = path.join(ROOT, 'src/data/fixtures/epl-2025-GMTStandardTime.csv');
const OUTPUT_PATH = path.join(ROOT, 'src/data/fixtures/merged-Epl-2025-2026.csv');

// Use current time when script runs (WAT = UTC+1)
// You can adjust the offset if your server time zone is different
const CURRENT_DATETIME = new Date(Date.now() + 60 * 60 * 1000); // +1 hour rough WAT adjustment

const HEADER = [
  { id: 'Div', title: 'Div' },
  { id: 'Date', title: 'Date' },
  { id: 'Time', title: 'Time' },
  { id: 'HomeTeam', title: 'HomeTeam' },
  { id: 'AwayTeam', title: 'AwayTeam' },
  { id: 'FTHG', title: 'FTHG' },
  { id: 'FTAG', title: 'FTAG' },
  { id: 'FTR', title: 'FTR' },
  { id: 'HTHG', title: 'HTHG' },
  { id: 'HTAG', title: 'HTAG' },
  { id: 'HTR', title: 'HTR' },
  { id: 'Referee', title: 'Referee' },
  { id: 'HS', title: 'HS' },
  { id: 'AS', title: 'AS' },
  { id: 'HST', title: 'HST' },
  { id: 'AST', title: 'AST' },
  { id: 'HF', title: 'HF' },
  { id: 'AF', title: 'AF' },
  { id: 'HC', title: 'HC' },
  { id: 'AC', title: 'AC' },
  { id: 'HY', title: 'HY' },
  { id: 'AY', title: 'AY' },
  { id: 'HR', title: 'HR' },
  { id: 'AR', title: 'AR' },
];

const csvWriter = createObjectCsvWriter({
  path: OUTPUT_PATH,
  header: HEADER,
});

// Simple team name normalizer
const normalizeTeamName = (name: string): string => {
  if (!name) return '';
  let n = name.trim();

  // Common variations
  if (n === 'Man United' || n === 'Man Utd' || n === 'Manchester United') return 'Man United';
  if (n === 'Tottenham' || n === 'Spurs' || n === 'Tottenham Hotspur') return 'Tottenham';
  if (n.includes("Nott'm Forest") || n === 'Nottingham Forest') return "Nott'm Forest";
  if (n === 'Brighton' || n === 'Brighton & Hove Albion') return 'Brighton';
  if (n === 'Wolves' || n === 'Wolverhampton Wanderers') return 'Wolves';

  return n;
};

function parseFixtureDateTime(dateStr: string): Date | null {
  const [datePart, timePart] = dateStr.trim().split(/\s+/);
  if (!datePart || !timePart) return null;

  const [day, month, year] = datePart.split('/');
  const [hour, minute] = timePart.split(':');

  if (!year || !month || !day || !hour || !minute) return null;

  // WAT = UTC+1
  return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00+01:00`);
}

async function run() {
  console.log('Starting CSV merge...');
  console.log(`Using current time: ${CURRENT_DATETIME.toISOString()} (local)`);

  // 1. Read past matches
  const pastRows: any[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(INPUT_PAST_CSV)
      .pipe(csv())
      .on('data', (row) => pastRows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  // Fix missing Div for past matches
  pastRows.forEach(row => {
    if (!row.Div || row.Div.trim() === '') {
      row.Div = 'E0';
    }
  });

  console.log(`Loaded ${pastRows.length} past match rows`);

  // 2. Read & process future fixtures
  const futureRows: any[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(INPUT_FIXTURES_CSV)
      .pipe(csv())
      .on('data', (row) => {
        const fullDate = row.Date?.trim() || '';
        const dt = parseFixtureDateTime(fullDate);

        if (!dt) return;

        // Only future matches with no result
        if (dt > CURRENT_DATETIME && !row.Result?.trim()) {
          futureRows.push({
            Div: 'E0',
            Date: fullDate.slice(0, 10),
            Time: fullDate.slice(11) || '',
            HomeTeam: normalizeTeamName(row['Home Team'] || ''),
            AwayTeam: normalizeTeamName(row['Away Team'] || ''),
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Found ${futureRows.length} future fixtures`);

  // 3. Combine and normalize
  const merged = [
    ...pastRows.map(row => ({
      ...HEADER.reduce((acc, col) => ({
        ...acc,
        [col.id]: row[col.id] || '',
      }), {} as any),
      HomeTeam: normalizeTeamName(row.HomeTeam || row['Home Team'] || ''),
      AwayTeam: normalizeTeamName(row.AwayTeam || row['Away Team'] || ''),
    })),
    ...futureRows.map(f => ({
      ...HEADER.reduce((acc, col) => ({
        ...acc,
        [col.id]: f[col.id] || '',
      }), {} as any),
    })),
  ];

  // 4. Sort by date then time
  merged.sort((a, b) => {
    const parseDate = (d: string) => {
      if (!d) return new Date(0);
      const [dd, mm, yyyy] = d.split('/').map(Number);
      return new Date(yyyy, mm - 1, dd);
    };

    const dateA = parseDate(a.Date);
    const dateB = parseDate(b.Date);

    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;

    const timeA = a.Time || '00:00';
    const timeB = b.Time || '00:00';
    return timeA.localeCompare(timeB);
  });

  // 5. Write merged file
  await csvWriter.writeRecords(merged);
  console.log(`Done! Merged file written to:\n${OUTPUT_PATH}`);
  console.log(`Total rows: ${merged.length}`);
}

run().catch(err => {
  console.error('Merge failed:', err);
  process.exit(1);
});