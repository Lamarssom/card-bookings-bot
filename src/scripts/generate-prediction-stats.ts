import { prisma } from '../db';
import fs from 'fs';

async function generateStats() {
  console.log('Computing referee, team aggression & derby stats...');

  const allFixtures = await prisma.fixture.findMany({
    where: { leagueName: 'Premier League' },
  });

  // 1. Referee Stats
  const refMap = new Map();
  allFixtures.forEach(f => {
    if (!f.referee) return;
    const key = f.referee.trim();
    if (!refMap.has(key)) refMap.set(key, { m: 0, y: 0, r: 0 });
    const d = refMap.get(key);
    d.m++;
    d.y += (f.homeYellowCards || 0) + (f.awayYellowCards || 0);
    d.r += (f.homeRedCards || 0) + (f.awayRedCards || 0);
  });

  for (const [ref, d] of refMap) {
    const avgY = d.y / d.m;
    const avgR = d.r / d.m;
    await prisma.refereeStats.upsert({
      where: { referee: ref },
      update: { matches: d.m, avgYellow: avgY, avgRed: avgR, avgTotalCards: avgY + avgR * 1.5 },
      create: { referee: ref, matches: d.m, avgYellow: avgY, avgRed: avgR, avgTotalCards: avgY + avgR * 1.5 }
    });
  }

  // 2. Team Aggression
  const teamMap = new Map();
  allFixtures.forEach(f => {
    ['home', 'away'].forEach(side => {
      const team = side === 'home' ? f.homeTeam : f.awayTeam;
      if (!teamMap.has(team)) teamMap.set(team, { y: 0, r: 0, m: 0 });
      const d = teamMap.get(team);
      d.m++;
      d.y += side === 'home' ? (f.homeYellowCards || 0) : (f.awayYellowCards || 0);
      d.r += side === 'home' ? (f.homeRedCards || 0) : (f.awayRedCards || 0);
    });
  });

  for (const [team, d] of teamMap) {
    const avgY = d.y / d.m;
    const avgR = d.r / d.m;
    const index = (avgY + avgR * 1.5) / 3.8; // 3.8 = current EPL average
    await prisma.teamAggression.upsert({
      where: { team },
      update: { yellowPerGame: avgY, redPerGame: avgR, aggressionIndex: index },
      create: { team, yellowPerGame: avgY, redPerGame: avgR, aggressionIndex: index }
    });
  }

  console.log('Stats generated successfully!');
}

generateStats();