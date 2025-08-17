package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/backend/config"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type DashboardMetrics struct {
	Repositories    int     `json:"repositories"`
	TotalScans      int     `json:"total_scans"`
	AveragePassRate float64 `json:"pass_rate"`
	RecentScans     int     `json:"recent_scans"`
	LastUpdated     string  `json:"last_updated"`
}

func GetCoverageMetrics(c *gin.Context) {
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

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	historyCollection := db.Collection("coverage_history")
	cursor, err := historyCollection.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch coverage data"})
		return
	}
	defer cursor.Close(ctx)

	uniqueRepos := make(map[string]struct{})
	totalScans := 0
	var totalCoverage float64
	var scanCount int
	var recentScans int
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)

	for cursor.Next(ctx) {
		var repo struct {
			Repository string `bson:"repository"`
			TotalScans int    `bson:"total_scans"`
			Branches   map[string]struct {
				History []struct {
					TotalCoverage float64   `bson:"total_coverage"`
					Timestamp     time.Time `bson:"timestamp"`
				} `bson:"history"`
				TotalScans int `bson:"total_scans"`
			} `bson:"branches"`
		}

		if err := cursor.Decode(&repo); err == nil {
			uniqueRepos[repo.Repository] = struct{}{}
			totalScans += repo.TotalScans

			for _, branch := range repo.Branches {
				for _, scan := range branch.History {
					totalCoverage += scan.TotalCoverage
					scanCount++
					if scan.Timestamp.After(sevenDaysAgo) {
						recentScans++
					}
				}
			}
		}
	}

	averagePassRate := 0.0
	if scanCount > 0 {
		averagePassRate = totalCoverage / float64(scanCount)
	}

	metrics := DashboardMetrics{
		Repositories:    len(uniqueRepos),
		TotalScans:      totalScans,
		AveragePassRate: averagePassRate,
		RecentScans:     recentScans,
		LastUpdated:     time.Now().Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, metrics)
}
