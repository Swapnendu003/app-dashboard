package handlers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/mongo/options"
	"github.com/yourusername/backend/javautils"
	"github.com/gin-gonic/gin"
	"github.com/yourusername/backend/config"
	"github.com/yourusername/backend/goutils"
	"github.com/yourusername/backend/jsutils"
	"github.com/yourusername/backend/models"
	"github.com/yourusername/backend/pythonutils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type CoverageRequest struct {
	RepoURL string             `json:"repo_url" binding:"required"`
	Branch  string             `json:"branch"`
	UserID  primitive.ObjectID `json:"user_id"`
}

type CoverageAsyncRequest struct {
	RepoURL string `json:"repo_url" binding:"required"`
	Branch  string `json:"branch"`
	Async   bool   `json:"async"`
}

type FileCoverage struct {
	File     string  `json:"file"`
	Coverage float64 `json:"coverage"`
	Error    string  `json:"error,omitempty"`
	Status   string  `json:"status"` // "Success" or "Failure"
}

type CoverageResponse struct {
	TotalCoverage float64        `json:"total_coverage"`
	Files         []FileCoverage `json:"files"`
	ID            string         `json:"id,omitempty"`
	Repository    string         `json:"repository,omitempty"`
	Branch        string         `json:"branch,omitempty"`
	Timestamp     string         `json:"timestamp,omitempty"`
	CommitHash    string         `json:"commit_hash,omitempty"`
}

type JobStatus struct {
	ID         string     `json:"id"`
	JobType    string     `json:"job_type"`
	Status     string     `json:"status"`
	StartTime  time.Time  `json:"start_time"`
	EndTime    *time.Time `json:"end_time,omitempty"`
	ResultID   string     `json:"result_id,omitempty"`
	Error      string     `json:"error,omitempty"`
	Repository string     `json:"repository"`
	Branch     string     `json:"branch,omitempty"`
	Progress   int        `json:"progress"`
}

var completedJobs = make(map[string]*JobStatus)
var activeJobs = make(map[string]*JobStatus)
var jobsMutex sync.RWMutex

// Job management functions (unchanged)
func isJobComplete(jobID string) (bool, *JobStatus) {
	jobsMutex.RLock()
	defer jobsMutex.RUnlock()

	if job, exists := completedJobs[jobID]; exists {
		return true, job
	}
	return false, nil
}

func markJobComplete(jobID string, status string, resultID string, err string) {
	jobsMutex.Lock()
	defer jobsMutex.Unlock()

	if job, exists := activeJobs[jobID]; exists {
		job.Status = status
		now := time.Now()
		job.EndTime = &now
		job.ResultID = resultID
		job.Error = err
		job.Progress = 100

		go func(id string) {
			time.Sleep(5 * time.Minute)
			jobsMutex.Lock()
			delete(activeJobs, id)
			jobsMutex.Unlock()
		}(jobID)
	}

	completedJobs[jobID] = &JobStatus{
		ID:        jobID,
		Status:    status,
		StartTime: time.Now(),
		EndTime:   nil,
		ResultID:  resultID,
		Error:     err,
	}

	go func(id string) {
		time.Sleep(30 * time.Minute)
		jobsMutex.Lock()
		delete(completedJobs, id)
		jobsMutex.Unlock()
	}(jobID)
}

func RunCoverageScan(c *gin.Context) {
	var req CoverageAsyncRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("ERROR: Invalid coverage scan request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	log.Printf("INFO: Starting coverage scan for repo: %s, branch: %s", req.RepoURL, req.Branch)

	if req.Async {
		log.Printf("INFO: Starting asynchronous coverage scan for large repo")
		jobID := primitive.NewObjectID().Hex()
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
			log.Printf("ERROR: Failed to connect to database: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
			return
		}

		collection := db.Collection("coverage_jobs")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		now := time.Now()
		jobDoc := bson.M{
			"job_id":     jobID,
			"repository": req.RepoURL,
			"branch":     req.Branch,
			"status":     "in_progress",
			"created_at": now,
			"updated_at": now,
			"job_type":   "coverage_scan",
			"start_time": now,
			"progress":   0,
		}

		_, err = collection.InsertOne(ctx, jobDoc)
		if err != nil {
			log.Printf("ERROR: Failed to save job to database: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create job"})
			return
		}

		jobsMutex.Lock()
		activeJobs[jobID] = &JobStatus{
			ID:         jobID,
			JobType:    "coverage_scan",
			Status:     "in_progress",
			StartTime:  now,
			Repository: req.RepoURL,
			Branch:     req.Branch,
			Progress:   0,
		}
		jobsMutex.Unlock()

		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("ERROR: Panic in async coverage scan: %v", r)
					updateJobStatus(jobID, "failed", "", "Internal server error")
				}
			}()

			coverageReq := CoverageRequest{
				RepoURL: req.RepoURL,
				Branch:  req.Branch,
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
				log.Printf("ERROR: Async coverage scan failed: %v", err)
				updateJobStatus(jobID, "failed", "", err.Error())
				return
			}

			log.Printf("INFO: Async coverage scan completed successfully for job %s", jobID)
			updateJobStatus(jobID, "completed", resp.ID, "")
		}()

		c.JSON(http.StatusAccepted, gin.H{"job_id": jobID, "status": "in_progress"})
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

	coverageReq := CoverageRequest{
		RepoURL: req.RepoURL,
		Branch:  req.Branch,
		UserID:  userID,
	}
	resp, err := scanCoverage(coverageReq, false)
	if err != nil {
		log.Printf("ERROR: Coverage scan failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func updateJobStatus(jobID, status, resultID, errorMsg string) {
	db, err := config.ConnectDB()
	if err != nil {
		log.Printf("ERROR: Failed to connect to database to update job status: %v", err)
		return
	}

	collection := db.Collection("coverage_jobs")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now()
	update := bson.M{
		"$set": bson.M{
			"status":     status,
			"updated_at": now,
		},
	}

	if status == "completed" || status == "failed" {
		update["$set"].(bson.M)["end_time"] = now
		update["$set"].(bson.M)["progress"] = 100
	}

	if resultID != "" {
		update["$set"].(bson.M)["result_id"] = resultID
	}

	if errorMsg != "" {
		update["$set"].(bson.M)["error"] = errorMsg
	}

	_, err = collection.UpdateOne(ctx, bson.M{"job_id": jobID}, update)
	if err != nil {
		log.Printf("ERROR: Failed to update job status in database: %v", err)
	} else {
		log.Printf("INFO: Updated job %s status to %s", jobID, status)
		if status == "completed" || status == "failed" {
			markJobComplete(jobID, status, resultID, errorMsg)
		}
	}

	jobsMutex.Lock()
	if job, exists := activeJobs[jobID]; exists {
		job.Status = status
		if status == "completed" || status == "failed" {
			endTime := time.Now()
			job.EndTime = &endTime
			job.Progress = 100
		}
		if resultID != "" {
			job.ResultID = resultID
		}
		if errorMsg != "" {
			job.Error = errorMsg
		}
	}
	jobsMutex.Unlock()
}

func updateJobProgress(jobID string, progress int) {
	db, err := config.ConnectDB()
	if err != nil {
		log.Printf("ERROR: Failed to connect to database to update job progress: %v", err)
		return
	}

	collection := db.Collection("coverage_jobs")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	update := bson.M{
		"$set": bson.M{
			"progress":   progress,
			"updated_at": time.Now(),
		},
	}

	_, err = collection.UpdateOne(ctx, bson.M{"job_id": jobID}, update)
	if err != nil {
		log.Printf("ERROR: Failed to update job progress in database: %v", err)
	}

	jobsMutex.Lock()
	if job, exists := activeJobs[jobID]; exists {
		job.Progress = progress
	}
	jobsMutex.Unlock()
}

func ListActiveJobs(c *gin.Context) {
	jobsMutex.RLock()
	jobs := make([]*JobStatus, 0, len(activeJobs))
	for _, job := range activeJobs {
		jobs = append(jobs, job)
	}
	jobsMutex.RUnlock()

	db, err := config.ConnectDB()
	if err != nil {
		log.Printf("ERROR: Failed to connect to database: %v", err)
		c.JSON(http.StatusOK, jobs)
		return
	}

	collection := db.Collection("coverage_jobs")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	oneHourAgo := time.Now().Add(-1 * time.Hour)

	filter := bson.M{
		"$or": []bson.M{
			{"status": "in_progress"},
			{"updated_at": bson.M{"$gt": oneHourAgo}},
		},
	}

	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		log.Printf("ERROR: Failed to query jobs: %v", err)
		c.JSON(http.StatusOK, jobs)
		return
	}
	defer cursor.Close(ctx)

	var dbJobs []struct {
		JobID      string     `bson:"job_id"`
		JobType    string     `bson:"job_type"`
		Status     string     `bson:"status"`
		StartTime  time.Time  `bson:"start_time"`
		EndTime    *time.Time `bson:"end_time"`
		Repository string     `bson:"repository"`
		Branch     string     `bson:"branch"`
		Progress   int        `bson:"progress"`
		ResultID   string     `bson:"result_id"`
		Error      string     `bson:"error"`
	}

	if err := cursor.All(ctx, &dbJobs); err != nil {
		log.Printf("ERROR: Failed to decode jobs: %v", err)
		c.JSON(http.StatusOK, jobs)
		return
	}

	jobMap := make(map[string]bool)
	for _, job := range jobs {
		jobMap[job.ID] = true
	}

	for _, dbJob := range dbJobs {
		if !jobMap[dbJob.JobID] {
			jobs = append(jobs, &JobStatus{
				ID:         dbJob.JobID,
				JobType:    dbJob.JobType,
				Status:     dbJob.Status,
				StartTime:  dbJob.StartTime,
				EndTime:    dbJob.EndTime,
				Repository: dbJob.Repository,
				Branch:     dbJob.Branch,
				Progress:   dbJob.Progress,
				ResultID:   dbJob.ResultID,
				Error:      dbJob.Error,
			})
		}
	}

	c.JSON(http.StatusOK, jobs)
}

func CancelJob(c *gin.Context) {
	jobID := c.Param("job_id")
	if jobID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Job ID is required"})
		return
	}

	var jobExists bool
	jobsMutex.RLock()
	job, exists := activeJobs[jobID]
	jobExists = exists
	jobsMutex.RUnlock()

	if !jobExists {
		db, err := config.ConnectDB()
		if err != nil {
			log.Printf("ERROR: Failed to connect to database: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
			return
		}

		collection := db.Collection("coverage_jobs")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var dbJob struct {
			Status string `bson:"status"`
		}

		err = collection.FindOne(ctx, bson.M{"job_id": jobID}).Decode(&dbJob)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check job"})
			}
			return
		}

		if dbJob.Status != "in_progress" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Can only cancel jobs that are in progress"})
			return
		}

		jobExists = true
	} else if job.Status != "in_progress" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Can only cancel jobs that are in progress"})
		return
	}

	if jobExists {
		updateJobStatus(jobID, "failed", "", "Job cancelled by user")
		c.JSON(http.StatusOK, gin.H{"message": "Job cancelled successfully"})
		return
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
}

func GetCoverageJobStatus(c *gin.Context) {
	jobID := c.Param("job_id")
	if isComplete, jobStatus := isJobComplete(jobID); isComplete {
		log.Printf("Returning cached job status for %s: %s", jobID, jobStatus.Status)
		c.JSON(http.StatusOK, jobStatus)
		return
	}

	db, err := config.ConnectDB()
	if err != nil {
		log.Printf("Failed to connect to database: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection failed"})
		return
	}

	collection := db.Collection("coverage_jobs")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var jobStatus JobStatus
	err = collection.FindOne(ctx, bson.M{"job_id": jobID}).Decode(&jobStatus)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get job status"})
		}
		return
	}

	if jobStatus.Status == "completed" || jobStatus.Status == "failed" {
		markJobComplete(jobID, jobStatus.Status, jobStatus.ResultID, jobStatus.Error)
	}

	c.JSON(http.StatusOK, jobStatus)
}

func scanCoverage(req CoverageRequest, saveHistory bool) (CoverageResponse, error) {
	logPrefix := fmt.Sprintf("[Repo: %s, Branch: %s]", req.RepoURL, req.Branch)
	log.Printf("INFO: %s Starting optimized coverage scan", logPrefix)

	tmpDir, err := os.MkdirTemp("", "covscan")
	if err != nil {
		log.Printf("ERROR: %s Failed to create temp directory: %v", logPrefix, err)
		return CoverageResponse{}, err
	}
	defer func() {
		log.Printf("INFO: %s Cleaning up temp directory: %s", logPrefix, tmpDir)
		os.RemoveAll(tmpDir)
	}()

	// Clone repository
	args := []string{"clone", "--depth", "1", "--single-branch"}
	if req.Branch != "" {
		args = append(args, "-b", req.Branch)
	}
	args = append(args, req.RepoURL, tmpDir)

	log.Printf("INFO: %s Running git clone command: git %s", logPrefix, strings.Join(args, " "))

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	clone := exec.CommandContext(ctx, "git", args...)
	if out, err := clone.CombinedOutput(); err != nil {
		log.Printf("ERROR: %s Git clone failed: %v, output: %s", logPrefix, err, string(out))
		return CoverageResponse{}, errors.New("Git clone failed: " + string(out))
	}
	log.Printf("INFO: %s Successfully cloned repository to %s", logPrefix, tmpDir)

	// MODIFIED: Analyze project structure (added Java)
	var totalGoFiles, totalPyFiles, totalJSFiles, totalTSFiles, totalJavaFiles int
	var totalGoTestFiles, totalPyTestFiles, totalJSTestFiles, totalJavaTestFiles int

	filepath.Walk(tmpDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		filename := info.Name()
		ext := strings.ToLower(filepath.Ext(filename))

		switch ext {
		case ".go":
			if strings.HasSuffix(filename, "_test.go") {
				totalGoTestFiles++
			} else {
				totalGoFiles++
			}
		case ".py":
			if strings.Contains(filename, "test") {
				totalPyTestFiles++
			} else {
				totalPyFiles++
			}
		case ".js", ".jsx":
			if isJSTestFile(filename) {
				totalJSTestFiles++
			} else {
				totalJSFiles++
			}
		case ".ts", ".tsx":
			if isJSTestFile(filename) {
				totalJSTestFiles++
			} else {
				totalTSFiles++
			}
		case ".java":  
			if isJavaTestFile(filename) {
				totalJavaTestFiles++
			} else {
				totalJavaFiles++
			}
		}
		return nil
	})

	totalJSFilesTotal := totalJSFiles + totalTSFiles
	// MODIFIED: Updated log message to include Java
	log.Printf("INFO: %s Repository contains %d Go files (%d tests), %d Python files (%d tests), %d JS/TS files (%d tests), and %d Java files (%d tests)",
		logPrefix, totalGoFiles, totalGoTestFiles, totalPyFiles, totalPyTestFiles, totalJSFilesTotal, totalJSTestFiles, totalJavaFiles, totalJavaTestFiles)

	// Diagnose JavaScript project if present
	if totalJSFilesTotal > 0 {
		jsutils.DiagnoseJSProject(tmpDir, logPrefix)
	}

	// ADDED: Diagnose Java project if present
	if totalJavaFiles > 0 {
		javautils.DiagnoseJavaProject(tmpDir, logPrefix)
	}

	// Check for custom coverage script
	script := ""
	cfgPath := filepath.Join(tmpDir, ".keploy.yaml")
	if data, err := os.ReadFile(cfgPath); err == nil {
		log.Printf("INFO: %s Found .keploy.yaml, parsing for coverage script", logPrefix)
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "coverage:") {
				script = strings.TrimSpace(strings.TrimPrefix(line, "coverage:"))
				log.Printf("INFO: %s Found coverage script: %s", logPrefix, script)
				break
			}
		}
	}

	var resp CoverageResponse
	var coverageFound bool
	projectType := detectProjectType(tmpDir, logPrefix)

	// MODIFIED: Determine if project is mixed (added Java combinations)
	isGoAndPython := totalGoFiles > 0 && totalPyFiles > 0
	isGoAndJS := totalGoFiles > 0 && totalJSFilesTotal > 0
	isGoAndJava := totalGoFiles > 0 && totalJavaFiles > 0
	isPythonAndJS := totalPyFiles > 0 && totalJSFilesTotal > 0
	isPythonAndJava := totalPyFiles > 0 && totalJavaFiles > 0
	isJSAndJava := totalJSFilesTotal > 0 && totalJavaFiles > 0
	isMultiLanguage := (isGoAndPython || isGoAndJS || isGoAndJava || 
						isPythonAndJS || isPythonAndJava || isJSAndJava ||
						(totalGoFiles > 0 && totalPyFiles > 0 && totalJSFilesTotal > 0) ||
						(totalGoFiles > 0 && totalPyFiles > 0 && totalJavaFiles > 0) ||
						(totalGoFiles > 0 && totalJSFilesTotal > 0 && totalJavaFiles > 0) ||
						(totalPyFiles > 0 && totalJSFilesTotal > 0 && totalJavaFiles > 0) ||
						(totalGoFiles > 0 && totalPyFiles > 0 && totalJSFilesTotal > 0 && totalJavaFiles > 0))

	// Custom script execution (highest priority)
	if !coverageFound && script != "" {
		log.Printf("INFO: %s Running custom coverage script: %s", logPrefix, script)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()

		cmd := exec.CommandContext(ctx, "sh", "-c", script)
		cmd.Dir = tmpDir
		if out, err := cmd.CombinedOutput(); err != nil {
			log.Printf("ERROR: %s Custom script execution failed: %v, output: %s", logPrefix, err, string(out))
		} else {
			log.Printf("INFO: %s Custom script executed successfully", logPrefix)
			coverageFile := filepath.Join(tmpDir, "coverage.out")
			if fileExists(coverageFile) {
				if goResp, err := goutils.RunGoCoverage(tmpDir, logPrefix); err == nil {
					resp = convertGoResponse(goResp)
					coverageFound = true
				}
			}
		}
	}

	// MODIFIED: Handle mixed language projects (updated call)
	if !coverageFound && isMultiLanguage {
		log.Printf("INFO: %s Detected multi-language project, scanning all languages", logPrefix)
		resp, coverageFound = handleMixedLanguageProject(tmpDir, logPrefix,
			totalGoFiles, totalPyFiles, totalJSFilesTotal, totalJavaFiles)
	}

	// Single language project handling
	if !coverageFound {
		switch projectType {
		case "java":  // ADDED JAVA CASE
			log.Printf("INFO: %s Running Java coverage (primary language)", logPrefix)
			javaResp, javaErr := javautils.RunJavaCoverage(tmpDir, logPrefix)
			if javaErr == nil && javaResp.TotalCoverage > 0 {
				resp = convertJavaResponse(javaResp)
				coverageFound = true
				log.Printf("INFO: %s Java coverage succeeded: %.2f%%", logPrefix, resp.TotalCoverage)
			} else {
				log.Printf("WARNING: %s Java coverage failed: %v", logPrefix, javaErr)
			}
		case "javascript":
			log.Printf("INFO: %s Running JavaScript coverage (primary language)", logPrefix)
			jsResp, jsErr := jsutils.RunJSCoverage(tmpDir, logPrefix)
			if jsErr == nil && jsResp.TotalCoverage > 0 {
				resp = convertJSResponse(jsResp)
				coverageFound = true
				log.Printf("INFO: %s JavaScript coverage succeeded: %.2f%%", logPrefix, resp.TotalCoverage)
			} else {
				log.Printf("WARNING: %s JavaScript coverage failed: %v", logPrefix, jsErr)
			}
		case "python":
			log.Printf("INFO: %s Running Python coverage (primary language)", logPrefix)
			pythonResp, pythonErr := pythonutils.RunPythonCoverage(tmpDir, logPrefix)
			if pythonErr == nil && pythonResp.TotalCoverage > 0 {
				resp = convertPythonResponse(pythonResp)
				coverageFound = true
				log.Printf("INFO: %s Python coverage succeeded: %.2f%%", logPrefix, resp.TotalCoverage)
			} else {
				log.Printf("WARNING: %s Python coverage failed: %v", logPrefix, pythonErr)
			}
		default: // "go" or unknown, try Go first
			log.Printf("INFO: %s Starting Go coverage analysis", logPrefix)
			if goutils.DetectGoProject(tmpDir) {
				goResp, goErr := goutils.RunGoCoverage(tmpDir, logPrefix)
				if goErr == nil && goResp.TotalCoverage > 0 {
					resp = convertGoResponse(goResp)
					coverageFound = true
					log.Printf("INFO: %s Go coverage succeeded: %.2f%%", logPrefix, resp.TotalCoverage)
				} else {
					log.Printf("WARNING: %s Go coverage failed: %v", logPrefix, goErr)
				}
			} else {
				// MODIFIED: Try other languages as fallback (added Java)
				if totalJavaFiles > 0 {
					log.Printf("INFO: %s No Go code found, trying Java fallback", logPrefix)
					if javaResp, javaErr := javautils.EstimateJavaCoverage(tmpDir, logPrefix); javaErr == nil {
						resp = convertJavaResponse(javaResp)
						coverageFound = true
					}
				} else if totalJSFilesTotal > 0 {
					log.Printf("INFO: %s No Go code found, trying JavaScript fallback", logPrefix)
					if jsResp, jsErr := jsutils.EstimateJSCoverage(tmpDir, logPrefix); jsErr == nil {
						resp = convertJSResponse(jsResp)
						coverageFound = true
					}
				} else if totalPyFiles > 0 {
					log.Printf("INFO: %s No Go code found, trying Python fallback", logPrefix)
					if pythonResp, pythonErr := pythonutils.EstimatePythonCoverage(tmpDir, logPrefix); pythonErr == nil {
						resp = convertPythonResponse(pythonResp)
						coverageFound = true
					}
				}

				if !coverageFound {
					log.Printf("ERROR: %s No code found in repository", logPrefix)
					return CoverageResponse{}, errors.New("No code found in repository")
				}
			}
		}
	}

	// MODIFIED: Final fallback attempts (added Java)
	if !coverageFound {
		log.Printf("WARNING: %s Primary methods failed, trying final fallbacks", logPrefix)

		// Try Java if not already tried
		if totalJavaFiles > 0 && projectType != "java" {
			if javaResp, javaErr := javautils.EstimateJavaCoverage(tmpDir, logPrefix); javaErr == nil {
				resp = convertJavaResponse(javaResp)
				coverageFound = true
				log.Printf("INFO: %s Java estimation fallback succeeded: %.2f%%", logPrefix, resp.TotalCoverage)
			}
		}

		// Try JavaScript if not already tried
		if !coverageFound && totalJSFilesTotal > 0 && projectType != "javascript" {
			if jsResp, jsErr := jsutils.EstimateJSCoverage(tmpDir, logPrefix); jsErr == nil {
				resp = convertJSResponse(jsResp)
				coverageFound = true
				log.Printf("INFO: %s JavaScript estimation fallback succeeded: %.2f%%", logPrefix, resp.TotalCoverage)
			}
		}

		// Try Python if not already tried
		if !coverageFound && totalPyFiles > 0 && projectType != "python" {
			if pythonResp, pythonErr := pythonutils.EstimatePythonCoverage(tmpDir, logPrefix); pythonErr == nil {
				resp = convertPythonResponse(pythonResp)
				coverageFound = true
				log.Printf("INFO: %s Python estimation fallback succeeded: %.2f%%", logPrefix, resp.TotalCoverage)
			}
		}

		// Try Go estimation if not already tried
		if !coverageFound && totalGoFiles > 0 && projectType != "go" {
			if goResp, goErr := goutils.EstimateGoCoverage(tmpDir, logPrefix); goErr == nil {
				resp = convertGoResponse(goResp)
				coverageFound = true
				log.Printf("INFO: %s Go estimation fallback succeeded: %.2f%%", logPrefix, resp.TotalCoverage)
			}
		}
	}

	if !coverageFound {
		return CoverageResponse{}, errors.New("unable to calculate coverage for this repository")
	}

	// Get commit hash and save history
	commitHash := ""
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = tmpDir
	if out, err := cmd.Output(); err == nil {
		commitHash = strings.TrimSpace(string(out))
		log.Printf("INFO: %s Got commit hash: %s", logPrefix, commitHash)
	}

	if saveHistory {
		log.Printf("INFO: %s Saving coverage history to database", logPrefix)
		db, err := config.ConnectDB()
		if err == nil {
			collection := db.Collection("coverage_history")
			now := time.Now()
			var files []models.FileCoverage
			for _, f := range resp.Files {
				files = append(files, models.FileCoverage{
					File:     f.File,
					Coverage: f.Coverage,
					Status:   f.Status,
					Error:    f.Error,
				})
			}

			scanRecord := models.ScanRecord{
				TotalCoverage: resp.TotalCoverage,
				Files:         files,
				Timestamp:     now,
				CommitHash:    commitHash,
			}

			filter := bson.M{
				"repository": req.RepoURL,
				"user_id":    req.UserID,
			}
			update := bson.M{
				"$set": bson.M{
					"total_coverage": resp.TotalCoverage,
					"files":          files,
					"timestamp":      now,
					"commit_hash":    commitHash,
				},
				"$inc": bson.M{
					"number_of_scans": 1,
				},
				"$push": bson.M{
					"scan_history": scanRecord,
				},
			}
			opts := options.Update().SetUpsert(true)
			_, err := collection.UpdateOne(ctx, filter, update, opts)
			if err != nil {
				log.Printf("WARNING: %s Failed to upsert coverage history: %v", logPrefix, err)
			} else {
				log.Printf("INFO: %s Successfully upserted coverage history", logPrefix)
			}

			repoCollection := db.Collection("repositories")
			update = bson.M{
				"$set": bson.M{
					"coverage":         resp.TotalCoverage,
					"last_coverage_at": now,
				},
			}
			filter = bson.M{
				"$or": []bson.M{
					{"url": req.RepoURL},
					{"html_url": req.RepoURL},
					{"full_name": strings.TrimPrefix(strings.TrimPrefix(req.RepoURL, "https://github.com/"), "https://api.github.com/repos/")},
				},
			}
			_, err = repoCollection.UpdateOne(ctx, filter, update)
			if err != nil {
				log.Printf("WARNING: %s Failed to update repository coverage: %v", logPrefix, err)
			} else {
				log.Printf("INFO: %s Successfully updated repository coverage to %.2f%%", logPrefix, resp.TotalCoverage)
			}

			log.Printf("INFO: %s Successfully saved coverage history", logPrefix)
		} else {
			log.Printf("WARNING: %s Failed to save coverage history: %v", logPrefix, err)
		}
	}

	log.Printf("INFO: %s Coverage scan completed successfully. Total coverage: %.2f%%",
		logPrefix, resp.TotalCoverage)
	return resp, nil
}

// Helper function to handle mixed language projects
// 

func handleMixedLanguageProject(tmpDir, logPrefix string, totalGoFiles, totalPyFiles, totalJSFiles, totalJavaFiles int) (CoverageResponse, bool) {
	log.Printf("INFO: %s Processing mixed language project", logPrefix)

	var responses []CoverageResponse
	var weights []float64
	var totalFiles = totalGoFiles + totalPyFiles + totalJSFiles + totalJavaFiles

	// Try Go coverage
	if totalGoFiles > 0 {
		log.Printf("INFO: %s Attempting Go coverage analysis", logPrefix)
		if goutils.DetectGoProject(tmpDir) {
			if goResp, goErr := goutils.RunGoCoverage(tmpDir, logPrefix); goErr == nil && goResp.TotalCoverage > 0 {
				responses = append(responses, convertGoResponse(goResp))
				weights = append(weights, float64(totalGoFiles)/float64(totalFiles))
				log.Printf("INFO: %s Go coverage: %.2f%% (weight: %.2f)",
					logPrefix, goResp.TotalCoverage, float64(totalGoFiles)/float64(totalFiles))
			} else {
				log.Printf("WARNING: %s Go coverage failed: %v", logPrefix, goErr)
			}
		} else {
			log.Printf("WARNING: %s No Go project detected", logPrefix)
		}
	}

	// ADDED: Try Java coverage
	if totalJavaFiles > 0 {
		log.Printf("INFO: %s Attempting Java coverage analysis", logPrefix)
		javaResp, javaErr := javautils.RunJavaCoverage(tmpDir, logPrefix)
		if javaErr == nil && javaResp.TotalCoverage > 0 {
			responses = append(responses, convertJavaResponse(javaResp))
			weights = append(weights, float64(totalJavaFiles)/float64(totalFiles))
			log.Printf("INFO: %s Java coverage: %.2f%% (weight: %.2f)",
				logPrefix, javaResp.TotalCoverage, float64(totalJavaFiles)/float64(totalFiles))
		} else {
			log.Printf("WARNING: %s Java coverage failed: %v, trying estimation", logPrefix, javaErr)
			if javaEstResp, estErr := javautils.EstimateJavaCoverage(tmpDir, logPrefix); estErr == nil && javaEstResp.TotalCoverage > 0 {
				responses = append(responses, convertJavaResponse(javaEstResp))
				weights = append(weights, float64(totalJavaFiles)/float64(totalFiles))
				log.Printf("INFO: %s Java coverage (estimated): %.2f%% (weight: %.2f)",
					logPrefix, javaEstResp.TotalCoverage, float64(totalJavaFiles)/float64(totalFiles))
			} else {
				log.Printf("ERROR: %s Java estimation also failed: %v", logPrefix, estErr)
			}
		}
	}

	// Try Python coverage
	if totalPyFiles > 0 {
		log.Printf("INFO: %s Attempting Python coverage analysis", logPrefix)
		pythonResp, pythonErr := pythonutils.RunPythonCoverage(tmpDir, logPrefix)
		if pythonErr == nil && pythonResp.TotalCoverage > 0 {
			responses = append(responses, convertPythonResponse(pythonResp))
			weights = append(weights, float64(totalPyFiles)/float64(totalFiles))
			log.Printf("INFO: %s Python coverage: %.2f%% (weight: %.2f)",
				logPrefix, pythonResp.TotalCoverage, float64(totalPyFiles)/float64(totalFiles))
		} else {
			log.Printf("WARNING: %s Python coverage failed: %v", logPrefix, pythonErr)
		}
	}

	// Try JavaScript coverage
	if totalJSFiles > 0 {
		log.Printf("INFO: %s Attempting JavaScript coverage analysis", logPrefix)
		jsResp, jsErr := jsutils.RunJSCoverage(tmpDir, logPrefix)
		if jsErr != nil {
			log.Printf("WARNING: %s JavaScript coverage failed, trying estimation: %v", logPrefix, jsErr)
			if jsEstResp, estErr := jsutils.EstimateJSCoverage(tmpDir, logPrefix); estErr == nil && jsEstResp.TotalCoverage > 0 {
				responses = append(responses, convertJSResponse(jsEstResp))
				weights = append(weights, float64(totalJSFiles)/float64(totalFiles))
				log.Printf("INFO: %s JavaScript coverage (estimated): %.2f%% (weight: %.2f)",
					logPrefix, jsEstResp.TotalCoverage, float64(totalJSFiles)/float64(totalFiles))
			} else {
				log.Printf("ERROR: %s JavaScript estimation also failed: %v", logPrefix, estErr)
			}
		} else if jsResp.TotalCoverage > 0 {
			responses = append(responses, convertJSResponse(jsResp))
			weights = append(weights, float64(totalJSFiles)/float64(totalFiles))
			log.Printf("INFO: %s JavaScript coverage: %.2f%% (weight: %.2f)",
				logPrefix, jsResp.TotalCoverage, float64(totalJSFiles)/float64(totalFiles))
		} else {
			log.Printf("WARNING: %s JavaScript coverage returned 0%%, trying estimation", logPrefix)
			if jsEstResp, estErr := jsutils.EstimateJSCoverage(tmpDir, logPrefix); estErr == nil && jsEstResp.TotalCoverage > 0 {
				responses = append(responses, convertJSResponse(jsEstResp))
				weights = append(weights, float64(totalJSFiles)/float64(totalFiles))
				log.Printf("INFO: %s JavaScript coverage (estimated): %.2f%% (weight: %.2f)",
					logPrefix, jsEstResp.TotalCoverage, float64(totalJSFiles)/float64(totalFiles))
			}
		}
	}

	// Combine results if we have any
	if len(responses) == 0 {
		log.Printf("ERROR: %s No coverage results from any language", logPrefix)
		return CoverageResponse{}, false
	}

	if len(responses) == 1 {
		log.Printf("INFO: %s Using single language result: %.2f%%", logPrefix, responses[0].TotalCoverage)
		return responses[0], true
	}

	// Calculate weighted average
	var totalCoverage float64
	var allFiles []FileCoverage

	for i, resp := range responses {
		totalCoverage += resp.TotalCoverage * weights[i]
		allFiles = append(allFiles, resp.Files...)
	}

	log.Printf("INFO: %s Combined coverage for mixed project: %.2f%% from %d languages",
		logPrefix, totalCoverage, len(responses))

	return CoverageResponse{
		TotalCoverage: totalCoverage,
		Files:         allFiles,
	}, true
}



// Conversion functions for different language responses
func convertGoResponse(goResp goutils.GoCoverageResponse) CoverageResponse {
	var files []FileCoverage
	for _, f := range goResp.Files {
		status := "Success"
		if f.Error != "" {
			status = "Failure"
		}
		files = append(files, FileCoverage{
			File:     f.File,
			Coverage: f.Coverage,
			Error:    f.Error,
			Status:   status,
		})
	}

	return CoverageResponse{
		TotalCoverage: goResp.TotalCoverage,
		Files:         files,
		ID:            goResp.ID,
		Repository:    goResp.Repository,
		Branch:        goResp.Branch,
		Timestamp:     goResp.Timestamp,
		CommitHash:    goResp.CommitHash,
	}
}

func convertJSResponse(jsResp jsutils.JSCoverageResponse) CoverageResponse {
	var files []FileCoverage
	for _, f := range jsResp.Files {
		status := "Success"
		if f.Error != "" {
			status = "Failure"
		}
		files = append(files, FileCoverage{
			File:     f.File,
			Coverage: f.Coverage,
			Error:    f.Error,
			Status:   status,
		})
	}

	return CoverageResponse{
		TotalCoverage: jsResp.TotalCoverage,
		Files:         files,
		ID:            jsResp.ID,
		Repository:    jsResp.Repository,
		Branch:        jsResp.Branch,
		Timestamp:     jsResp.Timestamp,
		CommitHash:    jsResp.CommitHash,
	}
}

func convertPythonResponse(pythonResp pythonutils.PythonCoverageResponse) CoverageResponse {
	var files []FileCoverage
	for _, f := range pythonResp.Files {
		status := "Success"
		if f.Error != "" {
			status = "Failure"
		}
		files = append(files, FileCoverage{
			File:     f.File,
			Coverage: f.Coverage,
			Error:    f.Error,
			Status:   status,
		})
	}

	return CoverageResponse{
		TotalCoverage: pythonResp.TotalCoverage,
		Files:         files,
		ID:            pythonResp.ID,
		Repository:    pythonResp.Repository,
		Branch:        pythonResp.Branch,
		Timestamp:     pythonResp.Timestamp,
		CommitHash:    pythonResp.CommitHash,
	}
}

// Utility functions
func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func isJSTestFile(filename string) bool {
	lowerName := strings.ToLower(filename)
	return strings.Contains(lowerName, "test") ||
		strings.Contains(lowerName, "spec") ||
		strings.HasSuffix(lowerName, ".test.js") ||
		strings.HasSuffix(lowerName, ".test.ts") ||
		strings.HasSuffix(lowerName, ".spec.js") ||
		strings.HasSuffix(lowerName, ".spec.ts") ||
		strings.HasSuffix(lowerName, ".test.jsx") ||
		strings.HasSuffix(lowerName, ".test.tsx") ||
		strings.HasSuffix(lowerName, ".spec.jsx") ||
		strings.HasSuffix(lowerName, ".spec.tsx")
}



func detectProjectType(dir string, logPrefix string) string {
	log.Printf("INFO: %s Analyzing project structure for primary language", logPrefix)

	// ADDED: Check for Java project first
	if javautils.DetectJavaProject(dir) {
		javaProjectInfo := javautils.DetectJavaProjectInfo(dir, logPrefix)

		// Prioritize certain Java project types
		if javaProjectInfo.Type == javautils.SpringBootProject ||
			javaProjectInfo.Type == javautils.QuarkusProject ||
			javaProjectInfo.Type == javautils.MicronautProject ||
			javaProjectInfo.Type == javautils.MavenProject ||
			javaProjectInfo.Type == javautils.GradleProject {
			log.Printf("INFO: %s Detected Java project type: %v with build tool: %v", 
				logPrefix, javaProjectInfo.Type, javaProjectInfo.BuildTool)
			return "java"
		}
	}

	// Check for JavaScript project
	if jsutils.DetectJSProject(dir) {
		jsProjectInfo := jsutils.DetectJSProjectInfo(dir, logPrefix)

		// Prioritize certain JS project types
		if jsProjectInfo.Type == jsutils.ReactProject ||
			jsProjectInfo.Type == jsutils.VueProject ||
			jsProjectInfo.Type == jsutils.AngularProject ||
			jsProjectInfo.Type == jsutils.NextJSProject ||
			jsProjectInfo.Type == jsutils.NuxtProject ||
			jsProjectInfo.Type == jsutils.NestJSProject {
			log.Printf("INFO: %s Detected sophisticated JavaScript project type: %v", logPrefix, jsProjectInfo.Type)
			return "javascript"
		}
	}

	if pythonutils.DetectPythonProject(dir) {
		projectInfo := pythonutils.DetectPythonProjectInfo(dir, logPrefix)

		if projectInfo.Type == pythonutils.PoetryProject ||
			projectInfo.Type == pythonutils.PipenvProject ||
			projectInfo.Type == pythonutils.CondaProject {
			log.Printf("INFO: %s Detected sophisticated Python project type: %v", logPrefix, projectInfo.Type)
			return "python"
		}
	}

	if goutils.DetectGoProject(dir) {
		projectInfo := goutils.DetectGoProjectInfo(dir, logPrefix)

		if projectInfo.Type == goutils.SingleModuleProject ||
			projectInfo.Type == goutils.MultiModuleProject {
			log.Printf("INFO: %s Detected Go project type: %v", logPrefix, projectInfo.Type)
			return "go"
		}
	}

	// MODIFIED: Fallback to file counting analysis (added Java)
	goFileCount := 0
	pythonFileCount := 0
	jsFileCount := 0
	javaFileCount := 0

	// File counting logic
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}

		ext := strings.ToLower(filepath.Ext(info.Name()))
		switch ext {
		case ".go":
			if !strings.HasSuffix(info.Name(), "_test.go") {
				goFileCount++
			}
		case ".py":
			if !strings.Contains(info.Name(), "test") {
				pythonFileCount++
			}
		case ".js", ".jsx", ".ts", ".tsx":
			if !isJSTestFile(info.Name()) {
				jsFileCount++
			}
		case ".java":  // ADDED JAVA CASE
			if !strings.Contains(strings.ToLower(info.Name()), "test") {
				javaFileCount++
			}
		}
		return nil
	})

	log.Printf("INFO: %s File counts - Go: %d, Python: %d, JS/TS: %d, Java: %d",
		logPrefix, goFileCount, pythonFileCount, jsFileCount, javaFileCount)

	// MODIFIED: Determine primary language based on file counts
	maxCount := goFileCount
	primaryLang := "go"

	if pythonFileCount > maxCount {
		maxCount = pythonFileCount
		primaryLang = "python"
	}
	if jsFileCount > maxCount {
		maxCount = jsFileCount
		primaryLang = "javascript"
	}
	if javaFileCount > maxCount {
		maxCount = javaFileCount
		primaryLang = "java"
	}

	if maxCount == 0 {
		return "unknown"
	}

	return primaryLang
}

// Cleanup functions (unchanged)
func CleanupOldJobs() {
	log.Println("Starting job cleanup routine")
	ticker := time.NewTicker(1 * time.Hour)
	go func() {
		for {
			select {
			case <-ticker.C:
				performJobCleanup()
			}
		}
	}()
}

func performJobCleanup() {
	db, err := config.ConnectDB()
	if err != nil {
		log.Printf("Failed to connect to database for job cleanup: %v", err)
		return
	}

	collection := db.Collection("coverage_jobs")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	threshold := time.Now().Add(-24 * time.Hour)
	result, err := collection.DeleteMany(
		ctx,
		bson.M{
			"status":     bson.M{"$in": []string{"completed", "failed"}},
			"updated_at": bson.M{"$lt": threshold},
		},
	)

	if err != nil {
		log.Printf("Failed to cleanup old jobs: %v", err)
	} else if result.DeletedCount > 0 {
		log.Printf("Cleaned up %d completed/failed jobs", result.DeletedCount)
	}

	stuckThreshold := time.Now().Add(-2 * time.Hour)
	stuckResult, err := collection.UpdateMany(
		ctx,
		bson.M{
			"status":     "in_progress",
			"updated_at": bson.M{"$lt": stuckThreshold},
		},
		bson.M{
			"$set": bson.M{
				"status":     "failed",
				"error":      "Job timed out",
				"updated_at": time.Now(),
			},
		},
	)

	if err != nil {
		log.Printf("Failed to mark stuck jobs as failed: %v", err)
	} else if stuckResult.ModifiedCount > 0 {
		log.Printf("Marked %d stuck jobs as failed", stuckResult.ModifiedCount)
	}

	cleanupInMemoryCache()
}

func cleanupInMemoryCache() {
	jobsMutex.Lock()
	defer jobsMutex.Unlock()

	threshold := time.Now().Add(-30 * time.Minute)
	for id, job := range completedJobs {
		var t time.Time
		if job.EndTime != nil {
			t = *job.EndTime
		} else {
			t = job.StartTime
		}
		if t.Before(threshold) {
			delete(completedJobs, id)
		}
	}

	log.Printf("In-memory job cache size: %d", len(completedJobs))
}
func convertJavaResponse(javaResp javautils.JavaCoverageResponse) CoverageResponse {
	var files []FileCoverage
	for _, f := range javaResp.Files {
		status := "Success"
		if f.Error != "" {
			status = "Failure"
		}
		files = append(files, FileCoverage{
			File:     f.File,
			Coverage: f.Coverage,
			Error:    f.Error,
			Status:   status,
		})
	}

	return CoverageResponse{
		TotalCoverage: javaResp.TotalCoverage,
		Files:         files,
		ID:            javaResp.ID,
		Repository:    javaResp.Repository,
		Branch:        javaResp.Branch,
		Timestamp:     javaResp.Timestamp,
		CommitHash:    javaResp.CommitHash,
	}
}

// ADDED: Java test file helper function
func isJavaTestFile(filename string) bool {
	lowerName := strings.ToLower(filename)
	return strings.Contains(lowerName, "test") ||
		strings.Contains(lowerName, "/test/") ||
		strings.HasSuffix(lowerName, "test.java") ||
		strings.HasSuffix(lowerName, "tests.java") ||
		strings.Contains(lowerName, "testcase") ||
		strings.Contains(lowerName, "spec.java")
}
