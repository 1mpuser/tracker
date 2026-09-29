-- Нынешняя недельная норма означала «столько разных дней», поэтому она
-- переезжает в daysPerWeek. timesPerDay и RoutineLog.count берут дефолт 1:
-- до этой миграции больше одной отметки в день существовать не могло.
UPDATE "Routine" SET "daysPerWeek" = "weeklyGoal";
