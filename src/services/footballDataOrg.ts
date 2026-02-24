import axios from 'axios';
import { config } from '../config'; // we'll add the token there next

const BASE_URL = 'https://api.football-data.org/v4';
const TOKEN = process.env.FOOTBALL_DATA_TOKEN || config.footballDataToken;

if (!TOKEN) {
  console.warn('FOOTBALL_DATA_TOKEN missing in .env');
}

const headers = {
  'X-Auth-Token': TOKEN,
  'Accept': 'application/json',
};

export async function getNextFixtureFootballData(teamNameOrId: string | number): Promise<any | null> {
  try {
    let teamId: number;

    if (typeof teamNameOrId === 'string') {
      // Search for team by name
      const searchRes = await axios.get(`${BASE_URL}/teams`, {
        params: { name: teamNameOrId },
        headers,
        timeout: 8000,
      });

      const teams = searchRes.data.teams || searchRes.data || [];
      if (teams.length === 0) return null;

      teamId = teams[0].id; // take first match (usually best)
    } else {
      teamId = teamNameOrId;
    }

    // Now get matches for this team (SCHEDULED = upcoming)
    const matchesRes = await axios.get(`${BASE_URL}/teams/${teamId}/matches`, {
      params: {
        status: 'SCHEDULED',
        limit: 1,           // only next one
      },
      headers,
      timeout: 8000,
    });

    const matches = matchesRes.data.matches || [];
    return matches.length > 0 ? matches[0] : null;
  } catch (err: any) {
    console.error('football-data.org next fixture error:', err.message);
    if (err.response?.status === 429) {
      console.log('football-data.org rate limit hit');
    }
    return null;
  }
}