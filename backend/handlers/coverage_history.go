package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/backend/config"
	"github.com/yourusername/backend/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func GetCoverageHistory(c *gin.Context) {
	repoURL := c.Query("repo_url")
	if repoURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Repository URL is required"})
		return
	}

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

	searchQuery := c.Query("search")
	branch := c.Query("branch")

	db, err := config.ConnectDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
		return
	}

	collection := db.Collection("coverage_history")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"repository": repoURL,
		"user_id":    userID,
	}

	var result struct {
		ID         primitive.ObjectID `bson:"_id"`
		Repository string             `bson:"repository"`
		UserID     primitive.ObjectID `bson:"user_id"`
		TotalScans int                `bson:"total_scans"`
		Branches   map[string]struct {
			History []struct {
				TotalCoverage float64 `bson:"total_coverage"`
				Files         []struct {
					File     string  `bson:"file"`
					Coverage float64 `bson:"coverage"`
					Status   string  `bson:"status"`
					Error    string  `bson:"error,omitempty"`
				} `bson:"files"`
				Timestamp  time.Time `bson:"timestamp"`
				CommitHash string    `bson:"commit_hash"`
			} `bson:"history"`
			LastUpdated    time.Time `bson:"last_updated"`
			LatestCoverage float64   `bson:"latest_coverage"`
			TotalScans     int       `bson:"total_scans"`
		} `bson:"branches"`
	}

	err = collection.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		c.JSON(http.StatusOK, []models.CoverageHistory{})
		return
	}

	var historyResults []models.CoverageHistory

	// Extract history from the specified branch or all branches
	for branchName, branchData := range result.Branches {
		// If branch filter is specified, only include that branch
		if branch != "" && branchName != branch {
			continue
		}

		for _, historyItem := range branchData.History {
			// Apply coverage threshold filter if specified
			if coverageThreshold := c.Query("coverage_threshold"); coverageThreshold != "" {
				if threshold, err := strconv.ParseFloat(coverageThreshold, 64); err == nil {
					if historyItem.TotalCoverage < threshold {
						continue
					}
				}
			}

			// Ensure all files have status fields populated
			for i := range historyItem.Files {
				if historyItem.Files[i].Status == "" {
					if historyItem.Files[i].Coverage == 0.0 {
						historyItem.Files[i].Status = "Failure"
						if historyItem.Files[i].Error == "" {
							historyItem.Files[i].Error = "File has 0% code coverage - no tests cover this file"
						}
					} else {
						historyItem.Files[i].Status = "Success"
					}
				}
			}

			files := make([]models.FileCoverage, len(historyItem.Files))
			for i, f := range historyItem.Files {
				files[i] = models.FileCoverage{
					File:     f.File,
					Coverage: f.Coverage,
					Status:   f.Status,
					Error:    f.Error,
				}
			}
			historyRecord := models.CoverageHistory{
				ID:            result.ID,
				Repository:    result.Repository,
				UserID:        result.UserID,
				Branch:        branchName,
				TotalCoverage: historyItem.TotalCoverage,
				Files:         files,
				Timestamp:     historyItem.Timestamp,
				CommitHash:    historyItem.CommitHash,
				TotalScans:    result.TotalScans,
				BranchScans:   branchData.TotalScans, // Add branch-specific scan count
			}

			historyResults = append(historyResults, historyRecord)
		}
	}

	// Apply search filter
	if searchQuery != "" {
		searchLower := strings.ToLower(searchQuery)
		var filtered []models.CoverageHistory

		for _, item := range historyResults {
			if strings.Contains(strings.ToLower(item.Branch), searchLower) {
				filtered = append(filtered, item)
			} else if item.CommitHash != "" && strings.Contains(strings.ToLower(item.CommitHash), searchLower) {
				filtered = append(filtered, item)
			}
		}

		historyResults = filtered
	}

	// Sort by timestamp (most recent first) and limit to 50
	// Since we're processing in Go, we need to implement sorting
	for i := 0; i < len(historyResults)-1; i++ {
		for j := i + 1; j < len(historyResults); j++ {
			if historyResults[i].Timestamp.Before(historyResults[j].Timestamp) {
				historyResults[i], historyResults[j] = historyResults[j], historyResults[i]
			}
		}
	}

	// Limit to 50 results
	if len(historyResults) > 50 {
		historyResults = historyResults[:50]
	}

	if historyResults == nil {
		historyResults = []models.CoverageHistory{}
	}

	c.JSON(http.StatusOK, historyResults)
}

func GetCoverageById(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID is required"})
		return
	}

	objID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID format"})
		return
	}

	// Additional parameters to identify specific history entry
	branch := c.Query("branch")
	timestamp := c.Query("timestamp")

	if branch == "" || timestamp == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Branch and timestamp are required"})
		return
	}

	parsedTime, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid timestamp format"})
		return
	}

	db, err := config.ConnectDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
		return
	}

	collection := db.Collection("coverage_history")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var result struct {
		ID         primitive.ObjectID `bson:"_id"`
		Repository string             `bson:"repository"`
		UserID     primitive.ObjectID `bson:"user_id"`
		Branches   map[string]struct {
			History []struct {
				TotalCoverage float64 `bson:"total_coverage"`
				Files         []struct {
					File     string  `bson:"file"`
					Coverage float64 `bson:"coverage"`
					Status   string  `bson:"status"`
					Error    string  `bson:"error,omitempty"`
				} `bson:"files"`
				Timestamp  time.Time `bson:"timestamp"`
				CommitHash string    `bson:"commit_hash"`
			} `bson:"history"`
		} `bson:"branches"`
	}

	err = collection.FindOne(ctx, bson.M{"_id": objID}).Decode(&result)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Coverage record not found"})
		return
	}

	// Find the specific history entry
	branchData, exists := result.Branches[branch]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Branch not found"})
		return
	}

	var foundHistory *models.CoverageHistory
	for _, historyItem := range branchData.History {
		if historyItem.Timestamp.Equal(parsedTime) {
			// Ensure files have status fields populated
			for i := range historyItem.Files {
				if historyItem.Files[i].Status == "" {
					if historyItem.Files[i].Coverage == 0.0 {
						historyItem.Files[i].Status = "Failure"
						if historyItem.Files[i].Error == "" {
							historyItem.Files[i].Error = "File has 0% code coverage - no tests cover this file"
						}
					} else {
						historyItem.Files[i].Status = "Success"
					}
				}
			}

			files := make([]models.FileCoverage, len(historyItem.Files))
			for i, f := range historyItem.Files {
				files[i] = models.FileCoverage{
					File:     f.File,
					Coverage: f.Coverage,
					Status:   f.Status,
					Error:    f.Error,
				}
			}
			foundHistory = &models.CoverageHistory{
				ID:            result.ID,
				Repository:    result.Repository,
				UserID:        result.UserID,
				Branch:        branch,
				TotalCoverage: historyItem.TotalCoverage,
				Files:         files,
				Timestamp:     historyItem.Timestamp,
				CommitHash:    historyItem.CommitHash,
			}
			break
		}
	}

	if foundHistory == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Specific coverage record not found"})
		return
	}

	c.JSON(http.StatusOK, foundHistory)
}

type TrendPoint struct {
	Date     string  `json:"date"`
	Coverage float64 `json:"coverage"`
	Branch   string  `json:"branch"`
}

func GetCoverageTrends(c *gin.Context) {
	repoURL := c.Query("repo_url")
	if repoURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Repository URL is required"})
		return
	}

	days := 30
	if daysStr := c.Query("days"); daysStr != "" {
		if d, err := strconv.Atoi(daysStr); err == nil && d > 0 {
			days = d
		}
	}

	branch := c.Query("branch")

	db, err := config.ConnectDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
		return
	}

	collection := db.Collection("coverage_history")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	startDate := time.Now().AddDate(0, 0, -days)

	filter := bson.M{
		"repository": repoURL,
	}

	var result struct {
		Repository string `bson:"repository"`
		Branches   map[string]struct {
			History []struct {
				TotalCoverage float64   `bson:"total_coverage"`
				Timestamp     time.Time `bson:"timestamp"`
				CommitHash    string    `bson:"commit_hash"`
			} `bson:"history"`
		} `bson:"branches"`
	}

	err = collection.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Coverage records not found"})
		return
	}

	var trends []TrendPoint

	// Process trends for specified branch or all branches
	for branchName, branchData := range result.Branches {
		// If branch filter is specified, only include that branch
		if branch != "" && branchName != branch {
			continue
		}

		for _, historyItem := range branchData.History {
			// Filter by date range
			if historyItem.Timestamp.After(startDate) {
				trends = append(trends, TrendPoint{
					Date:     historyItem.Timestamp.Format("2006-01-02"),
					Coverage: historyItem.TotalCoverage,
					Branch:   branchName, // Pass branch name instead of commit hash
				})
			}
		}
	}

	// Sort trends by timestamp
	for i := 0; i < len(trends)-1; i++ {
		for j := i + 1; j < len(trends); j++ {
			if trends[i].Date > trends[j].Date {
				trends[i], trends[j] = trends[j], trends[i]
			}
		}
	}

	if trends == nil {
		trends = []TrendPoint{}
	}

	c.JSON(http.StatusOK, trends)
}

func GetUserScannedRepositories(c *gin.Context) {
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

	db, err := config.ConnectDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
		return
	}

	collection := db.Collection("coverage_history")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cursor, err := collection.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query database"})
		return
	}
	defer cursor.Close(ctx)

	type RepoInfo struct {
		Repository  string    `json:"repository"`
		LastScanned time.Time `json:"last_scanned"`
		TotalScans  int       `json:"total_scans"`
	}

	repoMap := make(map[string]RepoInfo)

	for cursor.Next(ctx) {
		var doc struct {
			Repository string `bson:"repository"`
			Branches   map[string]struct {
				History []struct {
					Timestamp time.Time `bson:"timestamp"`
				} `bson:"history"`
				LastUpdated time.Time `bson:"last_updated"`
			} `bson:"branches"`
		}

		if err := cursor.Decode(&doc); err == nil {
			var lastScanned time.Time
			totalScans := 0

			// Find the most recent scan across all branches
			for _, branchData := range doc.Branches {
				totalScans += len(branchData.History)

				if branchData.LastUpdated.After(lastScanned) {
					lastScanned = branchData.LastUpdated
				}

				// Also check individual history entries
				for _, historyItem := range branchData.History {
					if historyItem.Timestamp.After(lastScanned) {
						lastScanned = historyItem.Timestamp
					}
				}
			}

			repoMap[doc.Repository] = RepoInfo{
				Repository:  doc.Repository,
				LastScanned: lastScanned,
				TotalScans:  totalScans,
			}
		}
	}

	repos := make([]RepoInfo, 0, len(repoMap))
	for _, v := range repoMap {
		repos = append(repos, v)
	}

	c.JSON(http.StatusOK, gin.H{"repositories": repos})
}
