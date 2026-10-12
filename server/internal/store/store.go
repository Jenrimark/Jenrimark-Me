package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/crypto/bcrypt"

	_ "modernc.org/sqlite"
)

var ErrUnauthorized = errors.New("unauthorized")

type Store struct {
	db *sql.DB
}

type Content map[string]any

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
		password = "admin123"
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
	if errors.Is(err, sql.ErrNoRows) || raw == "" {
		return s.GetDraft()
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
	return s.SaveDraft(content)
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
	// stable insertion order is enough for personal site; frontend also sorts.
	out["projects"] = filtered
	return out
}
