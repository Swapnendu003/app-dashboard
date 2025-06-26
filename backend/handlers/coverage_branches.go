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

type MultiBranchScanRequest struct {
	RepoURL  string   `json:"repo_url" binding:"required"`
	Branches []string `json:"branches" binding:"required"`
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

func ScanMultipleBranches(c *gin.Context) {
	var req MultiBranchScanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if len(req.Branches) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "At least one branch must be specified"})
		return
	}

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

	getBranchData := func(branch string) (*models.CoverageHistory, error) {
		opts := options.FindOne().SetSort(bson.M{"timestamp": -1})
		var result models.CoverageHistory
		err := collection.FindOne(ctx, bson.M{
			"repository": repoURL,
			"branch":     branch,
		}, opts).Decode(&result)

		if err != nil {
			return nil, err
		}

		return &result, nil
	}

	branch1Data, err1 := getBranchData(branch1)
	branch2Data, err2 := getBranchData(branch2)

	if err1 != nil || err2 != nil {
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
