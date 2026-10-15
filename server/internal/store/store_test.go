package store

import (
	"path/filepath"
	"testing"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	store, err := Open(filepath.Join(t.TempDir(), "portfolio.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func validContent(status string) Content {
	projects := make([]any, 0, 6)
	for index, id := range []string{"greenhouse", "sugarguard", "startrail", "vehicle", "lingxi", "roommate"} {
		projects = append(projects, map[string]any{"id": id, "slug": id, "title": id, "status": status, "sortOrder": index})
	}
	return Content{
		"profile":  map[string]any{"name": "Jenrimark"},
		"projects": projects,
		"homeSlots": map[string]any{
			"featured_1": "greenhouse", "featured_2": "sugarguard",
			"mini_1": "startrail", "mini_2": "vehicle", "mini_3": "lingxi", "mini_4": "roommate",
		},
	}
}

func TestPublishedContentNeverFallsBackToDraft(t *testing.T) {
	store := testStore(t)
	if err := store.SaveDraft(validContent("published")); err != nil {
		t.Fatalf("save draft: %v", err)
	}

	published, err := store.GetPublished()
	if err != nil {
		t.Fatalf("get published: %v", err)
	}
	if len(published) != 0 {
		t.Fatalf("expected empty public content before first publish, got %#v", published)
	}
}

func TestPublishRejectsInvalidDraftAndKeepsPreviousPublicContent(t *testing.T) {
	store := testStore(t)
	if err := store.SaveDraft(validContent("published")); err != nil {
		t.Fatalf("save draft: %v", err)
	}
	if _, err := store.Publish(); err != nil {
		t.Fatalf("first publish: %v", err)
	}

	if err := store.SaveDraft(Content{
		"profile":  map[string]any{"name": ""},
		"projects": []any{},
	}); err != nil {
		t.Fatalf("save invalid draft: %v", err)
	}
	if _, err := store.Publish(); err == nil {
		t.Fatal("expected invalid draft to be rejected")
	}

	public, err := store.GetPublished()
	if err != nil {
		t.Fatalf("get public after rejected publish: %v", err)
	}
	projects, _ := public["projects"].([]any)
	if len(projects) != 6 {
		t.Fatalf("previous public content was replaced: %#v", public)
	}
}

func TestPublishRejectsHomeSlotPointingToDraftProject(t *testing.T) {
	store := testStore(t)
	content := validContent("published")
	projects := content["projects"].([]any)
	projects[0].(map[string]any)["status"] = "draft"
	if err := store.SaveDraft(content); err != nil {
		t.Fatalf("save draft: %v", err)
	}
	if _, err := store.Publish(); err == nil {
		t.Fatal("expected unpublished home slot to be rejected")
	}
}

func TestPublishedContentRemovesSlotsThatPointToDraftProjects(t *testing.T) {
	content := validContent("published")
	projects := content["projects"].([]any)
	projects[0].(map[string]any)["status"] = "draft"
	public := publicContent(content)
	slots := public["homeSlots"].(map[string]any)
	if _, exists := slots["featured_1"]; exists {
		t.Fatal("draft project slot leaked into public content")
	}
}
