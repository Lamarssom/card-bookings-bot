-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('YELLOW_CARD', 'RED_CARD');

-- CreateTable
CREATE TABLE "Fixture" (
    "id" SERIAL NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "leagueId" INTEGER,
    "leagueName" TEXT,
    "round" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" SERIAL NOT NULL,
    "fixtureId" INTEGER NOT NULL,
    "match" TEXT NOT NULL,
    "leagueId" INTEGER,
    "leagueName" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "homeTeam" TEXT,
    "awayTeam" TEXT,
    "team" TEXT NOT NULL,
    "player" TEXT NOT NULL,
    "cardType" "CardType" NOT NULL,
    "minute" INTEGER NOT NULL,
    "extraTime" INTEGER,
    "matchday" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_homeTeam_awayTeam_date_key" ON "Fixture"("homeTeam", "awayTeam", "date");

-- CreateIndex
CREATE INDEX "Card_leagueId_matchday_date_idx" ON "Card"("leagueId", "matchday", "date" DESC);

-- CreateIndex
CREATE INDEX "Card_team_leagueId_matchday_idx" ON "Card"("team", "leagueId", "matchday");

-- CreateIndex
CREATE INDEX "Card_homeTeam_leagueId_idx" ON "Card"("homeTeam", "leagueId");

-- CreateIndex
CREATE INDEX "Card_awayTeam_leagueId_idx" ON "Card"("awayTeam", "leagueId");

-- CreateIndex
CREATE INDEX "Card_date_idx" ON "Card"("date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Card_fixtureId_player_key" ON "Card"("fixtureId", "player");
