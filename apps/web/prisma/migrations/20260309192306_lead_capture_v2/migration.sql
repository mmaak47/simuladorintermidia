/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `pointId` on the `Lead` table. All the data in the column will be lost.
  - Added the required column `whatsapp` to the `Lead` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL,
    "pointName" TEXT NOT NULL DEFAULT '',
    "pointsSimulated" INTEGER NOT NULL DEFAULT 0,
    "creativeUploaded" BOOLEAN NOT NULL DEFAULT false,
    "videoRequest" BOOLEAN NOT NULL DEFAULT false,
    "imageExport" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "sessionId" TEXT NOT NULL DEFAULT '',
    "dateCreated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'new'
);
INSERT INTO "new_Lead" ("company", "id", "name", "pointName") SELECT "company", "id", "name", "pointName" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
