import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';

const ROOT = process.cwd();
const NORMALIZATION = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/team-normalization.json'), 'utf8'));

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

const csvWriter = (outputPath: string) => createObjectCsvWriter({ path: outputPath, header: HEADER });

const normalizeTeam = (name: string): string => {
  if (!name) return '';
  let n = name.trim();
  // Apply map (flat lookup)
  return NORMALIZATION[n] || n;
};

function parseUTCDateTime(dateStr: string): { date: string; time: string } {
  const [datePart, timePart] = dateStr.trim().split(/\s+/);
  return { date: datePart || '', time: timePart || '' };
}

async function mergeLeague(leagueKey: string, historicalPath: string, futureUTCPath: string, outputName: string) {
  console.log(`\n=== Merging ${leagueKey} ===`);

  // 1. Read historical (has cards for past matches)
  const historical: any[] = [];
  await new Promise((res, rej) => fs.createReadStream(historicalPath).pipe(csv()).on('data', r => historical.push(r)).on('end', res).on('error', rej));

  // 2. Read future UTC fixtures
  const future: any[] = [];
  await new Promise((res, rej) => fs.createReadStream(futureUTCPath).pipe(csv()).on('data', row => {
    if (!row['Home Team'] || !row['Away Team']) return;
    const dt = parseUTCDateTime(row.Date);
    future.push({
      Div: leagueKey === 'EPL' ? 'E0' : leagueKey === 'Serie A' ? 'I1' : leagueKey === 'LaLiga' ? 'SP1' : leagueKey === 'Ligue 1' ? 'F1' : 'D1',
      Date: dt.date,
      Time: dt.time,
      HomeTeam: normalizeTeam(row['Home Team']),
      AwayTeam: normalizeTeam(row['Away Team']),
      FTHG: '',
      FTAG: '',
      FTR: '',
      HTHG: '',
      HTAG: '',
      HTR: '',
      Referee: '',
      HS: '', AS: '', HST: '', AST: '', HF: '', AF: '', HC: '', AC: '', HY: '', AY: '', HR: '', AR: ''
    });
  }).on('end', res).on('error', rej));

  // Use a Map to deduplicate by unique key: home-away-date
  const fixtureMap = new Map<string, any>();

  // Helper to create key
  const getKey = (row: any) => 
    `${normalizeTeam(row.HomeTeam || row['Home Team'])}|${normalizeTeam(row.AwayTeam || row['Away Team'])}|${row.Date.trim()}`;

  // First add historical (has stats → higher priority)
  historical.forEach(row => {
    const key = getKey(row);
    fixtureMap.set(key, {
      ...row,
      HomeTeam: normalizeTeam(row.HomeTeam || row['Home Team'] || ''),
      AwayTeam: normalizeTeam(row.AwayTeam || row['Away Team'] || ''),
      Div: row.Div || getDivFromLeague(leagueKey), 
    });
  });

  // Then add future only if not already present
  future.forEach(row => {
    const key = getKey(row);
    if (!fixtureMap.has(key)) {
      fixtureMap.set(key, row);
    }
  });

  const merged = Array.from(fixtureMap.values());


  // Sort by date/time
    merged.sort((a, b) => {
    const da = a.Date.split('/').reverse().join('');
    const db = b.Date.split('/').reverse().join('');
    if (da !== db) return da.localeCompare(db);
    return (a.Time || '00:00').localeCompare(b.Time || '00:00');
  });

  // Helper function
  function getDivFromLeague(key: string): string {
    if (key === 'EPL') return 'E0';
    if (key === 'Serie A') return 'I1';
    if (key === 'LaLiga') return 'SP1';
    if (key === 'Ligue 1') return 'F1';
    return 'D1';
  }

  await csvWriter(path.join(ROOT, `src/data/fixtures/${outputName}`)).writeRecords(merged);
  console.log(`✅ Done: ${merged.length} rows → ${outputName}`);
}

async function runAll() {
  await mergeLeague('Serie A', 'src/data/fixtures/Serie-A-2025-2026.csv', 'src/data/fixtures/serie-a-2025-UTC.csv', 'merged-SerieA-2025-2026.csv');
  await mergeLeague('LaLiga', 'src/data/fixtures/Laliga-2025-2026.csv', 'src/data/fixtures/la-liga-2025-UTC.csv', 'merged-LaLiga-2025-2026.csv');
  await mergeLeague('Ligue 1', 'src/data/fixtures/Ligue-1-2025-2026.csv', 'src/data/fixtures/ligue-1-2025-UTC.csv', 'merged-Ligue1-2025-2026.csv');
  await mergeLeague('Bundesliga', 'src/data/fixtures/Bundesliga-2025-2026.csv', 'src/data/fixtures/bundesliga-2025-UTC.csv', 'merged-Bundesliga-2025-2026.csv'); // add your UTC file
  // EPL already done
}

runAll();