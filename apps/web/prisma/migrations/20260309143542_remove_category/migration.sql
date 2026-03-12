/*
  Warnings:

  - You are about to drop the column `category` on the `Point` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Point" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "insertionType" TEXT NOT NULL DEFAULT '',
    "minimumInsertions" INTEGER,
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "audienceClassification" TEXT NOT NULL DEFAULT '',
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "baseMediaUrl" TEXT NOT NULL DEFAULT '',
    "baseMediaType" TEXT NOT NULL DEFAULT 'image',
    "baseWidth" INTEGER NOT NULL DEFAULT 0,
    "baseHeight" INTEGER NOT NULL DEFAULT 0,
    "screenAspect" TEXT NOT NULL DEFAULT '16:9',
    "fitMode" TEXT NOT NULL DEFAULT 'cover',
    "screenSelection" TEXT NOT NULL DEFAULT '{}',
    "renderPreset" TEXT NOT NULL DEFAULT '{}',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Point" ("address", "audienceClassification", "baseHeight", "baseMediaType", "baseMediaUrl", "baseWidth", "city", "createdAt", "description", "fitMode", "id", "insertionType", "minimumInsertions", "name", "published", "renderPreset", "screenAspect", "screenSelection", "slug", "targetAudience", "thumbnailUrl", "type", "updatedAt") SELECT "address", "audienceClassification", "baseHeight", "baseMediaType", "baseMediaUrl", "baseWidth", "city", "createdAt", "description", "fitMode", "id", "insertionType", "minimumInsertions", "name", "published", "renderPreset", "screenAspect", "screenSelection", "slug", "targetAudience", "thumbnailUrl", "type", "updatedAt" FROM "Point";
DROP TABLE "Point";
ALTER TABLE "new_Point" RENAME TO "Point";
CREATE UNIQUE INDEX "Point_slug_key" ON "Point"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
