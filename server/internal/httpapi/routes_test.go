package httpapi

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jenrimark/portfolio/server/internal/auth"
	"github.com/jenrimark/portfolio/server/internal/config"
	"github.com/jenrimark/portfolio/server/internal/store"
)

func testServer(t *testing.T) (*Server, *gin.Engine) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "portfolio.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	if err := st.EnsureAdmin("admin", "secret"); err != nil {
		t.Fatalf("ensure admin: %v", err)
	}
	cfg := config.Config{AdminUser: "admin", UploadsDir: t.TempDir(), JWTSecret: "test-secret", AllowedOrigins: []string{"http://localhost:3000"}}
	srv := New(cfg, st, auth.New(cfg.JWTSecret))
	t.Cleanup(func() { _ = st.Close() })
	return srv, srv.Router()
}

func TestPublicEndpointDoesNotExposeDraftBeforePublish(t *testing.T) {
	server, router := testServer(t)
	if err := server.store.SaveDraft(store.Content{
		"profile":  map[string]any{"name": "Jenrimark"},
		"projects": []any{map[string]any{"id": "draft", "slug": "draft", "title": "Draft", "status": "draft"}},
	}); err != nil {
		t.Fatalf("save draft: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/public/content", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("public endpoint status = %d", rec.Code)
	}
	if body := rec.Body.String(); body != "{}" && body != "{\"projects\":[]}" {
		t.Fatalf("draft leaked through public endpoint: %s", body)
	}
}

func TestCorsRejectsUnknownOrigin(t *testing.T) {
	_, router := testServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/api/public/content", nil)
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("Access-Control-Request-Method", "GET")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("unknown origin was reflected")
	}
}
