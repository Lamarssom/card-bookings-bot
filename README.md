# Card Bookings Bot

Telegram bot that tracks yellow and red cards (with exact minute + extra time) from the top 5 European leagues:

- Premier League
- La Liga
- Serie A
- Bundesliga
- Ligue 1

## Features

- /teamcards → interactive league → team → matchday range flow
- /refresh [month] → incremental historical data loading (respects free API rate limits)
- /debugcards → quick DB stats
- MongoDB upsert + compound index to avoid duplicates
- TypeScript + Telegraf v4
- Graceful error handling & UX messages

## Tech Stack

- Node.js + TypeScript
- Telegraf v4 (Telegram bot framework)
- MongoDB / Mongoose
- API-Football (data source)

## Current Status (Feb 2026)

- Core MVP functional
- Historical ingestion working (limited by free tier)
- Interactive team cards flow complete
- Needs: more data ingestion, cron/auto-refresh, AI extensions (aggression index, referee models)

## Setup

1. Clone repo
2. npm install
3. Create .env:

4. npm run dev

## Roadmap Highlights

- Live/current season support (paid API)
- /today, /match, /stats commands
- AI-powered booking probability & referee strictness
- Premium analytics + web dashboard

Built as a personal project to explore Telegram bots, TypeScript, MongoDB aggregation, and API rate-limit handling.