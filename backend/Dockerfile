FROM oven/bun:1-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bunx prisma generate
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
EXPOSE 3001
CMD sh -c "bunx prisma migrate deploy && bunx prisma db seed && bun dist/src/main.js"
