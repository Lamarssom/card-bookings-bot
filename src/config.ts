export const config = {
  botToken: process.env.BOT_TOKEN!,
  apiKey: process.env.API_KEY || '',
  footballDataToken: process.env.FOOTBALL_DATA_TOKEN || '',
  leagues: [
    { id: 39, code: 'PL', name: 'Premier League' },
    { id: 140, code: 'PD', name: 'La Liga' },
    { id: 135, code: 'SA', name: 'Serie A' },
    { id: 78, code: 'BL1', name: 'Bundesliga' },
    { id: 61, code: 'FL1', name: 'Ligue 1' },
  ],
};