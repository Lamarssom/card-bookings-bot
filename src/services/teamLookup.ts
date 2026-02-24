import axios from 'axios';
import { Card } from '../db';
import { config } from '../config';

export interface TeamInfo {
  name: string;
  possibleNames: string[];
  leagueIds: number[];
}

export async function findTeamByName(partialName: string): Promise<TeamInfo | null> {
  const search = partialName.trim().toLowerCase();

  if (search.length < 3) return null;

  // Aggregate from saved cards (teams that have bookings)
  const agg = await Card.aggregate([
    {
      $match: {
        $or: [
          { team:     { $regex: search, $options: 'i' } },
          { homeTeam: { $regex: search, $options: 'i' } },
          { awayTeam: { $regex: search, $options: 'i' } },
        ]
      }
    },
    {
      $group: {
        _id: '$team', // prefer the 'team' field (who received the card)
        names: { $addToSet: { $cond: [{ $ne: ['$team', null] }, '$team', { $cond: [{ $ne: ['$homeTeam', null] }, '$homeTeam', '$awayTeam'] }] } },
        leagueIds: { $addToSet: '$leagueId' }
      }
    },
    { $sort: { count: -1 } }, // most frequent first
    { $limit: 5 }
  ]);

  if (agg.length === 0) return null;

  // Pick the best match (most appearances or exact-ish)
  const best = agg[0];
  return {
    name: best._id || best.names[0],
    possibleNames: best.names,
    leagueIds: best.leagueIds
  };
}

export async function getTeamIdFromApi(teamName: string): Promise<number | null> {
  try {
    const res = await axios.get('https://v3.football.api-sports.io/teams', {
      params: { search: teamName },
      headers: { 'x-apisports-key': config.apiKey }
    });

    const teams = res.data.response || [];
    if (teams.length === 0) return null;

    // Prefer exact match or first good one
    const exact = teams.find((t: any) => t.team.name.toLowerCase() === teamName.toLowerCase());
    return exact ? exact.team.id : teams[0].team.id;
  } catch (err) {
    console.error('Team search API error:', err);
    return null;
  }
}

export async function getTeamIdFromName(teamName: string): Promise<number | null> {
  try {
    const res = await axios.get('https://v3.football.api-sports.io/teams', {
      params: { search: teamName },
      headers: { 'x-apisports-key': config.apiKey },
      timeout: 8000,
    });

    const teams = res.data.response || [];
    if (teams.length === 0) return null;

    // Prefer exact match
    const exact = teams.find((t: any) =>
      t.team.name.toLowerCase() === teamName.toLowerCase() ||
      t.team.code?.toLowerCase() === teamName.toLowerCase()
    );

    return exact ? exact.team.id : teams[0].team.id;
  } catch (err) {
    console.error('Team ID lookup failed:', err);
    return null;
  }
}