package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	Port        string
	DataDir     string
	DBPath      string
	UploadsDir  string
	JWTSecret   string
	AdminUser   string
	AdminPass   string
	ContentJSON string
}

func Load() Config {
	dataDir := envOr("DATA_DIR", "data")
	return Config{
		Port:        envOr("PORT", "8080"),
		DataDir:     dataDir,
		DBPath:      filepath.Join(dataDir, "db", "portfolio.db"),
		UploadsDir:  filepath.Join(dataDir, "uploads"),
		JWTSecret:   envOr("JWT_SECRET", "dev-secret-change-me"),
		AdminUser:   envOr("ADMIN_USER", "admin"),
		AdminPass:   os.Getenv("ADMIN_PASSWORD"),
		ContentJSON: envOr("CONTENT_JSON", ""),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
