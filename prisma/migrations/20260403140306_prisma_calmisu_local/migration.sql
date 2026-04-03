-- CreateEnum
CREATE TYPE "Subscription" AS ENUM ('free', 'free-trial', 'pro', 'cancelled');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'admin', 'super_admin');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('email', 'google');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'email',
    "firstName" TEXT,
    "lastName" TEXT,
    "emailConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "subscription" "Subscription" NOT NULL DEFAULT 'free',
    "nextPaymentDate" TIMESTAMP(3),
    "trialEndsDate" TIMESTAMP(3),
    "productId" TEXT,
    "purchaseToken" TEXT,
    "role" "Role" NOT NULL DEFAULT 'user',
    "notification" BOOLEAN NOT NULL DEFAULT false,
    "analyticsConsent" BOOLEAN NOT NULL DEFAULT false,
    "pushToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_streaks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "rating" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_sessions" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- AddForeignKey
ALTER TABLE "weekly_streaks" ADD CONSTRAINT "weekly_streaks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_sessions" ADD CONSTRAINT "flow_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
