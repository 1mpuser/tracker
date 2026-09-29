package dateutil

import (
	"testing"
	"time"
)

func TestParseDateParam(t *testing.T) {
	d, err := ParseDateParam("2026-07-15")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := d.UTC().Format(time.RFC3339); got != "2026-07-15T00:00:00Z" {
		t.Fatalf("got %s", got)
	}
}

func TestParseDateParamRejectsMalformed(t *testing.T) {
	for _, s := range []string{"15-07-2026", "2026/07/15", "20260715", ""} {
		if _, err := ParseDateParam(s); !IsInvalidDate(err) {
			t.Fatalf("expected invalid for %q, got %v", s, err)
		}
	}
}

func TestParseDateParamRejectsCalendarRollover(t *testing.T) {
	for _, s := range []string{"2026-02-30", "2026-04-31"} {
		if _, err := ParseDateParam(s); !IsInvalidDate(err) {
			t.Fatalf("expected invalid for %q, got %v", s, err)
		}
	}
}

func TestFormatDate(t *testing.T) {
	d := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	if got := FormatDate(d); got != "2026-07-15" {
		t.Fatalf("got %s", got)
	}
}

func TestAddDaysAcrossMonthBoundary(t *testing.T) {
	d := AddDays(time.Date(2026, 7, 31, 0, 0, 0, 0, time.UTC), 1)
	if got := FormatDate(d); got != "2026-08-01" {
		t.Fatalf("got %s", got)
	}
}

func TestMondayOf(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"2026-08-10", "2026-08-10"}, // понедельник
		{"2026-08-16", "2026-08-10"}, // воскресенье той же недели
		{"2026-08-12", "2026-08-10"}, // середина недели
		{"2026-09-02", "2026-08-31"}, // через границу месяца
	}
	for _, c := range cases {
		d, err := ParseDateParam(c.in)
		if err != nil {
			t.Fatalf("parse %s: %v", c.in, err)
		}
		if got := FormatDate(MondayOf(d)); got != c.want {
			t.Fatalf("MondayOf(%s) = %s, want %s", c.in, got, c.want)
		}
	}
}
