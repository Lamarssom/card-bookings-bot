// src/services/apiFootballFixtures.ts 
import axios from 'axios';
import { config } from '../config';

const BASE_URL = 'https://v3.football.api-sports.io';

export async function getTeamIdApiFootball(teamName: string): Promise<number | null> {
  try {
    const res = await axios.get(`${BASE_URL}/teams`, {
      params: { search: teamName },
      headers: { 'x-apisports-key': config.apiKey },
      timeout: 10000,
    });

    const teams = res.data.response || [];
    if (teams.length === 0) return null;

    // Take first result (usually most relevant)
    return teams[0].team.id;
  } catch (err: any) {
    console.error('Team search error (API-Football):', err.message);
    return null;
  }
}

export async function getNextFixtureApiFootball(teamId: number): Promise<any | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Look 60 days ahead (covers most cases; adjust if needed)
    const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`Fetching next fixture for team ${teamId} from ${today} to ${future}`);

    const res = await axios.get(`${BASE_URL}/fixtures`, {
      params: {
        team: teamId,
        from: today,
        to: future,
        timezone: 'UTC',
      },
      headers: { 'x-apisports-key': config.apiKey },
      timeout: 15000,
    });

    let fixtures = res.data.response || [];

    if (fixtures.length === 0) {
      console.log('No upcoming fixtures found');
      return null;
    }

    // Sort by date → soonest first
    fixtures.sort((a: any, b: any) =>
      new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
    );

    console.log(`Found ${fixtures.length} upcoming fixture(s) — picking soonest`);
    return fixtures[0];
  } catch (err: any) {
    console.error('Next fixture error (API-Football):', err.message);
    if (err.response?.status === 429) {
      console.log('Rate limit hit — wait before retrying');
    }
    return null;
  }
}