# Card Bookings Bot

Telegram bot that predicts yellow/red card likelihood for upcoming Premier League matches based on historical H2H data.

Shows:
- Next fixture
- Avg yellow/red/total cards from past meetings
- Over/Under 4.5 cards call

## Features

- /predict <team> → shows next match + card prediction from DB
- Offline data: all fixtures & card stats loaded from CSVs
- PostgreSQL + Prisma ORM (replaced MongoDB)
- TypeScript + Telegraf v4
- Team name normalization for robust matching
- MarkdownV2 formatted replies

## Tech Stack

- Node.js + TypeScript
- Telegraf v4 (Telegram bot framework)
- PostgreSQL + Prisma (database & ORM)
- csv-parser + date-fns (data import)
- Local CSV files (no live API calls required)

## Current Status (March 2026)

- Fully offline MVP working
- Historical + current season data loaded (2020/21 – 2025/26)
- /predict command functional with real H2H stats
- No external API dependency for predictions

## Setup

1. Clone repo
2. npm install
3. Create .env:

DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/cardbookings?schema=public"
BOT_TOKEN=my_telegram_bot_token
Run database migrations:
npx prisma generate
npx prisma migrate dev
Import fixtures & card data:
npx ts-node src/scripts/importFixtures.ts
Start bot:
npm run dev

Data Sources
- Fixtures & card aggregates: https://www.football-data.co.uk/englandm.php (E0.csv per season)
- Merged current season data: src/data/fixtures/merged-Epl-2025-2026.csv

## Commands

- /predict Manchester United → next match + card stats
- /start, /help → basic info

## Roadmap

- Add more leagues (La Liga, Serie A, etc.)
- /today, /match <team1> vs <team2>
- Cron job for weekly CSV updates
- AI extensions (referee strictness, player aggression)

Built as a personal project to explore Telegram bots, Prisma, offline data pipelines, and football stats.