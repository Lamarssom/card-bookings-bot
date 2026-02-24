import axios from 'axios';

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json/3/';

export async function getTeamIdTheSportsDB(teamName: string): Promise<number | null> {
  try {
    const res = await axios.get(`${BASE_URL}searchteams.php`, {
      params: { t: teamName },
      timeout: 10000
    });

    const teams = res.data.teams || [];
    if (teams.length === 0) {
      console.log(`No team found for "${teamName}" on TheSportsDB`);
      return null;
    }

    const team = teams[0]; // first match is usually best
    console.log(`Found team ID ${team.idTeam} for "${team.strTeam}"`);
    return parseInt(team.idTeam);
  } catch (err: any) {
    console.error('TheSportsDB team search error:', err.message);
    return null;
  }
}

export async function getNextFixtureTheSportsDB(teamId: number): Promise<any | null> {
  try {
    const res = await axios.get(`${BASE_URL}eventsnext.php`, {
      params: { id: teamId },
      timeout: 10000
    });

    const events = res.data.events || [];
    if (events.length === 0) {
      console.log(`No upcoming events for team ${teamId} on TheSportsDB`);
      return null;
    }

    // Sort by date (soonest first)
    events.sort((a: any, b: any) => {
      const dateA = new Date(a.dateEvent + ' ' + a.strTime);
      const dateB = new Date(b.dateEvent + ' ' + b.strTime);
      return dateA.getTime() - dateB.getTime();
    });

    console.log(`Found ${events.length} upcoming event(s) for team ${teamId}`);
    return events[0]; // soonest upcoming
  } catch (err: any) {
    console.error('TheSportsDB upcoming events error:', err.message);
    return null;
  }
}