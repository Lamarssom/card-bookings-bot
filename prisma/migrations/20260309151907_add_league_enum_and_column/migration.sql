/*
  Warnings:

  - A unique constraint covering the columns `[league,homeTeam,awayTeam,date]` on the table `Fixture` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `league` to the `Fixture` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "League" AS ENUM ('EPL', 'BUNDESLIGA', 'SERIE_A', 'LALIGA', 'LIGUE_1');

-- DropIndex
DROP INDEX "Fixture_homeTeam_awayTeam_date_key";

-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "div" TEXT,
ADD COLUMN     "league" "League" NOT NULL,
ADD COLUMN     "referee" TEXT;

-- CreateTable
CREATE TABLE "RefereeStats" (
    "id" SERIAL NOT NULL,
    "referee" TEXT NOT NULL,
    "matches" INTEGER NOT NULL,
    "avgYellow" DOUBLE PRECISION NOT NULL,
    "avgRed" DOUBLE PRECISION NOT NULL,
    "avgTotalCards" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RefereeStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamAggression" (
    "id" SERIAL NOT NULL,
    "team" TEXT NOT NULL,
    "yellowPerGame" DOUBLE PRECISION NOT NULL,
    "redPerGame" DOUBLE PRECISION NOT NULL,
    "aggressionIndex" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TeamAggression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DerbyIntensity" (
    "id" SERIAL NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "intensity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DerbyIntensity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefereeStats_referee_key" ON "RefereeStats"("referee");

-- CreateIndex
CREATE UNIQUE INDEX "TeamAggression_team_key" ON "TeamAggression"("team");

-- CreateIndex
CREATE UNIQUE INDEX "DerbyIntensity_homeTeam_awayTeam_key" ON "DerbyIntensity"("homeTeam", "awayTeam");

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_league_homeTeam_awayTeam_date_key" ON "Fixture"("league", "homeTeam", "awayTeam", "date");
