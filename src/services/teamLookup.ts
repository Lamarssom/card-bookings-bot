import axios from 'axios';
import { Card } from '@prisma/client';
import { prisma } from '../db';
import { config } from '../config';

export interface TeamInfo {
  name: string;
  possibleNames: string[];
  leagueIds: number[];
}

export async function findTeamByName(partialName: string): Promise<TeamInfo | null> {
  const search = partialName.trim().toLowerCase();
  if (search.length < 3) return null;

  const cards = await prisma.card.findMany({
    where: {
      OR: [
        { team:     { contains: search, mode: 'insensitive' } },
        { homeTeam: { contains: search, mode: 'insensitive' } },
        { awayTeam: { contains: search, mode: 'insensitive' } },
      ],
    },
    select: {
      team: true,
      homeTeam: true,
      awayTeam: true,
      leagueId: true,
    },
    distinct: ['team', 'homeTeam', 'awayTeam'], // helps dedupe somewhat
    take: 50, // limit to avoid loading too many
  });

  // Build a map of team → { appearances, leagues }
  const teamMap = new Map<string, { count: number; leagues: Set<number>; names: Set<string> }>();

  for (const c of cards) {
    const candidates = [c.team, c.homeTeam, c.awayTeam].filter(Boolean) as string[];
    for (const name of candidates) {
      const norm = name.trim();
      if (!norm.toLowerCase().includes(search)) continue;

      if (!teamMap.has(norm)) {
        teamMap.set(norm, { count: 0, leagues: new Set(), names: new Set() });
      }
      const entry = teamMap.get(norm)!;
      entry.count++;
      if (c.leagueId) entry.leagues.add(c.leagueId);
      entry.names.add(norm);
    }
  }

  // Convert to array and sort by count desc
  const results = Array.from(teamMap.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      leagueIds: Array.from(data.leagues),
      possibleNames: Array.from(data.names),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (results.length === 0) return null;

  const best = results[0];
  return {
    name: best.name,
    possibleNames: best.possibleNames,
    leagueIds: best.leagueIds,
  };
}

export async function getTeamIdFromApi(teamName: string): Promise<number | null> {
  try {
    const search = teamName.trim().toLowerCase();
    const res = await axios.get('https://v3.football.api-sports.io/teams', {
      params: { search: search },
      headers: { 'x-apisports-key': config.apiKey },
      timeout: 8000,
    });

    const teams = res.data.response || [];
    if (teams.length === 0) return null;

    let match = teams.find((t: any) => t.team.name.toLowerCase() === search);
    if (match) return match.team.id;

    match = teams.find((t: any) => t.team.code?.toLowerCase() === search);
    if (match) return match.team.id;

    match = teams.find((t: any) => t.team.name.toLowerCase().includes(search));
    if (match) return match.team.id;

    console.warn(`No exact/partial match for "${teamName}", falling back to first result: ${teams[0].team.name} (ID ${teams[0].team.id})`);
    return teams[0].team.id;
  } catch (err: any) {
    console.error('Team search API error:', err.message || err);
    return null;
  }
}
