package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	_ "modernc.org/sqlite"
)

var ErrUnauthorized = errors.New("unauthorized")

type Store struct {
	db *sql.DB
}

type Content map[string]any

type MediaAsset struct {
	ID         int64  `json:"id"`
	Kind       string `json:"kind"`
	StorageKey string `json:"storageKey"`
	MIME       string `json:"mime"`
	Bytes      int64  `json:"bytes"`
	SHA256     string `json:"sha256"`
	CreatedAt  string `json:"createdAt"`
}

func Open(dbPath string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	schema := `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_docs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  draft_json TEXT NOT NULL,
  published_json TEXT,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime TEXT,
  bytes INTEGER,
  sha256 TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_metrics (
  metric_date TEXT PRIMARY KEY,
  page_views INTEGER NOT NULL DEFAULT 0,
  project_open_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS project_daily_metrics (
  metric_date TEXT NOT NULL,
  project_logical_id TEXT NOT NULL,
  open_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (metric_date, project_logical_id)
);
`
	_, err := s.db.Exec(schema)
	return err
}

func (s *Store) EnsureAdmin(username, password string) error {
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	if password == "" {
		return errors.New("ADMIN_PASSWORD is required before creating the first admin")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO users(username, password_hash, role, created_at) VALUES(?,?,?,?)`,
		username, string(hash), "admin", time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

func (s *Store) VerifyPassword(username, password string) error {
	var hash string
	err := s.db.QueryRow(`SELECT password_hash FROM users WHERE username=?`, username).Scan(&hash)
	if err != nil {
		return ErrUnauthorized
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return ErrUnauthorized
	}
	return nil
}

func (s *Store) SaveDraft(content Content) error {
	raw, err := json.Marshal(content)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(
		`INSERT INTO content_docs(id, draft_json, updated_at) VALUES(1, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET draft_json=excluded.draft_json, updated_at=excluded.updated_at`,
		string(raw), now,
	)
	return err
}

func (s *Store) GetDraft() (Content, error) {
	var raw string
	err := s.db.QueryRow(`SELECT draft_json FROM content_docs WHERE id=1`).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return Content{}, nil
	}
	if err != nil {
		return nil, err
	}
	var c Content
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Store) Publish() (Content, error) {
	draft, err := s.GetDraft()
	if err != nil {
		return nil, err
	}
	if err := s.validateDraft(draft); err != nil {
		return nil, err
	}
	pub := publicContent(draft)
	raw, err := json.Marshal(pub)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(
		`INSERT INTO content_docs(id, draft_json, published_json, updated_at, published_at) VALUES(1,?,?,?,?)
		 ON CONFLICT(id) DO UPDATE SET published_json=excluded.published_json, updated_at=excluded.updated_at, published_at=excluded.published_at`,
		mustJSON(draft), string(raw), now, now,
	)
	if err != nil {
		return nil, err
	}
	return pub, nil
}

func (s *Store) GetPublished() (Content, error) {
	var raw string
	err := s.db.QueryRow(`SELECT published_json FROM content_docs WHERE id=1`).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) || strings.TrimSpace(raw) == "" {
		return Content{}, nil
	}
	if err != nil {
		return nil, err
	}
	var c Content
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Store) ImportContent(content Content) error {
	if err := validateContent(content); err != nil {
		return err
	}
	return s.SaveDraft(content)
}

func (s *Store) validateDraft(content Content) error {
	if err := validateContent(content); err != nil {
		return err
	}
	projects, _ := content["projects"].([]any)
	projectStatus := map[string]string{}
	for _, raw := range projects {
		project, _ := raw.(map[string]any)
		projectStatus[fmt.Sprint(project["id"])] = fmt.Sprint(project["status"])
		if cover := fmt.Sprint(project["cover"]); strings.TrimSpace(cover) != "" && strings.Contains(cover, "media/") {
			if err := s.ensureMediaRef(cover); err != nil {
				return err
			}
		}
		if blocks, ok := project["blocks"].([]any); ok {
			for _, rawBlock := range blocks {
				block, ok := rawBlock.(map[string]any)
				if !ok {
					return errors.New("project block is invalid")
				}
				switch fmt.Sprint(block["type"]) {
				case "image", "video":
					if err := s.ensureMediaRef(fmt.Sprint(block["mediaId"])); err != nil {
						return err
					}
					if poster := fmt.Sprint(block["posterMediaId"]); poster != "" {
						if err := s.ensureMediaRef(poster); err != nil {
							return err
						}
					}
				case "gallery":
					ids, _ := block["mediaIds"].([]any)
					for _, id := range ids {
						if err := s.ensureMediaRef(fmt.Sprint(id)); err != nil {
							return err
						}
					}
				}
			}
		}
	}
	slots, ok := content["homeSlots"].(map[string]any)
	if !ok || len(slots) != 6 {
		return errors.New("homeSlots must contain six positions")
	}
	for _, key := range []string{"featured_1", "featured_2", "mini_1", "mini_2", "mini_3", "mini_4"} {
		id, exists := slots[key]
		if !exists || id == nil || projectStatus[fmt.Sprint(id)] != "published" {
			return fmt.Errorf("home slot %s must reference a published project", key)
		}
	}
	if slots, ok := content["homeSlots"].(map[string]any); ok {
		for key, rawID := range slots {
			id := fmt.Sprint(rawID)
			if projectStatus[id] != "published" {
				return fmt.Errorf("home slot %s references an unpublished project", key)
			}
		}
	}
	return nil
}

func (s *Store) ensureMediaRef(value string) error {
	value = normalizeMediaKey(value)
	if value == "" {
		return errors.New("media reference is required")
	}
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM media_assets WHERE storage_key=?`, value).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("media reference not found: %s", value)
	}
	return nil
}

func (s *Store) Log(action, target string) {
	_, _ = s.db.Exec(
		`INSERT INTO audit_logs(user_id, action, target, created_at) VALUES(1,?,?,?)`,
		action, target, time.Now().UTC().Format(time.RFC3339),
	)
}

func (s *Store) SaveMedia(kind, storageKey, mime string, bytes int, sha string) error {
	_, err := s.db.Exec(
		`INSERT INTO media_assets(kind, storage_key, mime, bytes, sha256, created_at) VALUES(?,?,?,?,?,?)`,
		kind, storageKey, mime, bytes, sha, time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

func (s *Store) ListMedia() ([]MediaAsset, error) {
	rows, err := s.db.Query(`SELECT id, kind, storage_key, COALESCE(mime,''), COALESCE(bytes,0), COALESCE(sha256,''), created_at FROM media_assets ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	assets := []MediaAsset{}
	for rows.Next() {
		var asset MediaAsset
		if err := rows.Scan(&asset.ID, &asset.Kind, &asset.StorageKey, &asset.MIME, &asset.Bytes, &asset.SHA256, &asset.CreatedAt); err != nil {
			return nil, err
		}
		assets = append(assets, asset)
	}
	return assets, rows.Err()
}

func (s *Store) DeleteMedia(storageKey string) error {
	normalizedKey := normalizeMediaKey(storageKey)
	var draft, published sql.NullString
	if err := s.db.QueryRow(`SELECT draft_json, published_json FROM content_docs WHERE id=1`).Scan(&draft, &published); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	for _, raw := range []string{draft.String, published.String} {
		if raw == "" {
			continue
		}
		var value any
		if err := json.Unmarshal([]byte(raw), &value); err != nil {
			return err
		}
		if containsString(value, normalizedKey) {
			return errors.New("media is still referenced by published or draft content")
		}
	}
	result, err := s.db.Exec(`DELETE FROM media_assets WHERE storage_key=?`, normalizedKey)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return errors.New("media not found")
	}
	return nil
}

func normalizeMediaKey(value string) string {
	value = strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	value = strings.TrimPrefix(value, "/")
	value = strings.TrimPrefix(value, "media/")
	return value
}

func containsString(value any, needle string) bool {
	switch item := value.(type) {
	case string:
		return normalizeMediaKey(item) == normalizeMediaKey(needle)
	case []any:
		for _, child := range item {
			if containsString(child, needle) {
				return true
			}
		}
	case map[string]any:
		for _, child := range item {
			if containsString(child, needle) {
				return true
			}
		}
	}
	return false
}

type MetricsSnapshot struct {
	Days           []MetricDay     `json:"days"`
	ProjectRanking []ProjectMetric `json:"projectRanking"`
}

type MetricDay struct {
	Date             string `json:"date"`
	PageViews        int    `json:"pageViews"`
	ProjectOpenCount int    `json:"projectOpenCount"`
}

type ProjectMetric struct {
	ProjectID string `json:"projectId"`
	OpenCount int    `json:"openCount"`
}

func (s *Store) RecordMetric(kind, projectID string) error {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		location = time.UTC
	}
	date := time.Now().In(location).Format("2006-01-02")
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`INSERT INTO daily_metrics(metric_date) VALUES(?) ON CONFLICT(metric_date) DO NOTHING`, date); err != nil {
		return err
	}
	switch kind {
	case "page_view":
		_, err = tx.Exec(`UPDATE daily_metrics SET page_views=page_views+1 WHERE metric_date=?`, date)
	case "project_open":
		if projectID == "" {
			return errors.New("projectId is required")
		}
		if _, err = tx.Exec(`UPDATE daily_metrics SET project_open_count=project_open_count+1 WHERE metric_date=?`, date); err != nil {
			return err
		}
		_, err = tx.Exec(`INSERT INTO project_daily_metrics(metric_date, project_logical_id, open_count) VALUES(?,?,1) ON CONFLICT(metric_date, project_logical_id) DO UPDATE SET open_count=open_count+1`, date, projectID)
	default:
		return errors.New("unsupported metric")
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) Metrics(days int) (MetricsSnapshot, error) {
	if days < 1 || days > 90 {
		days = 30
	}
	snapshot := MetricsSnapshot{Days: []MetricDay{}, ProjectRanking: []ProjectMetric{}}
	rows, err := s.db.Query(`SELECT metric_date, page_views, project_open_count FROM daily_metrics ORDER BY metric_date DESC LIMIT ?`, days)
	if err != nil {
		return snapshot, err
	}
	defer rows.Close()
	for rows.Next() {
		var item MetricDay
		if err := rows.Scan(&item.Date, &item.PageViews, &item.ProjectOpenCount); err != nil {
			return snapshot, err
		}
		snapshot.Days = append(snapshot.Days, item)
	}
	rows, err = s.db.Query(`SELECT project_logical_id, SUM(open_count) FROM project_daily_metrics GROUP BY project_logical_id ORDER BY SUM(open_count) DESC LIMIT 10`)
	if err != nil {
		return snapshot, err
	}
	defer rows.Close()
	for rows.Next() {
		var item ProjectMetric
		if err := rows.Scan(&item.ProjectID, &item.OpenCount); err != nil {
			return snapshot, err
		}
		snapshot.ProjectRanking = append(snapshot.ProjectRanking, item)
	}
	return snapshot, rows.Err()
}

func validateContent(content Content) error {
	profile, ok := content["profile"].(map[string]any)
	if !ok || strings.TrimSpace(fmt.Sprint(profile["name"])) == "" {
		return errors.New("profile.name is required")
	}
	projects, ok := content["projects"].([]any)
	if !ok || len(projects) > 100 {
		return errors.New("projects must be an array (max 100)")
	}
	slugs := map[string]struct{}{}
	ids := map[string]struct{}{}
	for _, raw := range projects {
		project, ok := raw.(map[string]any)
		if !ok {
			return errors.New("project must be an object")
		}
		slug := fmt.Sprint(project["slug"])
		if slug == "" || !validSlug(slug) {
			return errors.New("project slug must be unique and use lowercase letters/numbers")
		}
		if _, exists := slugs[slug]; exists {
			return errors.New("project slug must be unique and use lowercase letters/numbers")
		}
		slugs[slug] = struct{}{}
		id := fmt.Sprint(project["id"])
		if id != "" {
			ids[id] = struct{}{}
		}
		if strings.TrimSpace(fmt.Sprint(project["title"])) == "" {
			return errors.New("project title is required")
		}
		status := fmt.Sprint(project["status"])
		if status != "draft" && status != "published" {
			return errors.New("project status must be draft or published")
		}
	}
	if slots, ok := content["homeSlots"].(map[string]any); ok {
		if len(slots) != 6 {
			return errors.New("homeSlots must contain six positions")
		}
		for _, key := range []string{"featured_1", "featured_2", "mini_1", "mini_2", "mini_3", "mini_4"} {
			if raw, exists := slots[key]; !exists || raw == nil || strings.TrimSpace(fmt.Sprint(raw)) == "" {
				return fmt.Errorf("home slot %s must be assigned", key)
			}
		}
		used := map[string]struct{}{}
		for key, rawID := range slots {
			if rawID == nil {
				continue
			}
			id := fmt.Sprint(rawID)
			if _, exists := ids[id]; !exists {
				return fmt.Errorf("home slot %s references an unknown project", key)
			}
			if _, exists := used[id]; exists {
				return fmt.Errorf("project %s is assigned to multiple home slots", id)
			}
			used[id] = struct{}{}
		}
	}
	return nil
}

func validSlug(value string) bool {
	if value == "" {
		return false
	}
	for index, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || (char == '-' && index > 0 && index < len(value)-1) {
			continue
		}
		return false
	}
	return true
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// publicContent mirrors packages/content publicContent: keep only published projects, sort by sortOrder.
func publicContent(in Content) Content {
	out := Content{}
	for k, v := range in {
		out[k] = v
	}
	projects, _ := in["projects"].([]any)
	filtered := make([]any, 0, len(projects))
	for _, p := range projects {
		m, ok := p.(map[string]any)
		if !ok {
			continue
		}
		if fmt.Sprint(m["status"]) == "published" {
			filtered = append(filtered, m)
		}
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		left, _ := filtered[i].(map[string]any)
		right, _ := filtered[j].(map[string]any)
		return numeric(left["sortOrder"]) < numeric(right["sortOrder"])
	})
	out["projects"] = filtered
	if slots, ok := in["homeSlots"].(map[string]any); ok {
		publishedIDs := map[string]struct{}{}
		for _, raw := range filtered {
			if project, ok := raw.(map[string]any); ok {
				publishedIDs[fmt.Sprint(project["id"])] = struct{}{}
			}
		}
		cleanSlots := map[string]any{}
		for key, rawID := range slots {
			if _, exists := publishedIDs[fmt.Sprint(rawID)]; exists {
				cleanSlots[key] = rawID
			}
		}
		out["homeSlots"] = cleanSlots
	}
	return out
}

func numeric(value any) float64 {
	switch value := value.(type) {
	case float64:
		return value
	case float32:
		return float64(value)
	case int:
		return float64(value)
	default:
		return 0
	}
}
