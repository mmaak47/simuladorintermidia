-- CreateTable
CREATE TABLE "Point" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
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

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "pointId" TEXT,
    "pointName" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pointId" TEXT NOT NULL,
    "creativeType" TEXT NOT NULL,
    "creativeWidth" INTEGER NOT NULL,
    "creativeHeight" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Simulation_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "Point" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Point_slug_key" ON "Point"("slug");
