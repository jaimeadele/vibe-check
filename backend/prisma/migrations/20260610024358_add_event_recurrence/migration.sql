-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "recurrenceDayOfWeek" INTEGER,
ADD COLUMN     "recurrenceDayPosition" INTEGER,
ADD COLUMN     "recurrenceFrequency" "RecurrenceFrequency";
