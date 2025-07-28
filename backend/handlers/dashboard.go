package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/backend/config"
	"github.com/yourusername/backend/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type DashboardChartData struct {
	CoverageTrend     []map[string]interface{} `json:"coverage_trend"`
	TestResults       map[string]int           `json:"test_results"`
	Activity          []map[string]interface{} `json:"activity"`
	CoverageByRepo    []map[string]interface{} `json:"coverage_by_repo"`
	RecentScans       []map[string]interface{} `json:"recent_scans"`
	LanguageBreakdown map[string]float64       `json:"language_breakdown"`
}

func GetDashboardMetrics(c *gin.Context) {
	userIDStr, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID, err := primitive.ObjectIDFromHex(userIDStr.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID format"})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	db, err := config.ConnectDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
		return
	}

	coverageColl := db.Collection("coverage_history")
	// Coverage Trend (last 30 days, all repos, all scans)
	coverageTrend := []map[string]interface{}{}
	trendCursor, _ := coverageColl.Find(ctx, bson.M{"user_id": userID})
	for trendCursor.Next(ctx) {
		var record models.CoverageHistory
		if err := trendCursor.Decode(&record); err == nil {
			for _, scan := range record.ScanHistory {
				if scan.Timestamp.After(time.Now().AddDate(0, 0, -30)) {
					coverageTrend = append(coverageTrend, map[string]interface{}{
						"date":     scan.Timestamp.Format("2006-01-02"),
						"coverage": scan.TotalCoverage,
						"repo":     record.Repository,
						"branch":   record.Branch,
					})
				}
			}
		}
	}

	// Test Results Breakdown (latest scan)
	testResults := map[string]int{"passed": 0, "failed": 0, "skipped": 0, "error": 0}
	var latestScan models.CoverageHistory
	err = coverageColl.FindOne(ctx, bson.M{"user_id": userID}, options.FindOne().SetSort(bson.M{"timestamp": -1})).Decode(&latestScan)
	if err == nil && len(latestScan.ScanHistory) > 0 {
		last := latestScan.ScanHistory[len(latestScan.ScanHistory)-1]
		for _, f := range last.Files {
			switch f.Status {
			case "Success":
				testResults["passed"]++
			case "Failure":
				testResults["failed"]++
			case "Skipped":
				testResults["skipped"]++
			default:
				testResults["error"]++
			}
		}
	}

	// Repository Activity (last 30 days)
	activity := []map[string]interface{}{}
	activityColl := db.Collection("activity")
	activityCursor, _ := activityColl.Find(ctx, bson.M{"user_id": userID, "date": bson.M{"$gte": time.Now().AddDate(0, 0, -30)}})
	for activityCursor.Next(ctx) {
		var act models.UserActivity
		if err := activityCursor.Decode(&act); err == nil {
			activity = append(activity, map[string]interface{}{
				"date":  act.Date.Format("2006-01-02"),
				"type":  act.Type,
				"count": act.Count,
				"repo":  act.RepoName,
			})
		}
	}

	// Coverage by Repository (latest scan per repo)
	coverageByRepo := []map[string]interface{}{}
	repoCursor, _ := coverageColl.Find(ctx, bson.M{"user_id": userID})
	for repoCursor.Next(ctx) {
		var record models.CoverageHistory
		if err := repoCursor.Decode(&record); err == nil && len(record.ScanHistory) > 0 {
			last := record.ScanHistory[len(record.ScanHistory)-1]
			coverageByRepo = append(coverageByRepo, map[string]interface{}{
				"repo":     record.Repository,
				"coverage": last.TotalCoverage,
			})
		}
	}

	// Recent Scans Timeline (all scans in last 30 days)
	recentScans := []map[string]interface{}{}
	scanCursor, _ := coverageColl.Find(ctx, bson.M{"user_id": userID})
	for scanCursor.Next(ctx) {
		var record models.CoverageHistory
		if err := scanCursor.Decode(&record); err == nil {
			for _, scan := range record.ScanHistory {
				if scan.Timestamp.After(time.Now().AddDate(0, 0, -30)) {
					recentScans = append(recentScans, map[string]interface{}{
						"date":     scan.Timestamp.Format("2006-01-02 15:04:05"),
						"repo":     record.Repository,
						"coverage": scan.TotalCoverage,
						"branch":   record.Branch,
						"commit":   scan.CommitHash,
					})
				}
			}
		}
	}

	// Language/Framework Breakdown (sum across all repos)
	languageBreakdown := map[string]float64{}
	repoColl := db.Collection("repositories")
	repoCursor2, _ := repoColl.Find(ctx, bson.M{"user_id": userID})
	for repoCursor2.Next(ctx) {
		var repo models.Repository
		if err := repoCursor2.Decode(&repo); err == nil {
			for lang, percent := range repo.Languages {
				languageBreakdown[lang] += percent
			}
		}
	}

	c.JSON(http.StatusOK, DashboardChartData{
		CoverageTrend:     coverageTrend,
		TestResults:       testResults,
		Activity:          activity,
		CoverageByRepo:    coverageByRepo,
		RecentScans:       recentScans,
		LanguageBreakdown: languageBreakdown,
	})
}
