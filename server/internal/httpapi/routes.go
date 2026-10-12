package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/jenrimark/portfolio/server/internal/auth"
	"github.com/jenrimark/portfolio/server/internal/config"
	"github.com/jenrimark/portfolio/server/internal/store"
)

type Server struct {
	cfg   config.Config
	store *store.Store
	auth  *auth.Manager
}

func New(cfg config.Config, st *store.Store, am *auth.Manager) *Server {
	return &Server{cfg: cfg, store: st, auth: am}
}

func (s *Server) Router() *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), s.cors())

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true, "service": "jenrimark-api"})
	})

	r.POST("/api/login", s.login)
	r.POST("/api/logout", s.logout)

	api := r.Group("/api", s.auth.Middleware())
	{
		api.GET("/content", s.getContent)
		api.PUT("/content", s.saveContent)
		api.POST("/publish", s.publish)
		api.POST("/upload", s.upload)
		api.POST("/import", s.importContent)
		api.GET("/export", s.exportContent)
	}

	r.GET("/api/public/content", s.publicContent)
	return r
}

func (s *Server) cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", c.GetHeader("Origin"))
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func (s *Server) login(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求"})
		return
	}
	user := body.Username
	if user == "" {
		user = s.cfg.AdminUser
	}
	if err := s.store.VerifyPassword(user, body.Password); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "密码不正确"})
		return
	}
	token, err := s.auth.Issue(user, 8*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "登录失败"})
		return
	}
	c.SetCookie("portfolio_token", token, int((8 * time.Hour).Seconds()), "/", "", false, true)
	s.store.Log("login", user)
	c.JSON(http.StatusOK, gin.H{"ok": true, "token": token})
}

func (s *Server) logout(c *gin.Context) {
	c.SetCookie("portfolio_token", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) getContent(c *gin.Context) {
	content, err := s.store.GetDraft()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"content": content})
}

func (s *Server) saveContent(c *gin.Context) {
	var body struct {
		Content store.Content `json:"content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Content == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效内容"})
		return
	}
	if err := s.store.SaveDraft(body.Content); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	s.store.Log("save_draft", "content")
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "草稿已保存"})
}

func (s *Server) publish(c *gin.Context) {
	pub, err := s.store.Publish()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "发布失败"})
		return
	}
	// Also write content.json compatibility export when path configured.
	if s.cfg.ContentJSON != "" {
		_ = writeJSONFile(s.cfg.ContentJSON, pub)
	}
	projects, _ := pub["projects"].([]any)
	s.store.Log("publish", "content")
	c.JSON(http.StatusOK, gin.H{"ok": true, "projects": len(projects), "message": "已发布"})
}

func (s *Server) publicContent(c *gin.Context) {
	content, err := s.store.GetPublished()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
		return
	}
	c.JSON(http.StatusOK, content)
}

func (s *Server) exportContent(c *gin.Context) {
	content, err := s.store.GetDraft()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "导出失败"})
		return
	}
	c.JSON(http.StatusOK, content)
}

func (s *Server) importContent(c *gin.Context) {
	raw, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效内容"})
		return
	}
	var body store.Content
	if err := json.Unmarshal(raw, &body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效内容"})
		return
	}
	if wrap, ok := body["content"].(map[string]any); ok {
		body = store.Content(wrap)
	}
	if err := s.store.ImportContent(body); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "导入失败"})
		return
	}
	s.store.Log("import", "content.json")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) upload(c *gin.Context) {
	var body struct {
		Data string `json:"data"`
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Data == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效上传"})
		return
	}
	raw, err := base64.StdEncoding.DecodeString(body.Data)
	if err != nil || len(raw) < 20 || len(raw) > 5_000_000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 5MB 以内文件"})
		return
	}
	ext := ""
	switch {
	case len(raw) >= 8 && raw[0] == 0x89 && raw[1] == 'P':
		ext = "png"
	case len(raw) >= 3 && raw[0] == 0xFF && raw[1] == 0xD8:
		ext = "jpg"
	case len(raw) >= 12 && string(raw[0:4]) == "RIFF" && string(raw[8:12]) == "WEBP":
		ext = "webp"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 PNG/JPG/WebP 图片"})
		return
	}
	sum := sha256.Sum256(raw)
	name := hex.EncodeToString(sum[:])[:24] + "." + ext
	if err := os.MkdirAll(s.cfg.UploadsDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "存储失败"})
		return
	}
	path := filepath.Join(s.cfg.UploadsDir, name)
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "写入失败"})
		return
	}
	_ = s.store.SaveMedia("image", "uploads/"+name, "image/"+ext, len(raw), hex.EncodeToString(sum[:]))
	c.JSON(http.StatusOK, gin.H{"ok": true, "url": "media/uploads/" + name, "path": path})
}

func writeJSONFile(path string, v any) error {
	data, err := marshalIndent(v)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func marshalIndent(v any) ([]byte, error) {
	var b strings.Builder
	enc := jsonEncoder(&b)
	if err := enc(v); err != nil {
		return nil, err
	}
	return []byte(b.String()), nil
}
