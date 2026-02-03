import axios from 'axios';
import { Card } from '../db';
import { config } from '../config';

export async function saveCardsFromFixture(fixture: any, events: any[]) {
  const matchStr = `${fixture.teams.home.name} vs ${fixture.teams.away.name}`;
  const date = new Date(fixture.fixture.date);

  let savedCount = 0;

  for (const event of events) {
    if (event.type !== 'Card') continue;

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
      matchday: parseInt(fixture.league.round?.split(' - ')[1] || '0') || 0,
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
  fromDate?: string,   // e.g. "2024-08-01"
  toDate?: string      // e.g. "2024-10-31"
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
        timeout: 120000, // 120 seconds
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
              timeout: 120000,
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

        // Safe delay between fixture requests (8s → ~7–8 requests/min)
        await new Promise(r => setTimeout(r, 8000));
      }
    } catch (err: any) {
      console.error(`League ${league.name} failed:`, err.message || err);
    }
  }

  console.log(
    `Refresh complete!\n` +
    `Total fixtures fetched: ${totalFetched}\n` +
    `Total cards saved/updated: ${totalSaved}`
  );

  return { fetched: totalFetched, saved: totalSaved };
}