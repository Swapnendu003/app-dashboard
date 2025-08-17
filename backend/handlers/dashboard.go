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
		var repo struct {
			Repository string `bson:"repository"`
			Branches   map[string]struct {
				History []struct {
					TotalCoverage float64   `bson:"total_coverage"`
					Timestamp     time.Time `bson:"timestamp"`
					CommitHash    string    `bson:"commit_hash"`
				} `bson:"history"`
				TotalScans int `bson:"total_scans"`
			} `bson:"branches"`
		}
		if err := trendCursor.Decode(&repo); err == nil {
			for branchName, branch := range repo.Branches {
				for _, scan := range branch.History {
					if scan.Timestamp.After(time.Now().AddDate(0, 0, -30)) {
						coverageTrend = append(coverageTrend, map[string]interface{}{
							"date":     scan.Timestamp.Format("2006-01-02"),
							"coverage": scan.TotalCoverage,
							"repo":     repo.Repository,
							"branch":   branchName,
							"scans":    branch.TotalScans,
						})
					}
				}
			}
		}
	}

	// Test Results Breakdown (latest scan)
	testResults := map[string]int{"passed": 0, "failed": 0, "skipped": 0, "error": 0}
	var latestRepo struct {
		Branches map[string]struct {
			History []struct {
				Files []struct {
					Status string `bson:"status"`
				} `bson:"files"`
				Timestamp time.Time `bson:"timestamp"`
			} `bson:"history"`
			LastUpdated time.Time `bson:"last_updated"`
		} `bson:"branches"`
	}

	err = coverageColl.FindOne(ctx, bson.M{"user_id": userID},
		options.FindOne().SetSort(bson.M{"branches.main.last_updated": -1})).Decode(&latestRepo)
	if err == nil {
		var latestFiles []struct{ Status string `bson:"status"` }
		var latestTime time.Time

		for _, branch := range latestRepo.Branches {
			if len(branch.History) > 0 && branch.LastUpdated.After(latestTime) {
				latestTime = branch.LastUpdated
				latestFiles = branch.History[len(branch.History)-1].Files
			}
		}

		for _, f := range latestFiles {
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

	// Coverage by Repository (latest coverage across all branches)
	coverageByRepo := []map[string]interface{}{}
	repoCursor, _ := coverageColl.Find(ctx, bson.M{"user_id": userID})
	for repoCursor.Next(ctx) {
		var repo struct {
			Repository string `bson:"repository"`
			Branches   map[string]struct {
				LatestCoverage float64   `bson:"latest_coverage"`
				LastUpdated    time.Time `bson:"last_updated"`
				TotalScans     int       `bson:"total_scans"`
			} `bson:"branches"`
		}
		if err := repoCursor.Decode(&repo); err == nil {
			// Find the highest coverage across all branches
			var maxCoverage float64
			for _, branch := range repo.Branches {
				if branch.LatestCoverage > maxCoverage {
					maxCoverage = branch.LatestCoverage
				}
			}
			coverageByRepo = append(coverageByRepo, map[string]interface{}{
				"repo":     repo.Repository,
				"coverage": maxCoverage,
			})
		}
	}

	// Recent Scans Timeline (all scans in last 30 days)
	recentScans := []map[string]interface{}{}
	scanCursor, _ := coverageColl.Find(ctx, bson.M{"user_id": userID})
	for scanCursor.Next(ctx) {
		var repo struct {
			Repository string `bson:"repository"`
			Branches   map[string]struct {
				History []struct {
					TotalCoverage float64   `bson:"total_coverage"`
					Timestamp     time.Time `bson:"timestamp"`
					CommitHash    string    `bson:"commit_hash"`
				} `bson:"history"`
				TotalScans int `bson:"total_scans"`
			} `bson:"branches"`
		}
		if err := scanCursor.Decode(&repo); err == nil {
			for branchName, branch := range repo.Branches {
				for _, scan := range branch.History {
					if scan.Timestamp.After(time.Now().AddDate(0, 0, -30)) {
						recentScans = append(recentScans, map[string]interface{}{
							"date":     scan.Timestamp.Format("2006-01-02 15:04:05"),
							"repo":     repo.Repository,
							"coverage": scan.TotalCoverage,
							"branch":   branchName,
							"commit":   scan.CommitHash,
							"scans":    branch.TotalScans,
						})
					}
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
