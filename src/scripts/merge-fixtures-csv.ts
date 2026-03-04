import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';

const CURRENT_DATETIME = new Date('2026-03-04T07:29:00+01:00'); 

const ROOT = process.cwd();

const INPUT_PAST_CSV = path.join(ROOT, 'src/data/fixtures/Epl-2025-2026.csv');
const INPUT_FIXTURES_CSV = path.join(ROOT, 'src/data/fixtures/epl-2025-GMTStandardTime.csv');
const OUTPUT_PATH = path.join(ROOT, 'src/data/fixtures/merged-Epl-2025-2026.csv');

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

function parseFixtureDateTime(dateStr: string): Date | null {
  // "15/08/2025 20:00" → split
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

  // 1. Read past matches (Epl-2025-2026.csv)
  const pastRows: any[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(INPUT_PAST_CSV)
      .pipe(csv())
      .on('data', (row) => pastRows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Loaded ${pastRows.length} past match rows`);

  // 2. Read & process complete fixtures
  const futureRows: any[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(INPUT_FIXTURES_CSV)
      .pipe(csv())
      .on('data', (row) => {
        const fullDate = row.Date?.trim() || '';
        const dt = parseFixtureDateTime(fullDate);

        if (!dt) return;

        // Only future matches (and preferably no result yet)
        if (dt > CURRENT_DATETIME && !row.Result?.trim()) {
          futureRows.push({
            Div: 'E0',
            Date: fullDate.slice(0, 10),           // "15/08/2025"
            Time: fullDate.slice(11) || '',        // "20:00"
            HomeTeam: row['Home Team'] || '',
            AwayTeam: row['Away Team'] || '',
            // all other fields empty
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Found ${futureRows.length} future fixtures`);

  // 3. Combine and normalize to match header
  const merged = [
    ...pastRows.map(row => ({
      ...HEADER.reduce((acc, col) => ({ ...acc, [col.id]: row[col.id] || '' }), {} as any),
    })),
    ...futureRows.map(f => ({
      ...HEADER.reduce((acc, col) => ({ ...acc, [col.id]: f[col.id] || '' }), {} as any),
    })),
  ];

  // 4. Write
  await csvWriter.writeRecords(merged);
  console.log(`Done! Merged file written to:\n${OUTPUT_PATH}`);
}

run().catch(err => {
  console.error('Merge failed:', err);
  process.exit(1);
});