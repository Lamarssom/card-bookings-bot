// src/scripts/import-referees.ts
import { prisma } from '../db';
import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';

async function importReferees() {

  const fixturesDir = path.join(process.cwd(), 'src/data/fixtures');

  // get all csv files
  const files = fs.readdirSync(fixturesDir).filter(file => file.endsWith('.csv'));

  console.log(`Found ${files.length} CSV files`);

  let totalUpdated = 0;

  for (const file of files) {

    const filePath = path.join(fixturesDir, file);

    console.log(`\nProcessing ${file}`);

    const updates: { homeTeam: string; awayTeam: string; date: string; referee: string }[] = [];

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {

          if (
            row.Referee &&
            row.Referee.trim() &&
            row.Date &&
            row.HomeTeam &&
            row.AwayTeam
          ) {

            updates.push({
              homeTeam: row.HomeTeam.trim(),
              awayTeam: row.AwayTeam.trim(),
              date: row.Date.trim().split(' ')[0],
              referee: row.Referee.trim(),
            });

          }

        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`Found ${updates.length} matches with referees`);

    for (const u of updates) {
      try {

        const dateISO = new Date(u.date.split('/').reverse().join('-'));

        const fixture = await prisma.fixture.findFirst({
          where: {
            homeTeam: { equals: u.homeTeam, mode: 'insensitive' },
            awayTeam: { equals: u.awayTeam, mode: 'insensitive' },
            date: {
              gte: new Date(dateISO.setHours(0,0,0)),
              lt: new Date(dateISO.setHours(23,59,59)),
            },
          },
        });

        if (fixture) {

          await prisma.fixture.update({
            where: { id: fixture.id },
            data: { referee: u.referee },
          });

          totalUpdated++;

          console.log(`Updated: ${u.homeTeam} vs ${u.awayTeam} → ${u.referee}`);
        }

      } catch (err) {
        console.error('Error updating fixture:', err);
      }
    }

  }

  console.log(`\nSuccessfully updated ${totalUpdated} fixtures with referees.`);
}

importReferees().catch(console.error);