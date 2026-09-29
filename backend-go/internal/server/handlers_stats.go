package server

import (
	"net/http"
	"strconv"

	"github.com/1mpuser/tracker/backend-go/internal/dateutil"
)

// GET /stats/categories?days=
func (s *Server) handleStatsCategories(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	days := queryIntDefault(r, "days", 30)
	res, err := s.stats.CategoryStats(r.Context(), u, days)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// GET /stats/distraction?weeks=
func (s *Server) handleStatsDistraction(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	weeks := queryIntDefault(r, "weeks", 8)
	res, err := s.stats.DistractionWeeklyStats(r.Context(), u, weeks)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// GET /stats/distraction-daily?days=
func (s *Server) handleStatsDistractionDaily(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	days := queryIntDefault(r, "days", 30)
	res, err := s.stats.DistractionDailyStats(r.Context(), u, days)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// GET /stats/week?end=
func (s *Server) handleStatsWeek(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	end := r.URL.Query().Get("end")
	if end == "" {
		t, err := dateutil.TodayFor(u.Timezone)
		if err != nil {
			writeError(w, err)
			return
		}
		end = dateutil.FormatDate(t)
	}
	res, err := s.stats.WeekStats(r.Context(), u, end)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func queryIntDefault(r *http.Request, key string, def int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}
