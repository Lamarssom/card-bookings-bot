import axios from 'axios';
import { Card } from '../db';
import { config } from '../config';

export async function saveCardsFromFixture(fixture: any, events: any[]) {
  const matchStr = `${fixture.teams.home.name} vs ${fixture.teams.away.name}`;
  const date = new Date(fixture.fixture.date);

  let savedCount = 0;

  for (const event of events) {
    if (event.type !== 'Card') continue;

    let matchday = 0;

    if (fixture.league.round) {
      const roundValue = fixture.league.round.toString().trim();
      const parts = roundValue.split(' - ');
      if (parts.length > 1) {
        matchday = parseInt(parts[1], 10) || 0;
      }
      else if (/^\d+$/.test(roundValue)) {
        matchday = parseInt(roundValue, 10);
      }
      else {
        const numMatch = roundValue.match(/\d+/);
        if (numMatch) {
          matchday = parseInt(numMatch[0], 10);
        }
      }
    }
    if (matchday === 0 && fixture.league.round) {
      console.warn(
        `Could not parse matchday from round: "${fixture.league.round}" ` +
        `(fixture ${fixture.fixture.id} - ${matchStr})`
      );
    }

    const cardData = {
      fixtureId: fixture.fixture.id,
      match: matchStr,
      leagueId: fixture.league.id,
      leagueName: fixture.league.name,
      date,
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      team: event.team.name,
      player: event.player.name,
      cardType: event.detail,
      minute: event.time.elapsed,
      extra: event.time.extra,
      matchday: matchday,
    };

    try {
      await Card.findOneAndUpdate(
        {
          fixtureId: cardData.fixtureId,
          player: cardData.player,
          minute: cardData.minute,
        },
        cardData,
        { upsert: true }
      );
      savedCount++;
    } catch (err: any) {
      // Only log real errors (not duplicates)
      if (err.code !== 11000) {
        console.error('Save error (not duplicate):', err.message || err);
      }
      // Duplicates are expected and harmless → no action needed
    }
  }

  return savedCount;
}

export async function fetchAndSaveRecentCards(
  season = 2024,
  fromDate?: string,  
  toDate?: string
) {
  let totalFetched = 0;
  let totalSaved = 0;

  for (const league of config.leagues) {
    console.log(`Fetching league: ${league.name} (ID ${league.id})`);

    try {
      let url = `https://v3.football.api-sports.io/fixtures?league=${league.id}&season=${season}&status=FT`;
      if (fromDate) url += `&from=${fromDate}`;
      if (toDate) url += `&to=${toDate}`;

      const fixturesRes = await axios.get(url, {
        headers: { 'x-apisports-key': config.apiKey },
        timeout: 180000, // 120 seconds
      });

      const fixtures = fixturesRes.data.response || [];
      totalFetched += fixtures.length;

      console.log(`Found ${fixtures.length} finished fixtures for ${league.name}`);

      for (const fixture of fixtures) {
        const fixtureId = fixture.fixture.id;
        const matchTitle = `${fixture.teams.home.name} vs ${fixture.teams.away.name} (${fixture.fixture.date.slice(0,10)})`;

        console.log(`Processing fixture ${fixtureId} - ${matchTitle}`);

        try {
          const eventsRes = await axios.get(
            `https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}&type=Card`,
            {
              headers: { 'x-apisports-key': config.apiKey },
              timeout: 180000,
            }
          );

          const events = eventsRes.data.response || [];
          const saved = await saveCardsFromFixture(fixture, events);
          totalSaved += saved;

          console.log(`→ Saved ${saved} cards for fixture ${fixtureId}`);
        } catch (err: any) {
          console.error(`Fixture ${fixtureId} failed:`, err.message || err);

          if (err.response?.status === 429 || err.code === 'ECONNABORTED') {
            console.log('Rate limit or timeout detected → sleeping 30s...');
            await new Promise(r => setTimeout(r, 30000));
          }
        }

      }
    } catch (err: any) {
      console.error(`League ${league.name} failed:`, err.message || err);
      if (err.response?.status === 429 || err.message?.includes('rate limit') || err.message?.includes('429')) {
        console.log('API rate limit hit (likely 100/day free tier) → sleeping 60s...');
        await new Promise(r => setTimeout(r, 60000));
      } else if (err.code === 'ECONNABORTED') {
        console.log('Request timeout → sleeping 30s...');
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }

  console.log(
    `Refresh complete!\n` +
    `Total fixtures fetched: ${totalFetched}\n` +
    `Total cards saved/updated: ${totalSaved}`
  );

  return { fetched: totalFetched, saved: totalSaved };
}

export async function getNextFixtureForTeam(teamId: number): Promise<any | null> {
  try {
    const res = await axios.get('https://v3.football.api-sports.io/fixtures', {
      params: {
        team: teamId,
        next: 1,
        timezone: 'UTC'
      },
      headers: { 'x-apisports-key': config.apiKey },
      timeout: 10000
    });

    const fixtures = res.data.response || [];
    return fixtures.length > 0 ? fixtures[0] : null;
  } catch (err: any) {
    console.error('Next fixture error:', err.message);
    if (err.response?.status === 429) {
      console.log('Rate limit - next fixture skipped');
    }
    return null;
  }
}
