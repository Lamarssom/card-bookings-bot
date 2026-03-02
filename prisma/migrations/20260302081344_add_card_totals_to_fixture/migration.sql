-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "awayRedCards" INTEGER DEFAULT 0,
ADD COLUMN     "awayYellowCards" INTEGER DEFAULT 0,
ADD COLUMN     "homeRedCards" INTEGER DEFAULT 0,
ADD COLUMN     "homeYellowCards" INTEGER DEFAULT 0;
