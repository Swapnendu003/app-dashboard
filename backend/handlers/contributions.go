package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

func GetGitHubContributions(c *gin.Context) {
	username := c.Query("username")
	if username == "" {
		username = c.GetString("github_username")
	}
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "GitHub username not found"})
		return
	}
	year := c.DefaultQuery("year", "last")
	url := fmt.Sprintf("https://github-contributions-api.jogruber.de/v4/%s?y=%s", username, year)

	resp, err := http.Get(url)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch contributions"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read response"})
		return
	}

	var data interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse response"})
		return
	}

	c.JSON(http.StatusOK, data)
}
