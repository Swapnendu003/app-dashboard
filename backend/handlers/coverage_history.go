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
	"go.mongodb.org/mongo-driver/mongo/options"
)

func GetCoverageHistory(c *gin.Context) {
	repoURL := c.Query("repo_url")
	if repoURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Repository URL is required"})
		return
	}

	searchQuery := c.Query("search")

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
	}

	if branch := c.Query("branch"); branch != "" {
		filter["branch"] = branch
	}

	if coverageThreshold := c.Query("coverage_threshold"); coverageThreshold != "" {
		if threshold, err := strconv.ParseFloat(coverageThreshold, 64); err == nil {
			filter["total_coverage"] = bson.M{"$gte": threshold}
		}
	}

	opts := options.Find().SetSort(bson.M{
		"timestamp": -1,
	}).SetLimit(50)

	cursor, err := collection.Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query database"})
		return
	}
	defer cursor.Close(ctx)

	var results []models.CoverageHistory
	if err := cursor.All(ctx, &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode results"})
		return
	}

	// Ensure all files in all results have status fields populated
	for i := range results {
		for j := range results[i].Files {
			// If status is empty, populate based on coverage
			if results[i].Files[j].Status == "" {
				if results[i].Files[j].Coverage == 0.0 {
					results[i].Files[j].Status = "Failure"
					if results[i].Files[j].Error == "" {
						results[i].Files[j].Error = "File has 0% code coverage - no tests cover this file"
					}
				} else {
					results[i].Files[j].Status = "Success"
				}
			}
		}
	}

	if searchQuery != "" {
		searchLower := strings.ToLower(searchQuery)
		var filtered []models.CoverageHistory

		for _, item := range results {
			if strings.Contains(strings.ToLower(item.Branch), searchLower) {
				filtered = append(filtered, item)
			} else if item.CommitHash != "" && strings.Contains(strings.ToLower(item.CommitHash), searchLower) {
				filtered = append(filtered, item)
			}
		}

		results = filtered
	}

	if results == nil {
		results = []models.CoverageHistory{}
	}

	c.JSON(http.StatusOK, results)
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

	db, err := config.ConnectDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
		return
	}

	collection := db.Collection("coverage_history")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var result models.CoverageHistory
	err = collection.FindOne(ctx, bson.M{
		"_id": objID,
	}).Decode(&result)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Coverage record not found"})
		return
	}

	// Ensure files have status fields populated
	for i := range result.Files {
		// If status is empty, populate based on coverage
		if result.Files[i].Status == "" {
			if result.Files[i].Coverage == 0.0 {
				result.Files[i].Status = "Failure"
				if result.Files[i].Error == "" {
					result.Files[i].Error = "File has 0% code coverage - no tests cover this file"
				}
			} else {
				result.Files[i].Status = "Success"
			}
		}
	}

	c.JSON(http.StatusOK, result)
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
		"timestamp": bson.M{
			"$gte": startDate,
		},
	}

	if branch := c.Query("branch"); branch != "" {
		filter["branch"] = branch
	}

	opts := options.Find().SetSort(bson.M{
		"timestamp": 1,
	})

	cursor, err := collection.Find(ctx, filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query database"})
		return
	}
	defer cursor.Close(ctx)

	type TrendPoint struct {
		Date       string  `json:"date"`
		Coverage   float64 `json:"coverage"`
		CommitHash string  `json:"commit_hash,omitempty"`
	}

	var trends []TrendPoint
	var results []models.CoverageHistory
	if err := cursor.All(ctx, &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode results"})
		return
	}

	for _, record := range results {
		trends = append(trends, TrendPoint{
			Date:       record.Timestamp.Format("2006-01-02"),
			Coverage:   record.TotalCoverage,
			CommitHash: record.CommitHash,
		})
	}

	if trends == nil {
		trends = []TrendPoint{}
	}

	c.JSON(http.StatusOK, trends)
}
