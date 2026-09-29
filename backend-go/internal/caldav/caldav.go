// Package caldav — минимальный CalDAV-клиент по мотивам tsdav, которым
// пользуется backend/src/icloud/caldav.client.ts. Покрывает ровно те операции,
// что нужны трекеру: найти principal и calendar-home-set, перечислить
// календари/списки, положить/удалить объект (VTODO/VEVENT) и загрузить объекты
// в окне времени (calendar-query REPORT). Работает поверх net/http + encoding/xml.
package caldav

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Credentials — учётные данные CalDAV (Apple ID + пароль приложения).
type Credentials struct {
	Username string
	Password string
}

// Calendar — найденный календарь/список (дисплей-имя + URL коллекции).
type Calendar struct {
	URL         string
	DisplayName string
}

// Object — календарный объект (URL + сырые ICS-данные).
type Object struct {
	URL  string
	Data string
}

// ErrLoginFailed — не удалось авторизоваться/найти principal.
var ErrLoginFailed = errors.New("caldav: login failed")

// ErrNoPrincipal — сервер не отдал current-user-principal.
var ErrNoPrincipal = errors.New("caldav: no current-user-principal")

// ErrNoCalendarHome — сервер не отдал calendar-home-set.
var ErrNoCalendarHome = errors.New("caldav: no calendar-home-set")

// ErrCalendarNotFound — календарь с таким именем не найден.
var ErrCalendarNotFound = errors.New("caldav: calendar not found")

const (
	xmlHeader = `<?xml version="1.0" encoding="utf-8"?>`
	timeout   = 15 * time.Second
)

// Client — CalDAV-клиент на одно соединение (одна сессия авторизации).
type Client struct {
	httpClient *http.Client
	baseURL    string
	creds      Credentials
	principal  string
	home       string
}

// New создаёт клиент (логин происходит лениво в Login/FindCalendars).
func New(baseURL string, creds Credentials, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: timeout}
	}
	return &Client{httpClient: httpClient, baseURL: strings.TrimRight(baseURL, "/"), creds: creds}
}

// Login авторизуется и находит principal + calendar-home-set.
func (c *Client) Login(ctx context.Context) error {
	if c.home != "" {
		return nil
	}
	principal, err := c.currentPrincipal(ctx)
	if err != nil {
		return err
	}
	home, err := c.calendarHome(ctx, principal)
	if err != nil {
		return err
	}
	c.principal = principal
	c.home = home
	return nil
}

// Discover — короткая проверка, что учётка живая (login прошёл и есть home).
func (c *Client) Discover(ctx context.Context) error {
	return c.Login(ctx)
}

func (c *Client) currentPrincipal(ctx context.Context) (string, error) {
	body := xmlHeader + `<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">` +
		`<d:prop><d:current-user-principal/><d:principal-URL/></d:prop></d:propfind>`
	res, err := c.request(ctx, "PROPFIND", c.baseURL, body, "0")
	if err != nil {
		return "", err
	}
	defer res.Close()
	ms, err := parseMultistatus(res)
	if err != nil {
		return "", err
	}
	for _, r := range ms.Responses {
		for _, ps := range r.Propstat {
			if ps.Prop.CurrentUserPrincipal != nil && ps.Prop.CurrentUserPrincipal.Href != "" {
				return absolute(c.baseURL, ps.Prop.CurrentUserPrincipal.Href), nil
			}
		}
	}
	return "", ErrNoPrincipal
}

func (c *Client) calendarHome(ctx context.Context, principal string) (string, error) {
	body := xmlHeader + `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` +
		`<d:prop><c:calendar-home-set/></d:prop></d:propfind>`
	res, err := c.request(ctx, "PROPFIND", principal, body, "0")
	if err != nil {
		return "", err
	}
	defer res.Close()
	ms, err := parseMultistatus(res)
	if err != nil {
		return "", err
	}
	for _, r := range ms.Responses {
		for _, ps := range r.Propstat {
			if ps.Prop.CalendarHomeSet != nil && ps.Prop.CalendarHomeSet.Href != "" {
				return absolute(c.baseURL, ps.Prop.CalendarHomeSet.Href), nil
			}
		}
	}
	return "", ErrNoCalendarHome
}

// FindCalendars перечисляет календари (Depth 1) на calendar-home-set.
func (c *Client) FindCalendars(ctx context.Context) ([]Calendar, error) {
	if err := c.Login(ctx); err != nil {
		return nil, err
	}
	body := xmlHeader + `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">` +
		`<d:prop><d:displayname/><cs:calendar-color/></d:prop></d:propfind>`
	res, err := c.request(ctx, "PROPFIND", c.home, body, "1")
	if err != nil {
		return nil, err
	}
	defer res.Close()
	ms, err := parseMultistatus(res)
	if err != nil {
		return nil, err
	}
	var out []Calendar
	for _, r := range ms.Responses {
		href := absolute(c.baseURL, r.Href)
		if href == c.home {
			continue
		}
		var name string
		for _, ps := range r.Propstat {
			if ps.Prop.DisplayName != nil {
				name = *ps.Prop.DisplayName
			}
		}
		if name == "" {
			continue
		}
		out = append(out, Calendar{URL: href, DisplayName: name})
	}
	return out, nil
}

// FindCalendar ищет календарь по дисплей-имени.
func (c *Client) FindCalendar(ctx context.Context, name string) (*Calendar, error) {
	calendars, err := c.FindCalendars(ctx)
	if err != nil {
		return nil, err
	}
	for i := range calendars {
		if calendars[i].DisplayName == name {
			return &calendars[i], nil
		}
	}
	return nil, ErrCalendarNotFound
}

// PutObject создаёт/перезаписывает объект (filename — что-то вроде uid.ics).
func (c *Client) PutObject(ctx context.Context, calendarURL, filename, ics string) error {
	url := join(calendarURL, filename)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader([]byte(ics)))
	if err != nil {
		return err
	}
	c.authorize(req)
	req.Header.Set("Content-Type", "text/calendar; charset=utf-8")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("caldav: put %s failed: %d", filename, resp.StatusCode)
}

// DeleteObject удаляет объект по имени.
func (c *Client) DeleteObject(ctx context.Context, calendarURL, filename string) error {
	url := join(calendarURL, filename)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return err
	}
	c.authorize(req)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("caldav: delete %s failed: %d", filename, resp.StatusCode)
}

// FetchObjects возвращает календарные объекты, пересекающиеся с окном [start,end].
func (c *Client) FetchObjects(ctx context.Context, calendarURL string, start, end time.Time) ([]Object, error) {
	startICS := start.UTC().Format("20060102T150405Z")
	endICS := end.UTC().Format("20060102T150405Z")
	body := xmlHeader + `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` +
		`<d:prop><d:getetag/><c:calendar-data/></d:prop>` +
		`<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">` +
		`<c:time-range start="` + startICS + `" end="` + endICS + `"/>` +
		`</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`
	req, err := http.NewRequestWithContext(ctx, "REPORT", calendarURL, bytes.NewReader([]byte(body)))
	if err != nil {
		return nil, err
	}
	c.authorize(req)
	req.Header.Set("Content-Type", "application/xml; charset=utf-8")
	req.Header.Set("Depth", "1")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("caldav: report failed: %d", resp.StatusCode)
	}
	return parseObjects(resp.Body, c.baseURL)
}

// request отправляет PROPFIND и возвращает тело (нужно закрыть через Close).
func (c *Client) request(ctx context.Context, method, url, body, depth string) (io.ReadCloser, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader([]byte(body)))
	if err != nil {
		return nil, err
	}
	c.authorize(req)
	req.Header.Set("Content-Type", "application/xml; charset=utf-8")
	req.Header.Set("Depth", depth)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("caldav: %s failed: %d", method, resp.StatusCode)
	}
	return resp.Body, nil
}

func (c *Client) authorize(req *http.Request) {
	req.SetBasicAuth(c.creds.Username, c.creds.Password)
}

// ===== XML =====

type multistatus struct {
	Responses []response `xml:"response"`
}

type response struct {
	Href     string     `xml:"href"`
	Propstat []propstat `xml:"propstat"`
}

type propstat struct {
	Prop   prop   `xml:"prop"`
	Status string `xml:"status"`
}

type prop struct {
	CurrentUserPrincipal *hrefElem `xml:"current-user-principal"`
	PrincipalURL         *hrefElem `xml:"principal-URL"`
	CalendarHomeSet      *hrefElem `xml:"calendar-home-set"`
	DisplayName          *string   `xml:"displayname"`
	CalendarData         *string   `xml:"calendar-data"`
	GetEtag              *string   `xml:"getetag"`
}

type hrefElem struct {
	Href string `xml:"href"`
}

func parseMultistatus(r io.Reader) (*multistatus, error) {
	dec := xml.NewDecoder(r)
	var ms multistatus
	if err := dec.Decode(&ms); err != nil {
		return nil, fmt.Errorf("caldav: parse multistatus: %w", err)
	}
	return &ms, nil
}

func parseObjects(r io.Reader, base string) ([]Object, error) {
	ms, err := parseMultistatus(r)
	if err != nil {
		return nil, err
	}
	var out []Object
	for _, resp := range ms.Responses {
		href := absolute(base, resp.Href)
		var data string
		for _, ps := range resp.Propstat {
			if ps.Prop.CalendarData != nil {
				data = *ps.Prop.CalendarData
			}
		}
		if data != "" {
			out = append(out, Object{URL: href, Data: data})
		}
	}
	return out, nil
}

// absolute превращает href-путь в абсолютный URL относительно base.
func absolute(base, href string) string {
	if href == "" {
		return base
	}
	if strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
		return href
	}
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(href, "/")
}

// join склеивает URL коллекции и имя файла.
func join(base, file string) string {
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(file, "/")
}
