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
	r.POST("/coverage", handlers.RunCoverageScan)
	r.GET("/coverage/history", handlers.GetCoverageHistory)
	r.GET("/coverage/:id", handlers.GetCoverageById)
	r.GET("/coverage/trends", handlers.GetCoverageTrends)
	r.POST("/coverage/branches", handlers.ScanMultipleBranches)
	r.GET("/coverage/branches", handlers.GetBranchCoverage)
	r.GET("/coverage/compare", handlers.CompareBranchCoverage)
	r.GET("/coverage/status/:job_id", handlers.GetCoverageJobStatus)
	r.GET("/coverage/jobs/active", handlers.ListActiveJobs)
	r.DELETE("/coverage/jobs/:job_id", handlers.CancelJob)
	r.GET("/coverage/metrics", handlers.GetCoverageMetrics)
	r.GET("/coverage/recent-activity", handlers.GetRecentActivity)

	protected := r.Group("/api")
	protected.Use(middleware.AuthMiddleware())
	protected.GET("/profile", handlers.GetUserProfile)
	protected.GET("/repositories", handlers.GetUserRepositories)
	protected.GET("/repositories/refresh", handlers.RefreshUserRepositories)
	protected.GET("/repositories/force-refresh", handlers.RefreshAllRepositories)
	protected.GET("/github-contributions", handlers.GetGitHubContributions)

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
