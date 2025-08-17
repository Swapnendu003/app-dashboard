package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/yourusername/backend/config"
	"github.com/yourusername/backend/handlers"
	"github.com/yourusername/backend/middleware"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	_, err := config.ConnectDB()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	r := gin.Default()
	r.Use(middleware.CORSMiddleware())

	r.POST("/auth/github/signup", handlers.GitHubSignUp)
	r.POST("/auth/github/signin", handlers.GitHubSignIn)

	protected := r.Group("/api")
	protected.Use(middleware.AuthMiddleware())
	protected.GET("/profile", handlers.GetUserProfile)
	protected.GET("/repositories", handlers.GetUserRepositories)
	protected.GET("/repositories/refresh", handlers.RefreshUserRepositories)
	protected.GET("/repositories/force-refresh", handlers.RefreshAllRepositories)
	protected.GET("/github-contributions", handlers.GetGitHubContributions)
	protected.GET("/dashboard/metrics", handlers.GetDashboardMetrics)
	protected.POST("/coverage", handlers.RunCoverageScan)
	protected.GET("/coverage/history", handlers.GetCoverageHistory)
	protected.GET("/coverage/:id", handlers.GetCoverageById)
	protected.GET("/coverage/trends", handlers.GetCoverageTrends)
	protected.POST("/coverage/branches", handlers.ScanMultipleBranches)
	protected.GET("/coverage/branches", handlers.GetBranchCoverage)
	protected.GET("/coverage/compare", handlers.CompareBranchCoverage)
	protected.GET("/coverage/status/:job_id", handlers.GetCoverageJobStatus)
	protected.GET("/coverage/jobs/active", handlers.ListActiveJobs)
	protected.DELETE("/coverage/jobs/:job_id", handlers.CancelJob)
	protected.GET("/coverage/metrics", handlers.GetCoverageMetrics)
	protected.GET("/coverage/recent-activity", handlers.GetRecentActivity)
	protected.GET("/coverage/scanned-repos", handlers.GetUserScannedRepositories)
	protected.GET("/repositories/branches", handlers.GetRepositoryBranches)
	protected.GET("/coverage/branches/history", handlers.GetBranchesWithHistory)

	handlers.CleanupOldJobs()

	port := os.Getenv("PORT")

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  200 * time.Second,
		WriteTimeout: 200 * time.Second,
	}

	log.Printf("Server running on port %s", port)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

}
