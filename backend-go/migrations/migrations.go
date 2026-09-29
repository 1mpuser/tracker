// Package migrations embeds SQL-миграции, скопированные как есть из
// backend/prisma/migrations/*/migration.sql (up). Накатывались Prisma-ой на
// существующие БД; golang-migrate применяет их к чистым базам (tracker_test).
package migrations

import "embed"

// FS — встроенная файловая система с *.up.sql для golang-migrate.
//
//go:embed *.sql
var FS embed.FS
