package handlers

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/backend/config"
	"github.com/yourusername/backend/models"
	"github.com/yourusername/backend/pythonutils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type CoverageRequest struct {
	RepoURL string `json:"repo_url" binding:"required"`
	Branch  string `json:"branch"`
}

type CoverageAsyncRequest struct {
	RepoURL string `json:"repo_url" binding:"required"`
	Branch  string `json:"branch"`
	Async   bool   `json:"async"`
}

type FileCoverage struct {
	File     string  `json:"file"`
	Coverage float64 `json:"coverage"`
	Error    string  `json:"error,omitempty"` // New field to store file-specific errors
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

// Checks if a job is complete
func isJobComplete(jobID string) (bool, *JobStatus) {
	jobsMutex.RLock()
	defer jobsMutex.RUnlock()

	if job, exists := completedJobs[jobID]; exists {
		return true, job
	}
	return false, nil
}

// Marks a job as complete and schedules cleanup
func markJobComplete(jobID string, status string, resultID string, err string) {
	jobsMutex.Lock()
	defer jobsMutex.Unlock()

	// Update the job status in the active jobs map first
	if job, exists := activeJobs[jobID]; exists {
		job.Status = status
		now := time.Now()
		job.EndTime = &now
		job.ResultID = resultID
		job.Error = err
		job.Progress = 100

		// Remove from active jobs after a short delay to allow final status to be visible
		go func(id string) {
			time.Sleep(5 * time.Minute)
			jobsMutex.Lock()
			delete(activeJobs, id)
			jobsMutex.Unlock()
		}(jobID)
	}

	// Also maintain the completed jobs cache for quick lookups
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

		// Add to active jobs map
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
			}

			// Update progress at intervals
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
	coverageReq := CoverageRequest{
		RepoURL: req.RepoURL,
		Branch:  req.Branch,
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

	// Also update the in-memory job status
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

// New function to update job progress
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

// New function to list active jobs
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
		c.JSON(http.StatusOK, jobs) // Return what we have in memory
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

// New function to cancel a job
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

// Checks if a file exists and is not a directory
func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// Checks if directory contains Go files (excluding test files)
func hasGoFiles(dir string) bool {
	files, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, file := range files {
		if !file.IsDir() && strings.HasSuffix(file.Name(), ".go") {
			if !strings.HasSuffix(file.Name(), "_test.go") {
				return true
			}
		}
	}
	return false
}

// Detects Go modules and packages in a directory
func detectGoStructure(dir string, logPrefix string) ([]string, error) {
	log.Printf("INFO: %s Fast Go project structure analysis", logPrefix)
	if fileExists(filepath.Join(dir, "go.mod")) {
		log.Printf("INFO: %s Found go.mod in root, using single module approach", logPrefix)
		return []string{dir}, nil
	}

	if hasGoFiles(dir) {
		log.Printf("INFO: %s Found Go files in root without go.mod", logPrefix)
		return []string{dir}, nil
	}

	var goModules []string
	var goPackages []string
	maxDepth := 3 

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, _ := filepath.Rel(dir, path)
		depth := strings.Count(relPath, string(filepath.Separator))
		if depth > maxDepth {
			return filepath.SkipDir
		}

		if info.IsDir() {
			name := info.Name()

			if strings.HasPrefix(name, ".") ||
				name == "vendor" ||
				name == "node_modules" ||
				name == "build" ||
				name == "dist" ||
				name == "target" ||
				name == "docs" ||
				name == "test" ||
				name == "tests" ||
				name == "examples" {
				return filepath.SkipDir
			}
		}

		if info.Name() == "go.mod" {
			moduleDir := filepath.Dir(path)
			goModules = append(goModules, moduleDir)
			log.Printf("INFO: %s Found Go module at: %s", logPrefix, moduleDir)
		}

		if info.IsDir() && path != dir && hasGoFiles(path) {
			goPackages = append(goPackages, path)
		}

		return nil
	})

	if err != nil {
		log.Printf("WARNING: %s Error walking directory: %v", logPrefix, err)
	}

	if len(goModules) > 0 {
		return goModules, nil
	}

	if len(goPackages) > 0 {
		return goPackages, nil
	}

	return nil, errors.New("no Go code found")
}

func runGoModuleCoverage(dir string, logPrefix string) (float64, []FileCoverage, error) {
	log.Printf("INFO: %s Running optimized Go coverage in: %s", logPrefix, dir)

	hasGoMod := fileExists(filepath.Join(dir, "go.mod"))
	coverageFile := filepath.Join(dir, "coverage.out")
	os.Remove(coverageFile) 

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	var cmd *exec.Cmd

	if hasGoMod {

		cmd = exec.CommandContext(ctx, "go", "test", "-coverprofile=coverage.out", "-covermode=count", "./...")
	} else {
		cmd = exec.CommandContext(ctx, "go", "test", "-coverprofile=coverage.out", "-covermode=count", ".")
	}

	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GO111MODULE=on",
		"CGO_ENABLED=0",
		"GOCACHE="+filepath.Join(os.TempDir(), "gocache"), 
	)

	output, err := cmd.CombinedOutput()
	fileErrors := make(map[string]string)

	if err != nil {
		outputStr := string(output)
		lines := strings.Split(outputStr, "\n")
		errorFile := filepath.Join(dir, "coverage.out.error")
		os.WriteFile(errorFile, output, 0644)

		for _, line := range lines {
			if match := extractFileErrorFromLine(line); match != nil {
				fileErrors[match.filename] = match.errorMsg
				log.Printf("INFO: %s File error detected: %s - %s",
					logPrefix, match.filename, match.errorMsg)
			}
		}
	}

	if err != nil {
		log.Printf("WARNING: %s Primary coverage command failed, trying fallbacks: %v", logPrefix, err)
		fallbackCommands := [][]string{
			{"go", "test", "-coverprofile=coverage.out", "-covermode=set", "./..."},
			{"go", "test", "-coverprofile=coverage.out", "-covermode=atomic", "./..."},
			{"go", "test", "-coverprofile=coverage.out", "-covermode=count", "."},
			{"go", "test", "-coverprofile=coverage.out", "-covermode=set", "."},
			{"go", "test", "-v", "-coverprofile=coverage.out", "./..."},
			{"go", "test", "-short", "-coverprofile=coverage.out", "./..."},
		}

		for _, cmdArgs := range fallbackCommands {
			if hasGoMod || !strings.Contains(cmdArgs[len(cmdArgs)-1], "./...") {
				log.Printf("INFO: %s Trying fallback command: %s", logPrefix, strings.Join(cmdArgs, " "))
				fallbackCmd := exec.CommandContext(ctx, cmdArgs[0], cmdArgs[1:]...)
				fallbackCmd.Dir = dir
				fallbackCmd.Env = cmd.Env

				output, err = fallbackCmd.CombinedOutput()
				if err == nil || fileExists(coverageFile) {
					log.Printf("INFO: %s Fallback command succeeded", logPrefix)
					break
				}
			}
		}
	}

	if fileExists(coverageFile) {
		log.Printf("INFO: %s Coverage file created, parsing results", logPrefix)

		// Try go tool cover first (faster and more reliable)
		if coverageData, parseErr := parseWithGoToolCover(coverageFile, dir); parseErr == nil && coverageData.TotalCoverage >= 0 {
			log.Printf("INFO: %s Successfully parsed coverage using go tool cover: %.2f%%", logPrefix, coverageData.TotalCoverage)
			os.Remove(coverageFile)
			return coverageData.TotalCoverage, coverageData.Files, nil
		}

		coverageData, parseErr := parseCoverageFile(coverageFile)
		if parseErr != nil {
			log.Printf("ERROR: %s Failed to parse coverage file: %v", logPrefix, parseErr)
			os.Remove(coverageFile)
			return 0.0, []FileCoverage{}, parseErr
		}
		for i := range coverageData.Files {
			if errorMsg, exists := fileErrors[coverageData.Files[i].File]; exists {
				coverageData.Files[i].Error = errorMsg
			}
		}

		os.Remove(coverageFile)
		log.Printf("INFO: %s Successfully parsed coverage manually: %.2f%%", logPrefix, coverageData.TotalCoverage)
		return coverageData.TotalCoverage, coverageData.Files, nil
	}

	if strings.Contains(string(output), "coverage:") {
		coverage := parseSimpleCoverageOutput(string(output))
		if coverage > 0 {
			log.Printf("INFO: %s Extracted coverage from command output: %.2f%%", logPrefix, coverage)
			return coverage, []FileCoverage{}, nil
		}
	}

	return 0.0, []FileCoverage{}, err
}

func processGoDirectoriesInParallel(goDirectories []string, tmpDir string, logPrefix string) (CoverageResponse, bool) {
	log.Printf("INFO: %s Processing %d Go directories in parallel", logPrefix, len(goDirectories))

	type CoverageResult struct {
		Coverage   float64
		Files      []FileCoverage
		Error      error
		Dir        string
		Success    bool
		FileErrors map[string]string // Track file-specific errors
	}

	maxWorkers := min(len(goDirectories), runtime.NumCPU())
	log.Printf("INFO: %s Using %d workers for parallel processing", logPrefix, maxWorkers)

	resultsChan := make(chan CoverageResult, len(goDirectories))
	semaphore := make(chan struct{}, maxWorkers)

	var wg sync.WaitGroup

	for _, dir := range goDirectories {
		wg.Add(1)
		go func(directory string) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			relPath, _ := filepath.Rel(tmpDir, directory)
			if relPath == "." {
				relPath = "root"
			}

			coverage, files, err := runGoModuleCoverage(directory, logPrefix)
			fileErrors := make(map[string]string)

			if err != nil {
				if errOutput, ok := err.(error); ok {
					errLines := strings.Split(errOutput.Error(), "\n")
					for _, line := range errLines {
						if fileMatch := extractFileErrorFromLine(line); fileMatch != nil {
							fileErrors[fileMatch.filename] = fileMatch.errorMsg
							log.Printf("INFO: %s Recorded error for file %s: %s",
								logPrefix, fileMatch.filename, fileMatch.errorMsg)
						}
					}
				}
			}

			if err != nil || coverage <= 0 {
				log.Printf("INFO: %s Primary coverage method failed for %s, trying fallbacks", logPrefix, relPath)

				var fallbackMethods = []struct {
					name string
					fn   func(string) (CoverageResponse, error)
				}{
					{"fallbackCoverage", fallbackCoverage},
					{"fallbackGocov", fallbackGocov},
					{"fallbackGocover", fallbackGocover},
				}

				for _, method := range fallbackMethods {
					log.Printf("INFO: %s Trying %s fallback for %s", logPrefix, method.name, relPath)
					if resp, fallbackErr := method.fn(directory); fallbackErr == nil && resp.TotalCoverage > 0 {
						log.Printf("INFO: %s %s fallback succeeded for %s with %.2f%% coverage",
							logPrefix, method.name, relPath, resp.TotalCoverage)

						for i := range resp.Files {
							if errorMsg, exists := fileErrors[resp.Files[i].File]; exists {
								resp.Files[i].Error = errorMsg
							}
						}

						resultsChan <- CoverageResult{
							Coverage:   resp.TotalCoverage,
							Files:      resp.Files,
							Error:      nil,
							Dir:        relPath,
							Success:    true,
							FileErrors: fileErrors,
						}
						return
					}
				}

				resultsChan <- CoverageResult{
					Coverage:   0,
					Files:      []FileCoverage{},
					Error:      fmt.Errorf("all coverage methods failed for %s", relPath),
					Dir:        relPath,
					Success:    false,
					FileErrors: fileErrors,
				}
				return
			}

			for i := range files {
				if errorMsg, exists := fileErrors[files[i].File]; exists {
					files[i].Error = errorMsg
				}
			}

			resultsChan <- CoverageResult{
				Coverage:   coverage,
				Files:      files,
				Error:      nil,
				Dir:        relPath,
				Success:    true,
				FileErrors: fileErrors,
			}

		}(dir)
	}

	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	var allFiles []FileCoverage
	var totalCoverage float64
	var validResults int
	var successfulDirs []string

	for result := range resultsChan {
		if !result.Success {
			log.Printf("WARNING: %s Failed to get coverage for %s: %v", logPrefix, result.Dir, result.Error)
			continue
		}

		log.Printf("INFO: %s Got %.2f%% coverage from %s", logPrefix, result.Coverage, result.Dir)
		totalCoverage += result.Coverage
		validResults++
		successfulDirs = append(successfulDirs, result.Dir)

		if result.Dir != "root" {
			for i := range result.Files {
				filePath := filepath.Join(result.Dir, result.Files[i].File)
				result.Files[i].File = filePath
				if errorMsg, exists := result.FileErrors[filePath]; exists && result.Files[i].Error == "" {
					result.Files[i].Error = errorMsg
				}
			}
		} else {
			for i := range result.Files {
				if errorMsg, exists := result.FileErrors[result.Files[i].File]; exists && result.Files[i].Error == "" {
					result.Files[i].Error = errorMsg
				}
			}
		}

		allFiles = append(allFiles, result.Files...)
	}

	if validResults > 0 {
		finalCoverage := totalCoverage / float64(validResults)
		log.Printf("INFO: %s Calculated average coverage: %.2f%% from %d directories: %v",
			logPrefix, finalCoverage, validResults, successfulDirs)

		return CoverageResponse{
			TotalCoverage: finalCoverage,
			Files:         allFiles,
		}, true
	}

	return CoverageResponse{}, false
}

// Detects project type based on files present
func parseSimpleCoverageOutput(output string) float64 {
	patterns := []string{
		`coverage:\s*([0-9]+(?:\.[0-9]+)?)%`,
		`Total coverage:\s*([0-9]+(?:\.[0-9]+)?)%`,
		`TOTAL.*?([0-9]+(?:\.[0-9]+)?)%`,
		`([0-9]+(?:\.[0-9]+)?)%\s+of\s+statements`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(output)
		if len(matches) >= 2 {
			if val, err := strconv.ParseFloat(matches[1], 64); err == nil {
				log.Printf("INFO: Extracted coverage using pattern '%s': %.2f%%", pattern, val)
				return val
			}
		}
	}

	log.Printf("WARNING: No coverage percentage found in output")
	return 0.0
}

// Fallback: runs 'go test -cover' and parses output
func fallbackCoverage(dir string) (CoverageResponse, error) {
	cmd := exec.Command("go", "test", "-cover")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return CoverageResponse{}, err
	}
	re := regexp.MustCompile(`coverage: ([0-9]+\.[0-9]+)% of statements`)
	matches := re.FindStringSubmatch(string(out))
	if len(matches) < 2 {
		return CoverageResponse{}, errors.New("no coverage info")
	}
	val, _ := strconv.ParseFloat(matches[1], 64)
	return CoverageResponse{TotalCoverage: val, Files: []FileCoverage{}}, nil
}

// Fallback: runs 'gocov test ./...' and parses output
func fallbackGocov(dir string) (CoverageResponse, error) {
	cmd := exec.Command("gocov", "test", "./...")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return CoverageResponse{}, err
	}
	re := regexp.MustCompile(`"percent":\s*([0-9]+\.?[0-9]*)`)
	match := re.FindStringSubmatch(string(out))
	if len(match) < 2 {
		return CoverageResponse{}, errors.New("no gocov coverage info")
	}
	val, _ := strconv.ParseFloat(match[1], 64)
	return CoverageResponse{TotalCoverage: val, Files: []FileCoverage{}}, nil
}

// Fallback: runs 'go tool cover -func=coverage.out' and parses output
func fallbackGocover(dir string) (CoverageResponse, error) {
	covFile := filepath.Join(dir, "coverage.out")
	if !fileExists(covFile) {
		minimalContent := "mode: set\n"
		if err := os.WriteFile(covFile, []byte(minimalContent), 0644); err != nil {
			return CoverageResponse{TotalCoverage: 0.0, Files: []FileCoverage{}}, nil
		}
	}
	cmd := exec.Command("go", "tool", "cover", "-func=coverage.out")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return CoverageResponse{TotalCoverage: 0.0, Files: []FileCoverage{}}, nil
	}
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "total:") {
			parts := strings.Fields(line)
			if len(parts) >= 3 && strings.HasSuffix(parts[2], "%") {
				valStr := strings.TrimSuffix(parts[2], "%")
				if val, err := strconv.ParseFloat(valStr, 64); err == nil {
					return CoverageResponse{TotalCoverage: val, Files: []FileCoverage{}}, nil
				}
			}
		}
	}
	return CoverageResponse{TotalCoverage: 0.0, Files: []FileCoverage{}}, nil
}

// FileStats holds coverage statistics for a single file
type FileStats struct {
	TotalExecutableLines int
	CoveredLines         int
}

func parseCoverageFile(path string) (CoverageResponse, error) {
	file, err := os.Open(path)
	if err != nil {
		return CoverageResponse{}, fmt.Errorf("failed to open coverage file: %v", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)

	if !scanner.Scan() {
		return CoverageResponse{}, errors.New("empty coverage file")
	}

	firstLine := scanner.Text()
	if !strings.HasPrefix(firstLine, "mode:") {
		return CoverageResponse{}, errors.New("invalid coverage file format")
	}

	log.Printf("INFO: Coverage file mode: %s", firstLine)

	totalExecutableLines := 0
	totalCoveredLines := 0
	fileData := make(map[string]*FileStats)

	lineCount := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		lineCount++

		parts := strings.Fields(line)
		if len(parts) < 3 {
			log.Printf("WARNING: Skipping malformed coverage line: %s", line)
			continue
		}
		location := parts[0]
		colonIndex := strings.Index(location, ":")
		if colonIndex == -1 {
			log.Printf("WARNING: No colon found in location: %s", location)
			continue
		}
		filename := location[:colonIndex]

		numStmt, err1 := strconv.Atoi(parts[1])
		execCount, err2 := strconv.Atoi(parts[2])

		if err1 != nil || err2 != nil {
			log.Printf("WARNING: Failed to parse coverage line: %s (numStmt: %v, execCount: %v)", line, err1, err2)
			continue
		}

		if fileData[filename] == nil {
			fileData[filename] = &FileStats{
				TotalExecutableLines: 0,
				CoveredLines:         0,
			}
		}
		fileStats := fileData[filename]
		fileStats.TotalExecutableLines += numStmt

		if execCount > 0 {
			fileStats.CoveredLines += numStmt
		}
		totalExecutableLines += numStmt
		if execCount > 0 {
			totalCoveredLines += numStmt
		}
		if lineCount <= 5 {
			log.Printf("DEBUG: Line %d - File: %s, Statements: %d, ExecCount: %d, Covered: %v",
				lineCount, filename, numStmt, execCount, execCount > 0)
		}
	}

	if err := scanner.Err(); err != nil {
		return CoverageResponse{}, fmt.Errorf("error reading coverage file: %v", err)
	}

	log.Printf("INFO: Parsed %d coverage lines, total executable lines: %d, covered lines: %d",
		lineCount, totalExecutableLines, totalCoveredLines)

	totalCoverage := 0.0
	if totalExecutableLines > 0 {
		totalCoverage = float64(totalCoveredLines) * 100.0 / float64(totalExecutableLines)
	}
	files := make([]FileCoverage, 0, len(fileData))
	fileErrors := make(map[string]string)

	// Try to find error lines in the coverage file
	errorContent, _ := os.ReadFile(path + ".error")
	if len(errorContent) > 0 {
		lines := strings.Split(string(errorContent), "\n")
		for _, line := range lines {
			if match := extractFileErrorFromLine(line); match != nil {
				fileErrors[match.filename] = match.errorMsg
			}
		}
	}

	for filename, stats := range fileData {
		fileCoverage := 0.0
		if stats.TotalExecutableLines > 0 {
			fileCoverage = float64(stats.CoveredLines) * 100.0 / float64(stats.TotalExecutableLines)
		}
		cleanFilename := cleanupFilename(filename)

		fileCov := FileCoverage{
			File:     cleanFilename,
			Coverage: fileCoverage,
		}

		// Add error if one was found for this file
		if errorMsg, exists := fileErrors[cleanFilename]; exists {
			fileCov.Error = errorMsg
		}

		files = append(files, fileCov)

		if len(files) <= 5 {
			log.Printf("DEBUG: File %s - Executable: %d, Covered: %d, Coverage: %.2f%%",
				cleanFilename, stats.TotalExecutableLines, stats.CoveredLines, fileCoverage)
		}
	}

	log.Printf("INFO: Final calculated coverage: %.2f%% (%d covered out of %d executable lines)",
		totalCoverage, totalCoveredLines, totalExecutableLines)

	return CoverageResponse{
		TotalCoverage: totalCoverage,
		Files:         files,
	}, nil
}

// Parses coverage.out using 'go tool cover -func'
func parseWithGoToolCover(coverageFile string, dir string) (CoverageResponse, error) {
	log.Printf("INFO: Using go tool cover to parse coverage file")
	cmd := exec.Command("go", "tool", "cover", "-func", coverageFile)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return CoverageResponse{}, fmt.Errorf("go tool cover failed: %v, output: %s", err, string(out))
	}

	output := string(out)
	log.Printf("DEBUG: go tool cover output (first 500 chars):\n%s",
		output[:min(len(output), 500)])
	lines := strings.Split(output, "\n")
	fileData := make(map[string]*FileStats)
	var totalCoverage float64

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "total:") {
			fields := strings.Fields(line)
			if len(fields) >= 3 {

				coverageStr := strings.TrimSuffix(fields[2], "%")
				if coverage, err := strconv.ParseFloat(coverageStr, 64); err == nil {
					totalCoverage = coverage
				}
			}
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 3 {
			fileFunc := parts[0]
			coverageStr := strings.TrimSuffix(parts[2], "%")

			if coverage, err := strconv.ParseFloat(coverageStr, 64); err == nil {
				if colonIndex := strings.Index(fileFunc, ":"); colonIndex != -1 {
					filename := fileFunc[:colonIndex]
					cleanFilename := cleanupFilename(filename)
					if fileData[cleanFilename] == nil {
						fileData[cleanFilename] = &FileStats{}
					}
					fileData[cleanFilename].CoveredLines += int(coverage)
					fileData[cleanFilename].TotalExecutableLines += 100
				}
			}
		}
	}
	files := make([]FileCoverage, 0, len(fileData))
	for filename, stats := range fileData {
		fileCoverage := 0.0
		if stats.TotalExecutableLines > 0 {
			fileCoverage = float64(stats.CoveredLines) / float64(stats.TotalExecutableLines) * 100.0
		}

		files = append(files, FileCoverage{
			File:     filename,
			Coverage: fileCoverage,
		})
	}

	log.Printf("INFO: go tool cover parsed %d files, total coverage: %.2f%%", len(files), totalCoverage)

	return CoverageResponse{
		TotalCoverage: totalCoverage,
		Files:         files,
	}, nil
}

func cleanupFilename(filename string) string {
	if strings.Contains(filename, "/") {
		parts := strings.Split(filename, "/")
		if len(parts) > 3 {
			return strings.Join(parts[len(parts)-3:], "/")
		}
	}
	return filename
}

func findGoCodeDirs(baseDir string, logPrefix string) []string {
	log.Printf("INFO: %s Searching for Go code in subdirectories", logPrefix)
	var goDirs []string
	visited := make(map[string]bool)

	// First check if root has Go files
	if dirContainsGoFiles(baseDir) || fileExists(filepath.Join(baseDir, "go.mod")) {
		goDirs = append(goDirs, baseDir)
		visited[baseDir] = true
		log.Printf("INFO: %s Found Go code in root directory", logPrefix)
	}

	err := filepath.Walk(baseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if visited[path] {
			return nil
		}

		if info.IsDir() {
			dirName := filepath.Base(path)
			if dirName == ".git" ||
				dirName == "vendor" ||
				dirName == "node_modules" ||
				dirName == "build" ||
				dirName == "dist" ||
				strings.HasPrefix(dirName, ".") {
				return filepath.SkipDir
			}
		}

		if path == baseDir {
			return nil
		}

		if info.IsDir() {
			hasGoFiles := false
			if files, err := filepath.Glob(filepath.Join(path, "*.go")); err == nil && len(files) > 0 {
				for _, file := range files {
					if !strings.HasSuffix(file, "_test.go") {
						hasGoFiles = true
						break
					}
				}
			}

			if hasGoFiles || fileExists(filepath.Join(path, "go.mod")) {
				if !strings.Contains(path, "/vendor/") &&
					!strings.Contains(path, "/build/") &&
					!strings.HasPrefix(filepath.Base(path), ".") {
					goDirs = append(goDirs, path)
					visited[path] = true
					log.Printf("INFO: %s Found Go code in directory: %s", logPrefix, path)
				}
			}
		}
		return nil
	})

	if err != nil {
		log.Printf("WARNING: %s Error while walking directories: %v", logPrefix, err)
	}

	uniqueDirs := make([]string, 0, len(goDirs))
	seen := make(map[string]bool)

	for _, dir := range goDirs {
		if !seen[dir] {
			seen[dir] = true
			uniqueDirs = append(uniqueDirs, dir)
		}
	}

	log.Printf("INFO: %s Total unique Go directories found: %d", logPrefix, len(uniqueDirs))
	return uniqueDirs
}

// Checks if a directory contains any Go files
func dirContainsGoFiles(dir string) bool {
	// Check both *.go files directly and subdirectories with *.go files (1 level)
	goFiles, err := filepath.Glob(filepath.Join(dir, "*.go"))
	if err != nil {
		log.Printf("ERROR: Failed to check for Go files in %s: %v", dir, err)
		return false
	}

	nonTestFiles := 0
	for _, file := range goFiles {
		if !strings.HasSuffix(file, "_test.go") {
			nonTestFiles++
		}
	}
	if nonTestFiles > 0 {
		return true
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}

	for _, entry := range entries {
		if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") &&
			entry.Name() != "vendor" && entry.Name() != "node_modules" {
			subdir := filepath.Join(dir, entry.Name())
			subdirFiles, err := filepath.Glob(filepath.Join(subdir, "*.go"))
			if err == nil && len(subdirFiles) > 0 {
				for _, file := range subdirFiles {
					if !strings.HasSuffix(file, "_test.go") {
						return true
					}
				}
			}
		}
	}

	return false
}

// Main function to scan coverage for a repo (Go/Python/mixed)
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

	var totalGoFiles, totalPyFiles, totalGoTestFiles, totalPyTestFiles int
	filepath.Walk(tmpDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if strings.HasSuffix(path, ".go") {
			if strings.HasSuffix(path, "_test.go") {
				totalGoTestFiles++
			} else {
				totalGoFiles++
			}
		} else if strings.HasSuffix(path, ".py") {
			if strings.Contains(path, "test") {
				totalPyTestFiles++
			} else {
				totalPyFiles++
			}
		}
		return nil
	})
	log.Printf("INFO: %s Repository contains %d Go files (%d tests) and %d Python files (%d tests)",
		logPrefix, totalGoFiles, totalGoTestFiles, totalPyFiles, totalPyTestFiles)

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
	isMixed := totalGoFiles > 0 && totalPyFiles > 0

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
				if coverageData, err := parseCoverageFile(coverageFile); err == nil {
					resp = coverageData
					coverageFound = true
				}
			}
		}
	}
	if isMixed && !coverageFound {
		log.Printf("INFO: %s Detected mixed Go/Python project, will scan both", logPrefix)

		goDirectories, goErr := detectGoStructure(tmpDir, logPrefix)
		var goResp CoverageResponse
		var goSuccess bool

		if goErr == nil && len(goDirectories) > 0 {
			log.Printf("INFO: %s Found %d Go directories to scan in mixed project", logPrefix, len(goDirectories))
			goResp, goSuccess = processGoDirectoriesInParallel(goDirectories, tmpDir, logPrefix)
		}

		pythonResp, pythonErr := runPythonCoverage(tmpDir, logPrefix)
		var pythonSuccess bool = pythonErr == nil && pythonResp.TotalCoverage > 0

		if goSuccess && pythonSuccess {
			log.Printf("INFO: %s Successfully got coverage from both Go (%.2f%%) and Python (%.2f%%)",
				logPrefix, goResp.TotalCoverage, pythonResp.TotalCoverage)
			goWeight := float64(totalGoFiles) / float64(totalGoFiles+totalPyFiles)
			pythonWeight := float64(totalPyFiles) / float64(totalGoFiles+totalPyFiles)

			totalCoverage := goResp.TotalCoverage*goWeight + pythonResp.TotalCoverage*pythonWeight

			files := append(goResp.Files, pythonResp.Files...)

			resp = CoverageResponse{
				TotalCoverage: totalCoverage,
				Files:         files,
			}
			coverageFound = true
			log.Printf("INFO: %s Combined coverage for mixed project: %.2f%%", logPrefix, totalCoverage)
		} else if goSuccess {
			resp = goResp
			coverageFound = true
			log.Printf("INFO: %s Using Go coverage for mixed project: %.2f%%", logPrefix, resp.TotalCoverage)
		} else if pythonSuccess {
			resp = pythonResp
			coverageFound = true
			log.Printf("INFO: %s Using Python coverage for mixed project: %.2f%%", logPrefix, resp.TotalCoverage)
		}
	}

	if !coverageFound && projectType == "python" {
		log.Printf("INFO: %s Running Python coverage (primary language)", logPrefix)
		pythonResp, pythonErr := runPythonCoverage(tmpDir, logPrefix)
		if pythonErr == nil && pythonResp.TotalCoverage > 0 {
			resp = pythonResp
			coverageFound = true
			log.Printf("INFO: %s Python coverage succeeded: %.2f%%", logPrefix, resp.TotalCoverage)
		} else {
			log.Printf("WARNING: %s Python coverage failed: %v", logPrefix, pythonErr)
		}
	}

	if !coverageFound {
		log.Printf("INFO: %s Starting optimized Go coverage analysis", logPrefix)
		goDirectories, err := detectGoStructure(tmpDir, logPrefix)
		if err != nil {
			if projectType == "python" {
				log.Printf("INFO: %s No Go code found, falling back to Python estimation", logPrefix)
				if pythonResp, pythonErr := estimatePythonCoverage(tmpDir, logPrefix); pythonErr == nil {
					resp = pythonResp
					coverageFound = true
				}
			}

			if !coverageFound {
				log.Printf("ERROR: %s No code found in repository", logPrefix)
				return CoverageResponse{}, errors.New("No code found in repository")
			}
		} else {
			log.Printf("INFO: %s Found %d Go directories to scan", logPrefix, len(goDirectories))

			if goResp, success := processGoDirectoriesInParallel(goDirectories, tmpDir, logPrefix); success {
				resp = goResp
				coverageFound = true
				log.Printf("INFO: %s Parallel Go coverage processing succeeded with %.2f%%",
					logPrefix, resp.TotalCoverage)
			} else {
				log.Printf("WARNING: %s Parallel processing failed, trying comprehensive fallback", logPrefix)

				for _, fallbackMethod := range []struct {
					name string
					fn   func(string) (CoverageResponse, error)
				}{
					{"fallbackCoverage", fallbackCoverage},
					{"fallbackGocov", fallbackGocov},
					{"fallbackGocover", fallbackGocover},
				} {
					log.Printf("INFO: %s Trying %s fallback across all %d directories",
						logPrefix, fallbackMethod.name, len(goDirectories))

					resultsChan := make(chan struct {
						dir     string
						resp    CoverageResponse
						err     error
						success bool
					}, len(goDirectories))

					var wg sync.WaitGroup
					semaphore := make(chan struct{}, runtime.NumCPU())

					for _, dir := range goDirectories {
						wg.Add(1)
						go func(directory string) {
							defer wg.Done()
							semaphore <- struct{}{}
							defer func() { <-semaphore }()

							relPath, _ := filepath.Rel(tmpDir, directory)
							if relPath == "." {
								relPath = "root"
							}

							log.Printf("INFO: %s Trying %s fallback on directory: %s",
								logPrefix, fallbackMethod.name, relPath)

							fallbackResp, err := fallbackMethod.fn(directory)
							success := err == nil && fallbackResp.TotalCoverage > 0

							resultsChan <- struct {
								dir     string
								resp    CoverageResponse
								err     error
								success bool
							}{directory, fallbackResp, err, success}
						}(dir)
					}

					go func() {
						wg.Wait()
						close(resultsChan)
					}()

					var successfulDirs []string
					var allFiles []FileCoverage
					var totalCoverage float64
					var validResults int

					for result := range resultsChan {
						if !result.success {
							log.Printf("WARNING: %s %s fallback failed for directory %s: %v",
								logPrefix, fallbackMethod.name, result.dir, result.err)
							continue
						}

						log.Printf("INFO: %s %s fallback succeeded for directory %s with %.2f%% coverage",
							logPrefix, fallbackMethod.name, result.dir, result.resp.TotalCoverage)

						successfulDirs = append(successfulDirs, result.dir)
						totalCoverage += result.resp.TotalCoverage
						validResults++

						dirRelPath, _ := filepath.Rel(tmpDir, result.dir)
						if dirRelPath == "." {
							allFiles = append(allFiles, result.resp.Files...)
						} else {
							for _, file := range result.resp.Files {
								file.File = filepath.Join(dirRelPath, file.File)
								allFiles = append(allFiles, file)
							}
						}
					}

					if validResults > 0 {
						finalCoverage := totalCoverage / float64(validResults)
						log.Printf("INFO: %s %s fallback method succeeded for %d/%d directories: %v",
							logPrefix, fallbackMethod.name, validResults, len(goDirectories), successfulDirs)

						resp = CoverageResponse{
							TotalCoverage: finalCoverage,
							Files:         allFiles,
						}
						coverageFound = true
						log.Printf("INFO: %s Overall coverage from %s fallback: %.2f%%",
							logPrefix, fallbackMethod.name, finalCoverage)
						break
					}
				}
			}
		}
	}

	if !coverageFound {
		log.Printf("WARNING: %s No coverage found, trying final Python fallback", logPrefix)
		if pythonutils.DetectPythonProject(tmpDir) {
			if pythonResp, pythonErr := estimatePythonCoverage(tmpDir, logPrefix); pythonErr == nil {
				resp = pythonResp
				coverageFound = true
				log.Printf("INFO: %s Python estimation fallback succeeded: %.2f%%", logPrefix, resp.TotalCoverage)
			}
		}
	}

	if !coverageFound {
		return CoverageResponse{}, errors.New("unable to calculate coverage for this repository")
	}

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
				files = append(files, models.FileCoverage{File: f.File, Coverage: f.Coverage})
			}

			history := models.CoverageHistory{
				ID:            primitive.NewObjectID(),
				Repository:    req.RepoURL,
				Branch:        req.Branch,
				TotalCoverage: resp.TotalCoverage,
				Files:         files,
				Timestamp:     now,
				CommitHash:    commitHash,
			}

			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			if result, err := collection.InsertOne(ctx, history); err == nil {
				resp.ID = result.InsertedID.(primitive.ObjectID).Hex()
				resp.Repository = req.RepoURL
				resp.Branch = req.Branch
				resp.Timestamp = history.Timestamp.Format(time.RFC3339)
				resp.CommitHash = commitHash
				log.Printf("INFO: %s Successfully saved coverage history", logPrefix)
			} else {
				log.Printf("WARNING: %s Failed to save coverage history: %v", logPrefix, err)
			}
		}
	}

	log.Printf("INFO: %s Optimized coverage scan completed successfully. Total coverage: %.2f%%",
		logPrefix, resp.TotalCoverage)
	return resp, nil
}

// Detects the primary project type based on structure and files
func detectProjectType(dir string, logPrefix string) string {
	log.Printf("INFO: %s Analyzing project structure for primary language", logPrefix)

	if pythonutils.DetectPythonProject(dir) {
		projectInfo := pythonutils.DetectPythonProjectInfo(dir, logPrefix)

		if projectInfo.Type == pythonutils.PoetryProject ||
			projectInfo.Type == pythonutils.PipenvProject ||
			projectInfo.Type == pythonutils.CondaProject {
			log.Printf("INFO: %s Detected sophisticated Python project type: %v", logPrefix, projectInfo.Type)
			return "python"
		}
	}

	goFileCount := 0
	pythonFileCount := 0
	goInRoot := false
	pythonInRoot := false
	goHasTests := false
	pythonHasTests := false
	goTestCount := 0
	pythonTestCount := 0

	hasGoMod := fileExists(filepath.Join(dir, "go.mod"))
	hasGoSum := fileExists(filepath.Join(dir, "go.sum"))
	hasPyProject := fileExists(filepath.Join(dir, "pyproject.toml"))
	hasRequirements := fileExists(filepath.Join(dir, "requirements.txt"))
	hasSetupPy := fileExists(filepath.Join(dir, "setup.py"))
	hasPoetryLock := fileExists(filepath.Join(dir, "poetry.lock"))
	hasPipfile := fileExists(filepath.Join(dir, "Pipfile"))

	if files, err := os.ReadDir(dir); err == nil {
		for _, file := range files {
			if !file.IsDir() {
				name := file.Name()
				if strings.HasSuffix(name, ".go") {
					goFileCount++
					goInRoot = true
					if strings.HasSuffix(name, "_test.go") {
						goHasTests = true
						goTestCount++
					}
				} else if strings.HasSuffix(name, ".py") {
					pythonFileCount++
					pythonInRoot = true
					if strings.Contains(name, "test") {
						pythonHasTests = true
						pythonTestCount++
					}
				}
			}
		}
	}

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			name := strings.ToLower(info.Name())
			if strings.HasPrefix(name, ".") ||
				name == "vendor" ||
				name == "node_modules" ||
				name == "documentation" ||
				name == "docs" ||
				name == "examples" ||
				name == "scripts" {
				return filepath.SkipDir
			}
		}

		if !info.IsDir() {
			name := info.Name()
			if strings.HasSuffix(name, ".go") {
				goFileCount++
				if strings.HasSuffix(name, "_test.go") {
					goHasTests = true
					goTestCount++
				}
			} else if strings.HasSuffix(name, ".py") {
				pythonFileCount++
				if strings.Contains(name, "test") {
					pythonHasTests = true
					pythonTestCount++
				}
			}
		}
		return nil
	})

	if err != nil {
		log.Printf("WARNING: %s Error walking directory: %v", logPrefix, err)
	}

	log.Printf("INFO: %s Project analysis - Go files: %d (root: %t, tests: %d), Python files: %d (root: %t, tests: %d)",
		logPrefix, goFileCount, goInRoot, goTestCount, pythonFileCount, pythonInRoot, pythonTestCount)
	log.Printf("INFO: %s Key files - go.mod: %t, pyproject.toml: %t, requirements.txt: %t, poetry.lock: %t, Pipfile: %t",
		logPrefix, hasGoMod, hasPyProject, hasRequirements, hasPoetryLock, hasPipfile)

	goScore := 0
	pythonScore := 0

	if goFileCount > 0 {
		goScore += min(goFileCount/10+1, 5)
	}
	if pythonFileCount > 0 {
		pythonScore += min(pythonFileCount/10+1, 5)
	}

	if hasGoMod || hasGoSum {
		goScore += 10
	}
	if hasPyProject || hasSetupPy {
		pythonScore += 10
	}
	if hasPoetryLock {
		pythonScore += 15
	}
	if hasPipfile {
		pythonScore += 12
	}
	if hasRequirements {
		pythonScore += 5
	}

	if goInRoot {
		goScore += 5
	}
	if pythonInRoot {
		pythonScore += 5
	}

	if goHasTests {
		goScore += 3
	}
	if pythonHasTests {
		pythonScore += 3
	}

	totalFiles := goFileCount + pythonFileCount
	if totalFiles > 0 {
		goRatio := float64(goFileCount) / float64(totalFiles)
		pythonRatio := float64(pythonFileCount) / float64(totalFiles)

		if goRatio > 0.7 {
			goScore += 5
		}
		if pythonRatio > 0.7 {
			pythonScore += 5
		}
	}

	log.Printf("INFO: %s Language scoring - Go: %d, Python: %d", logPrefix, goScore, pythonScore)


	if goScore > pythonScore {
		log.Printf("INFO: %s Primary language detected: Go", logPrefix)
		return "go"
	} else if pythonScore > goScore {
		log.Printf("INFO: %s Primary language detected: Python", logPrefix)
		return "python"
	} else if goFileCount > 0 {
		log.Printf("INFO: %s Tie-breaker: defaulting to Go", logPrefix)
		return "go"
	} else if pythonFileCount > 0 {
		log.Printf("INFO: %s Tie-breaker: defaulting to Python", logPrefix)
		return "python"
	}

	log.Printf("INFO: %s No clear primary language detected", logPrefix)
	return "unknown"
}

// Returns minimum of two ints
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func runPythonCoverage(dir string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Running enhanced Python coverage analysis", logPrefix)

	pythonResp, err := pythonutils.RunPythonCoverage(dir, logPrefix)
	if err != nil {
		log.Printf("ERROR: %s Enhanced Python coverage failed: %v", logPrefix, err)
		return CoverageResponse{}, err
	}

	var files []FileCoverage
	for _, f := range pythonResp.Files {
		files = append(files, FileCoverage{
			File:     f.File,
			Coverage: f.Coverage,
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
	}, nil
}

// Estimates Python coverage using pythonutils
func estimatePythonCoverage(dir string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Using enhanced Python coverage estimation", logPrefix)
	pythonResp, err := pythonutils.EstimatePythonCoverage(dir, logPrefix)
	if err != nil {
		log.Printf("ERROR: %s Enhanced Python estimation failed: %v", logPrefix, err)
		return CoverageResponse{}, err
	}

	var files []FileCoverage
	for _, f := range pythonResp.Files {
		files = append(files, FileCoverage{
			File:     f.File,
			Coverage: f.Coverage,
		})
	}

	return CoverageResponse{
		TotalCoverage: pythonResp.TotalCoverage,
		Files:         files,
	}, nil
}

// Starts periodic cleanup of old jobs
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

// Performs cleanup of old jobs in DB and memory
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

// Cleans up in-memory job cache
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

// Helper function to extract file and error information from error messages
type fileErrorMatch struct {
	filename string
	errorMsg string
}

func extractFileErrorFromLine(line string) *fileErrorMatch {
	patterns := []struct {
		regex      *regexp.Regexp
		fileGroup  int
		errorGroup int
	}{

		{regexp.MustCompile(`([^:]+\.go):(\d+)(?::\d+)?: (.+)`), 1, 3},
		{regexp.MustCompile(`([^\s]+\.go):(\d+): (.+)`), 1, 3},
		{regexp.MustCompile(`# ([^\s]+\.go):(\d+) (.+)`), 1, 3},
	}

	for _, pattern := range patterns {
		matches := pattern.regex.FindStringSubmatch(line)
		if matches != nil && len(matches) > pattern.errorGroup {
			return &fileErrorMatch{
				filename: matches[pattern.fileGroup],
				errorMsg: matches[pattern.errorGroup],
			}

		}
	}

	if strings.Contains(line, ".py") && strings.Contains(line, "Error") {
		pythonPattern := regexp.MustCompile(`([^\s]+\.py).*?([Ee]rror:? .+)`)
		matches := pythonPattern.FindStringSubmatch(line)
		if matches != nil && len(matches) >= 3 {
			return &fileErrorMatch{
				filename: matches[1],
				errorMsg: matches[2],
			}
		}
	}

	return nil
}
