-- CreateEnum
CREATE TYPE "TwoFactorMethod" AS ENUM ('EMAIL', 'TOTP');

-- CreateTable
CREATE TABLE "TwoFactorConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "TwoFactorMethod" NOT NULL DEFAULT 'EMAIL',
    "totpSecret" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "backupCodes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoFactorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "method" "TwoFactorMethod" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "verificationToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorConfig_userId_key" ON "TwoFactorConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorChallenge_token_key" ON "TwoFactorChallenge"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorChallenge_verificationToken_key" ON "TwoFactorChallenge"("verificationToken");

-- CreateIndex
CREATE INDEX "TwoFactorChallenge_token_idx" ON "TwoFactorChallenge"("token");

-- CreateIndex
CREATE INDEX "TwoFactorChallenge_userId_idx" ON "TwoFactorChallenge"("userId");

-- AddForeignKey
ALTER TABLE "TwoFactorConfig" ADD CONSTRAINT "TwoFactorConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorChallenge" ADD CONSTRAINT "TwoFactorChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
