package config

import (
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	Port           string
	DataDir        string
	DBPath         string
	UploadsDir     string
	JWTSecret      string
	AdminUser      string
	AdminPass      string
	ContentJSON    string
	AllowedOrigins []string
	SecureCookie   bool
}

func Load() Config {
	dataDir := envOr("DATA_DIR", "data")
	origins := strings.FieldsFunc(envOr("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"), func(r rune) bool { return r == ',' || r == ' ' })
	return Config{
		Port:           envOr("PORT", "8080"),
		DataDir:        dataDir,
		DBPath:         filepath.Join(dataDir, "db", "portfolio.db"),
		UploadsDir:     filepath.Join(dataDir, "uploads"),
		JWTSecret:      envOr("JWT_SECRET", "dev-secret-change-me"),
		AdminUser:      envOr("ADMIN_USER", "admin"),
		AdminPass:      os.Getenv("ADMIN_PASSWORD"),
		ContentJSON:    envOr("CONTENT_JSON", ""),
		AllowedOrigins: origins,
		SecureCookie:   os.Getenv("SECURE_COOKIE") == "1" || strings.EqualFold(os.Getenv("SECURE_COOKIE"), "true"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
