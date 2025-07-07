package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/backend/config"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type DashboardMetrics struct {
	Repositories    int     `json:"repositories"`
	TotalScans      int     `json:"total_scans"`
	AveragePassRate float64 `json:"pass_rate"`
	RecentScans     int     `json:"recent_scans"`
	LastUpdated     string  `json:"last_updated"`
}

func GetCoverageMetrics(c *gin.Context) {
	db, err := config.ConnectDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	historyCollection := db.Collection("coverage_history")
	repoCount, err := historyCollection.Distinct(ctx, "repository", bson.M{})

	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)
	totalScansFilter := bson.M{"timestamp": bson.M{"$gte": thirtyDaysAgo}}
	totalScans, _ := historyCollection.CountDocuments(ctx, totalScansFilter)

	sevenDaysAgo := time.Now().AddDate(0, 0, -7)
	recentScansFilter := bson.M{"timestamp": bson.M{"$gte": sevenDaysAgo}}
	recentScans, _ := historyCollection.CountDocuments(ctx, recentScansFilter)

	opts := options.Find().SetSort(bson.M{"timestamp": -1}).SetLimit(100)
	cursor, err := historyCollection.Find(ctx, bson.M{}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch coverage data"})
		return
	}
	defer cursor.Close(ctx)

	var totalCoverage float64
	var count int
	for cursor.Next(ctx) {
		var history struct {
			TotalCoverage float64 `bson:"total_coverage"`
		}
		if err := cursor.Decode(&history); err == nil {
			totalCoverage += history.TotalCoverage
			count++
		}
	}

	averagePassRate := 0.0
	if count > 0 {
		averagePassRate = totalCoverage / float64(count)
	}

	metrics := DashboardMetrics{
		Repositories:    len(repoCount),
		TotalScans:      int(totalScans),
		AveragePassRate: averagePassRate,
		RecentScans:     int(recentScans),
		LastUpdated:     time.Now().Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, metrics)
}
