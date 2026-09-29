package caldav

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const testHome = "/calendars/"
const testPrincipal = "/principals/me/"

func fakeServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Basic ") {
			w.WriteHeader(401)
			return
		}
		switch {
		case r.Method == "PROPFIND" && r.URL.Path == "/":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(207)
			_, _ = w.Write([]byte(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>` + testPrincipal + `</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`))
		case r.Method == "PROPFIND" && r.URL.Path == testPrincipal:
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(207)
			_, _ = w.Write([]byte(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>` + testPrincipal + `</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>` + testHome + `</d:href></c:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`))
		case r.Method == "PROPFIND" && r.URL.Path == testHome:
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(207)
			_, _ = w.Write([]byte(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>` + testHome + `</d:href></d:response><d:response><d:href>` + testHome + `gtd/</d:href><d:propstat><d:prop><d:displayname>GTD</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response><d:response><d:href>` + testHome + `focus/</d:href><d:propstat><d:prop><d:displayname>Session: focus</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`))
		case r.Method == http.MethodPut:
			w.WriteHeader(201)
		case r.Method == http.MethodDelete:
			w.WriteHeader(204)
		case r.Method == "REPORT":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(207)
			_, _ = w.Write([]byte(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>` + testHome + `focus/ev1.ics</d:href><d:propstat><d:prop><c:calendar-data>BEGIN:VCALENDAR&#13;&#10;BEGIN:VEVENT&#13;&#10;DTSTART:20260814T140000&#13;&#10;DTEND:20260814T150000&#13;&#10;END:VEVENT&#13;&#10;END:VCALENDAR</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`))
		default:
			w.WriteHeader(404)
		}
	}))
}

func TestLoginAndFindCalendars(t *testing.T) {
	srv := fakeServer()
	defer srv.Close()
	c := New(srv.URL, Credentials{Username: "u", Password: "p"}, nil)
	calendars, err := c.FindCalendars(context.Background())
	if err != nil {
		t.Fatalf("findCalendars: %v", err)
	}
	if len(calendars) != 2 {
		t.Fatalf("len=%d calendars=%+v", len(calendars), calendars)
	}
	names := map[string]string{}
	for _, cal := range calendars {
		names[cal.DisplayName] = cal.URL
	}
	if names["GTD"] != srv.URL+testHome+"gtd/" {
		t.Fatalf("GTD url=%q", names["GTD"])
	}
}

func TestFindCalendarBySubstring(t *testing.T) {
	srv := fakeServer()
	defer srv.Close()
	c := New(srv.URL, Credentials{Username: "u", Password: "p"}, nil)
	cal, err := c.FindCalendar(context.Background(), "Session: focus")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if cal.DisplayName != "Session: focus" {
		t.Fatalf("cal=%+v", cal)
	}
	if _, err := c.FindCalendar(context.Background(), "NoSuch"); err == nil {
		t.Fatal("ожидался ErrCalendarNotFound")
	}
}

func TestPutDeleteObject(t *testing.T) {
	srv := fakeServer()
	defer srv.Close()
	c := New(srv.URL, Credentials{Username: "u", Password: "p"}, nil)
	if err := c.PutObject(context.Background(), srv.URL+testHome+"gtd/", "x.ics", "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"); err != nil {
		t.Fatalf("put: %v", err)
	}
	if err := c.DeleteObject(context.Background(), srv.URL+testHome+"gtd/", "x.ics"); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestFetchObjects(t *testing.T) {
	srv := fakeServer()
	defer srv.Close()
	c := New(srv.URL, Credentials{Username: "u", Password: "p"}, nil)
	objs, err := c.FetchObjects(context.Background(), srv.URL+testHome+"focus/", time.Now(), time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if len(objs) != 1 || !strings.Contains(objs[0].Data, "BEGIN:VEVENT") {
		t.Fatalf("objs=%+v", objs)
	}
}

func TestLoginFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
	}))
	defer srv.Close()
	c := New(srv.URL, Credentials{Username: "u", Password: "p"}, nil)
	if err := c.Login(context.Background()); err == nil {
		t.Fatal("ожидалась ошибка логина")
	}
}

func TestAbsoluteAndJoin(t *testing.T) {
	if absolute("https://x", "/a/b/") != "https://x/a/b/" {
		t.Fatalf("absolute=%q", absolute("https://x", "/a/b/"))
	}
	if join("https://x/cal/", "a.ics") != "https://x/cal/a.ics" {
		t.Fatalf("join=%q", join("https://x/cal/", "a.ics"))
	}
}
