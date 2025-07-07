package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func GetRecentActivity(c *gin.Context) {
	// Get recent activity from last 30 days
	activities := []map[string]interface{}{
		{
			"type":      "coverage_scan",
			"timestamp": "2024-01-20T15:04:05Z",
			"details": map[string]interface{}{
				"repository": "user/repo",
				"coverage":   85.5,
				"branch":     "main",
			},
		},
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"data":   activities,
	})
}
