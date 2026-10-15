package store

import "testing"

func TestMetricsAggregatePageViewsAndProjectOpens(t *testing.T) {
	store := testStore(t)
	if err := store.RecordMetric("page_view", ""); err != nil {
		t.Fatalf("page view: %v", err)
	}
	if err := store.RecordMetric("project_open", "greenhouse"); err != nil {
		t.Fatalf("project open: %v", err)
	}
	snapshot, err := store.Metrics(30)
	if err != nil {
		t.Fatalf("metrics: %v", err)
	}
	if len(snapshot.Days) != 1 || snapshot.Days[0].PageViews != 1 || snapshot.Days[0].ProjectOpenCount != 1 {
		t.Fatalf("unexpected day metrics: %#v", snapshot.Days)
	}
	if len(snapshot.ProjectRanking) != 1 || snapshot.ProjectRanking[0].ProjectID != "greenhouse" {
		t.Fatalf("unexpected ranking: %#v", snapshot.ProjectRanking)
	}
}
