package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/jenrimark/portfolio/server/internal/auth"
	"github.com/jenrimark/portfolio/server/internal/config"
	"github.com/jenrimark/portfolio/server/internal/store"
)

type Server struct {
	cfg           config.Config
	store         *store.Store
	auth          *auth.Manager
	loginMu       sync.Mutex
	loginFailures map[string]loginFailure
}

type loginFailure struct {
	count int
	first time.Time
}

func New(cfg config.Config, st *store.Store, am *auth.Manager) *Server {
	return &Server{cfg: cfg, store: st, auth: am, loginFailures: make(map[string]loginFailure)}
}

func (s *Server) Router() *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), s.cors())

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true, "service": "jenrimark-api"})
	})

	r.POST("/api/login", s.login)
	r.POST("/api/logout", s.logout)
	r.GET("/media/*filepath", s.media)

	api := r.Group("/api", s.auth.Middleware())
	{
		api.GET("/content", s.getContent)
		api.PUT("/content", s.saveContent)
		api.POST("/publish", s.publish)
		api.POST("/upload", s.upload)
		api.POST("/import", s.importContent)
		api.GET("/export", s.exportContent)
		api.GET("/media", s.listMedia)
		api.DELETE("/media/*storageKey", s.deleteMedia)
		api.GET("/metrics", s.metrics)
		api.POST("/metrics/page-view", s.recordPageView)
		api.POST("/metrics/project-open", s.recordProjectOpen)
	}

	r.GET("/api/public/content", s.publicContent)
	r.POST("/api/public/metrics/page-view", s.recordPageView)
	r.POST("/api/public/metrics/project-open", s.recordProjectOpen)
	return r
}

func (s *Server) cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if s.allowedOrigin(origin) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func (s *Server) allowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	for _, allowed := range s.cfg.AllowedOrigins {
		if origin == strings.TrimSpace(allowed) {
			return true
		}
	}
	return false
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
	key := c.ClientIP() + ":" + user
	if !s.loginAllowed(key) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "登录失败次数过多，请稍后再试"})
		return
	}
	if err := s.store.VerifyPassword(user, body.Password); err != nil {
		s.recordLoginFailure(key)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "密码不正确"})
		return
	}
	token, err := s.auth.Issue(user, 8*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "登录失败"})
		return
	}
	s.resetLoginFailures(key)
	s.setCookie(c, "portfolio_token", token, int((8 * time.Hour).Seconds()))
	s.store.Log("login", user)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) logout(c *gin.Context) {
	s.setCookie(c, "portfolio_token", "", -1)
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
	if err := validateRequestContent(body.Content); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := s.store.SaveDraft(body.Content); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	s.store.Log("save_draft", "content")
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "草稿已保存"})
}

func validateRequestContent(content store.Content) error {
	profile, ok := content["profile"].(map[string]any)
	if !ok || strings.TrimSpace(fmt.Sprint(profile["name"])) == "" {
		return fmt.Errorf("profile.name is required")
	}
	projects, ok := content["projects"].([]any)
	if !ok || len(projects) > 100 {
		return fmt.Errorf("projects must be an array (max 100)")
	}
	for _, raw := range projects {
		project, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("project must be an object")
		}
		if source := fmt.Sprint(project["sourceUrl"]); source != "" && !validExternalURL(source) {
			return fmt.Errorf("invalid project source URL")
		}
		if blocks, ok := project["blocks"].([]any); ok {
			if len(blocks) > 100 {
				return fmt.Errorf("project blocks must be an array (max 100)")
			}
			for _, rawBlock := range blocks {
				block, ok := rawBlock.(map[string]any)
				if !ok {
					return fmt.Errorf("project block is invalid")
				}
				if fmt.Sprint(block["type"]) == "rich_text" {
					if err := validateRichTextRequest(block["body"]); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

func validateRichTextRequest(value any) error {
	var walk func(any) error
	walk = func(value any) error {
		object, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("rich text node is invalid")
		}
		typ := fmt.Sprint(object["type"])
		allowed := map[string]bool{"doc": true, "paragraph": true, "heading": true, "bulletList": true, "orderedList": true, "listItem": true, "text": true}
		if typ != "" && !allowed[typ] {
			return fmt.Errorf("rich text node type is not allowed")
		}
		if text, exists := object["text"]; exists && text != nil && fmt.Sprint(text) == "" && typ == "text" {
			return nil
		}
		if children, exists := object["content"]; exists {
			list, ok := children.([]any)
			if !ok || len(list) > 200 {
				return fmt.Errorf("rich text content is invalid")
			}
			for _, child := range list {
				if err := walk(child); err != nil {
					return err
				}
			}
		}
		if marks, exists := object["marks"]; exists {
			list, ok := marks.([]any)
			if !ok || len(list) > 5 {
				return fmt.Errorf("rich text marks are invalid")
			}
			for _, raw := range list {
				mark, ok := raw.(map[string]any)
				if !ok {
					return fmt.Errorf("rich text mark is invalid")
				}
				markType := fmt.Sprint(mark["type"])
				if markType != "bold" && markType != "italic" && markType != "link" {
					return fmt.Errorf("rich text mark is not allowed")
				}
				if markType == "link" {
					attrs, _ := mark["attrs"].(map[string]any)
					if !validExternalURL(fmt.Sprint(attrs["href"])) {
						return fmt.Errorf("invalid rich text link")
					}
				}
			}
		}
		return nil
	}
	return walk(value)
}

func validExternalURL(value string) bool {
	return strings.HasPrefix(value, "https://") || strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "mailto:")
}

func (s *Server) publish(c *gin.Context) {
	pub, err := s.store.Publish()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "发布失败: " + err.Error()})
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

func (s *Server) metrics(c *gin.Context) {
	snapshot, err := s.store.Metrics(30)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取统计失败"})
		return
	}
	c.JSON(http.StatusOK, snapshot)
}

func (s *Server) recordPageView(c *gin.Context) {
	if err := s.store.RecordMetric("page_view", ""); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "记录失败"})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

func (s *Server) recordProjectOpen(c *gin.Context) {
	var body struct {
		ProjectID string `json:"projectId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.ProjectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "projectId is required"})
		return
	}
	if err := s.store.RecordMetric("project_open", body.ProjectID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "记录失败"})
		return
	}
	c.JSON(http.StatusNoContent, nil)
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
	if err != nil || len(raw) < 20 || len(raw) > 50_000_000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 50MB 以内文件"})
		return
	}
	ext := ""
	mime := http.DetectContentType(raw)
	switch {
	case len(raw) >= 8 && raw[0] == 0x89 && raw[1] == 'P':
		ext, mime = "png", "image/png"
	case len(raw) >= 3 && raw[0] == 0xFF && raw[1] == 0xD8:
		ext, mime = "jpg", "image/jpeg"
	case len(raw) >= 12 && string(raw[0:4]) == "RIFF" && string(raw[8:12]) == "WEBP":
		ext, mime = "webp", "image/webp"
	case len(raw) >= 6 && (string(raw[:6]) == "GIF87a" || string(raw[:6]) == "GIF89a"):
		ext, mime = "gif", "image/gif"
	case len(raw) >= 12 && string(raw[4:8]) == "ftyp":
		ext, mime = "mp4", "video/mp4"
	case len(raw) >= 4 && string(raw[:4]) == "\x1A\x45\xDF\xA3":
		ext, mime = "webm", "video/webm"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 PNG/JPG/WebP/GIF 图片或 MP4/WebM 视频"})
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
	kind := "image"
	if strings.HasPrefix(mime, "video/") {
		kind = "video"
	}
	if err := s.store.SaveMedia(kind, "uploads/"+name, mime, len(raw), hex.EncodeToString(sum[:])); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "媒体索引失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "url": "media/uploads/" + name, "path": path})
}

func (s *Server) media(c *gin.Context) {
	relative := strings.TrimPrefix(filepath.ToSlash(c.Param("filepath")), "/")
	relative = strings.TrimPrefix(relative, "uploads/")
	if relative == "" || strings.Contains(relative, "..") {
		c.Status(http.StatusNotFound)
		return
	}
	root, err := filepath.Abs(s.cfg.UploadsDir)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	path, err := filepath.Abs(filepath.Join(root, filepath.FromSlash(relative)))
	if err != nil || (path != root && !strings.HasPrefix(path, root+string(os.PathSeparator))) {
		c.Status(http.StatusNotFound)
		return
	}
	if _, err := os.Stat(path); err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.File(path)
}

func (s *Server) listMedia(c *gin.Context) {
	assets, err := s.store.ListMedia()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取媒体失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"assets": assets})
}

func (s *Server) deleteMedia(c *gin.Context) {
	key, err := url.PathUnescape(strings.TrimPrefix(c.Param("storageKey"), "/"))
	if err != nil || key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效媒体路径"})
		return
	}
	if err := s.store.DeleteMedia(key); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	path := filepath.Join(s.cfg.UploadsDir, strings.TrimPrefix(key, "uploads/"))
	_ = os.Remove(path)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) setCookie(c *gin.Context, name, value string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{Name: name, Value: value, Path: "/", MaxAge: maxAge, HttpOnly: true, Secure: s.cfg.SecureCookie, SameSite: http.SameSiteStrictMode})
}

func (s *Server) loginAllowed(key string) bool {
	s.loginMu.Lock()
	defer s.loginMu.Unlock()
	failure, ok := s.loginFailures[key]
	if !ok || time.Since(failure.first) >= time.Minute {
		delete(s.loginFailures, key)
		return true
	}
	return failure.count < 5
}

func (s *Server) recordLoginFailure(key string) {
	s.loginMu.Lock()
	defer s.loginMu.Unlock()
	failure := s.loginFailures[key]
	if failure.first.IsZero() || time.Since(failure.first) >= time.Minute {
		failure = loginFailure{first: time.Now()}
	}
	failure.count++
	s.loginFailures[key] = failure
}

func (s *Server) resetLoginFailures(key string) {
	s.loginMu.Lock()
	defer s.loginMu.Unlock()
	delete(s.loginFailures, key)
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
