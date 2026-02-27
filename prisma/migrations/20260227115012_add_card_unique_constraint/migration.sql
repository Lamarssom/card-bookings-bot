/*
  Warnings:

  - A unique constraint covering the columns `[fixtureId,player,minute]` on the table `Card` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Card_fixtureId_player_key";

-- CreateIndex
CREATE UNIQUE INDEX "Card_fixtureId_player_minute_key" ON "Card"("fixtureId", "player", "minute");
