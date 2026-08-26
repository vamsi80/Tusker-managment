CREATE TABLE "gstin_lookup_usage" (
    "month" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gstin_lookup_usage_pkey" PRIMARY KEY ("month")
);
