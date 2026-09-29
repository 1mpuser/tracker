-- Пояс из регистрации доживает до подтверждения.
ALTER TABLE "PendingSignup" ADD COLUMN "timezone" TEXT;
