package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/jenrimark/portfolio/server/internal/auth"
	"github.com/jenrimark/portfolio/server/internal/config"
	"github.com/jenrimark/portfolio/server/internal/httpapi"
	"github.com/jenrimark/portfolio/server/internal/store"
)

func main() {
	importPath := flag.String("import", "", "path to content.json to import into draft")
	flag.Parse()

	cfg := config.Load()
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer st.Close()

	adminPass := cfg.AdminPass
	if adminPass == "" {
		adminPass = os.Getenv("ADMIN_PASSWORD")
	}
	if err := st.EnsureAdmin(cfg.AdminUser, adminPass); err != nil {
		log.Fatalf("ensure admin: %v", err)
	}

	if *importPath != "" {
		if err := importFile(st, *importPath); err != nil {
			log.Fatalf("import: %v", err)
		}
		log.Printf("imported content from %s", *importPath)
	}

	if cfg.ContentJSON == "" {
		cfg.ContentJSON = filepath.Join("data", "content.published.json")
	}

	srv := httpapi.New(cfg, st, auth.New(cfg.JWTSecret))
	host := os.Getenv("HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	addr := host + ":" + cfg.Port
	log.Printf("Jenrimark API listening on http://%s", addr)
	log.Printf("health: http://%s/healthz", addr)
	if err := http.ListenAndServe(addr, srv.Router()); err != nil {
		log.Fatal(err)
	}
}

func importFile(st *store.Store, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var content store.Content
	if err := json.Unmarshal(raw, &content); err != nil {
		return fmt.Errorf("parse content: %w", err)
	}
	return st.ImportContent(content)
}
