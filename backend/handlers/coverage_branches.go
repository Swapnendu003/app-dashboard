package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/backend/config"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type MultiBranchScanRequest struct {
	RepoURL  string   `json:"repo_url" binding:"required"`
	Branches []string `json:"branches" binding:"required"`
	Async    bool     `json:"async"`
}

type BranchScanStatus struct {
	Branch   string  `json:"branch"`
	Status   string  `json:"status"`
	Coverage float64 `json:"coverage,omitempty"`
	Error    string  `json:"error,omitempty"`
}

type MultiBranchScanResponse struct {
	RepoURL      string             `json:"repo_url"`
	TotalScanned int                `json:"total_scanned"`
	Successful   int                `json:"successful"`
	Failed       int                `json:"failed"`
	Branches     []BranchScanStatus `json:"branches"`
}

type BranchJobStatus struct {
	Branch string `json:"branch"`
	JobID  string `json:"job_id"`
}

func ScanMultipleBranches(c *gin.Context) {
	var req MultiBranchScanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Always set async to true regardless of request
	req.Async = true

	if len(req.Branches) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "At least one branch must be specified"})
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

	db, err := config.ConnectDB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
		return
	}

	if req.Async {
		jobStatuses := make([]BranchJobStatus, 0, len(req.Branches))
		now := time.Now()

		for _, branch := range req.Branches {
			jobID := primitive.NewObjectID().Hex()

			// Create job document
			jobDoc := bson.M{
				"job_id":     jobID,
				"repository": req.RepoURL,
				"branch":     branch,
				"status":     "in_progress",
				"created_at": now,
				"updated_at": now,
				"job_type":   "coverage_scan",
				"start_time": now,
				"progress":   0,
			}

			collection := db.Collection("coverage_jobs")
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_, err = collection.InsertOne(ctx, jobDoc)
			cancel()

			if err != nil {
				log.Printf("ERROR: Failed to save job for branch %s: %v", branch, err)
				continue
			}

			jobStatuses = append(jobStatuses, BranchJobStatus{
				Branch: branch,
				JobID:  jobID,
			})

			jobsMutex.Lock()
			activeJobs[jobID] = &JobStatus{
				ID:         jobID,
				JobType:    "coverage_scan",
				Status:     "in_progress",
				StartTime:  now,
				Repository: req.RepoURL,
				Branch:     branch,
				Progress:   0,
			}
			jobsMutex.Unlock()

			// Start goroutine for each branch scan
			go func(branch, jobID string) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("ERROR: Panic in async coverage scan for branch %s: %v", branch, r)
						updateJobStatus(jobID, "failed", "", "Internal server error")
					}
				}()

				coverageReq := CoverageRequest{
					RepoURL: req.RepoURL,
					Branch:  branch,
					UserID:  userID,
				}

				progressDone := make(chan bool)
				go func() {
					ticker := time.NewTicker(5 * time.Second)
					defer ticker.Stop()
					progress := 10
					for {
						select {
						case <-progressDone:
							return
						case <-ticker.C:
							if progress < 90 {
								progress += 5
								updateJobProgress(jobID, progress)
							}
						}
					}
				}()

				resp, err := scanCoverage(coverageReq, true)
				close(progressDone)

				if err != nil {
					log.Printf("ERROR: Async coverage scan failed for branch %s: %v", branch, err)
					updateJobStatus(jobID, "failed", "", err.Error())
					return
				}

				log.Printf("INFO: Async coverage scan completed successfully for job %s branch %s", jobID, branch)
				updateJobStatus(jobID, "completed", resp.ID, "")
			}(branch, jobID)
		}

		c.JSON(http.StatusAccepted, gin.H{
			"message": fmt.Sprintf("Started %d coverage scans", len(jobStatuses)),
			"jobs":    jobStatuses,
		})
		return
	}

	// Synchronous execution (existing code)
	response := MultiBranchScanResponse{
		RepoURL:      req.RepoURL,
		TotalScanned: len(req.Branches),
		Successful:   0,
		Failed:       0,
		Branches:     make([]BranchScanStatus, 0, len(req.Branches)),
	}

	for _, branch := range req.Branches {
		branchStatus := BranchScanStatus{Branch: branch}
		resp, err := scanCoverage(CoverageRequest{RepoURL: req.RepoURL, Branch: branch}, false)
		if err != nil {
			branchStatus.Status = "failed"
			branchStatus.Error = err.Error()
			response.Failed++
		} else {
			branchStatus.Status = "success"
			branchStatus.Coverage = resp.TotalCoverage
			response.Successful++
		}
		response.Branches = append(response.Branches, branchStatus)
	}

	c.JSON(http.StatusOK, response)
}

func GetBranchCoverage(c *gin.Context) {
	repoURL := c.Query("repo_url")
	if repoURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Repository URL is required"})
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

	pipeline := []bson.M{
		{
			"$match": bson.M{
				"repository": repoURL,
			},
		},
		{
			"$sort": bson.M{"timestamp": -1},
		},
		{
			"$group": bson.M{
				"_id":             "$branch",
				"latest_coverage": bson.M{"$first": "$$ROOT"},
			},
		},
		{
			"$replaceRoot": bson.M{"newRoot": "$latest_coverage"},
		},
		{
			"$project": bson.M{
				"_id":            1,
				"branch":         1,
				"total_coverage": 1,
				"timestamp":      1,
				"commit_hash":    1,
			},
		},
	}

	cursor, err := collection.Aggregate(ctx, pipeline)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query database"})
		return
	}
	defer cursor.Close(ctx)

	type BranchCoverage struct {
		ID            primitive.ObjectID `json:"id" bson:"_id"`
		Branch        string             `json:"branch" bson:"branch"`
		TotalCoverage float64            `json:"total_coverage" bson:"total_coverage"`
		Timestamp     time.Time          `json:"timestamp" bson:"timestamp"`
		CommitHash    string             `json:"commit_hash,omitempty" bson:"commit_hash"`
	}

	var results []BranchCoverage
	if err := cursor.All(ctx, &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode results"})
		return
	}

	if results == nil {
		results = []BranchCoverage{}
	}

	c.JSON(http.StatusOK, results)
}

func CompareBranchCoverage(c *gin.Context) {
	repoURL := c.Query("repo_url")
	if repoURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Repository URL is required"})
		return
	}

	branch1 := c.Query("branch1")
	branch2 := c.Query("branch2")

	if branch1 == "" || branch2 == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Two branches are required for comparison"})
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

	type FileCoverage struct {
		File     string  `bson:"file"`
		Coverage float64 `bson:"coverage"`
	}

	type BranchHistory struct {
		TotalCoverage float64        `bson:"total_coverage"`
		Files         []FileCoverage `bson:"files"`
		Timestamp     time.Time      `bson:"timestamp"`
		CommitHash    string         `bson:"commit_hash"`
	}

	var coverageDoc struct {
		Repository string `bson:"repository"`
		Branches   map[string]struct {
			History []BranchHistory `bson:"history"`
		} `bson:"branches"`
	}

	err = collection.FindOne(ctx, bson.M{"repository": repoURL}).Decode(&coverageDoc)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch coverage document"})
		return
	}

	getLatest := func(branch string) (*BranchHistory, bool) {
		b, ok := coverageDoc.Branches[branch]
		if !ok || len(b.History) == 0 {
			return nil, false
		}
		return &b.History[0], true
	}

	branch1Data, ok1 := getLatest(branch1)
	branch2Data, ok2 := getLatest(branch2)

	if !ok1 || !ok2 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Coverage data not found for one or both branches"})
		return
	}

	type FileDiff struct {
		File      string  `json:"file"`
		Branch1   float64 `json:"branch1"`
		Branch2   float64 `json:"branch2"`
		Diff      float64 `json:"diff"`
		DiffLabel string  `json:"diff_label"`
	}

	branch1Files := make(map[string]float64)
	branch2Files := make(map[string]float64)

	for _, file := range branch1Data.Files {
		branch1Files[file.File] = file.Coverage
	}
	for _, file := range branch2Data.Files {
		branch2Files[file.File] = file.Coverage
	}

	allFiles := make(map[string]bool)
	for file := range branch1Files {
		allFiles[file] = true
	}
	for file := range branch2Files {
		allFiles[file] = true
	}

	var fileDiffs []FileDiff
	for file := range allFiles {
		cov1, ok1 := branch1Files[file]
		cov2, ok2 := branch2Files[file]

		diff := 0.0
		diffLabel := "same"

		if !ok1 {
			diff = cov2
			diffLabel = "new"
			cov1 = 0.0
		} else if !ok2 {
			diff = -cov1
			diffLabel = "removed"
			cov2 = 0.0
		} else {
			diff = cov2 - cov1
			if diff > 0 {
				diffLabel = "better"
			} else if diff < 0 {
				diffLabel = "worse"
			}
		}

		fileDiffs = append(fileDiffs, FileDiff{
			File:      file,
			Branch1:   cov1,
			Branch2:   cov2,
			Diff:      diff,
			DiffLabel: diffLabel,
		})
	}

	response := struct {
		Repository    string     `json:"repository"`
		Branch1       string     `json:"branch1"`
		Branch2       string     `json:"branch2"`
		Coverage1     float64    `json:"coverage1"`
		Coverage2     float64    `json:"coverage2"`
		CoverageDiff  float64    `json:"coverage_diff"`
		DiffLabel     string     `json:"diff_label"`
		FileDiffs     []FileDiff `json:"file_diffs"`
		Branch1Date   string     `json:"branch1_date"`
		Branch2Date   string     `json:"branch2_date"`
		Branch1Commit string     `json:"branch1_commit,omitempty"`
		Branch2Commit string     `json:"branch2_commit,omitempty"`
	}{
		Repository:    repoURL,
		Branch1:       branch1,
		Branch2:       branch2,
		Coverage1:     branch1Data.TotalCoverage,
		Coverage2:     branch2Data.TotalCoverage,
		CoverageDiff:  branch2Data.TotalCoverage - branch1Data.TotalCoverage,
		FileDiffs:     fileDiffs,
		Branch1Date:   branch1Data.Timestamp.Format(time.RFC3339),
		Branch2Date:   branch2Data.Timestamp.Format(time.RFC3339),
		Branch1Commit: branch1Data.CommitHash,
		Branch2Commit: branch2Data.CommitHash,
	}

	if response.CoverageDiff > 0 {
		response.DiffLabel = "better"
	} else if response.CoverageDiff < 0 {
		response.DiffLabel = "worse"
	} else {
		response.DiffLabel = "same"
	}

	c.JSON(http.StatusOK, response)
}

func GetBranchesWithHistory(c *gin.Context) {
	repoURL := c.Query("repo_url")
	if repoURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Repository URL is required"})
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

	var doc struct {
		Branches map[string]interface{} `bson:"branches"`
	}
	err = collection.FindOne(ctx, bson.M{"repository": repoURL}).Decode(&doc)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"branches": []string{}})
		return
	}

	branches := make([]string, 0, len(doc.Branches))
	for branch := range doc.Branches {
		branches = append(branches, branch)
	}

	c.JSON(http.StatusOK, gin.H{"branches": branches})
}
