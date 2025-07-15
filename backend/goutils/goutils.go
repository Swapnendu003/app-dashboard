package goutils

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// GoProjectType represents different types of Go projects
type GoProjectType int

const (
	SingleModuleProject GoProjectType = iota
	MultiModuleProject
	LegacyGoPathProject
	UnknownGoProject
)

// GoProjectInfo contains information about a Go project
type GoProjectInfo struct {
	Type           GoProjectType
	Modules        []string
	HasTests       bool
	TestCount      int
	FileCount      int
	RootHasGoMod   bool
	RootHasGoFiles bool
}

// FileCoverage represents coverage information for a single file
type FileCoverage struct {
	File     string  `json:"file"`
	Coverage float64 `json:"coverage"`
	Error    string  `json:"error,omitempty"`
	Status   string  `json:"status"`
}

// GoCoverageResponse represents the response from Go coverage analysis
type GoCoverageResponse struct {
	TotalCoverage float64        `json:"total_coverage"`
	Files         []FileCoverage `json:"files"`
	ID            string         `json:"id,omitempty"`
	Repository    string         `json:"repository,omitempty"`
	Branch        string         `json:"branch,omitempty"`
	Timestamp     string         `json:"timestamp,omitempty"`
	CommitHash    string         `json:"commit_hash,omitempty"`
}

// FileStats holds coverage statistics for a single file
type FileStats struct {
	TotalExecutableLines int
	CoveredLines         int
}

// CoverageResult represents the result of coverage analysis for a directory
type CoverageResult struct {
	Coverage   float64
	Files      []FileCoverage
	Error      error
	Dir        string
	Success    bool
	FileErrors map[string]string
}

// DetectGoProject checks if the given directory contains a Go project
func DetectGoProject(dir string) bool {
	// Check for go.mod file
	if fileExists(filepath.Join(dir, "go.mod")) {
		return true
	}

	// Check for Go files in root or subdirectories
	return dirContainsGoFiles(dir)
}

// DetectGoProjectInfo analyzes a Go project and returns detailed information
func DetectGoProjectInfo(dir, logPrefix string) GoProjectInfo {
	log.Printf("INFO: %s Analyzing Go project structure", logPrefix)

	info := GoProjectInfo{
		Type:    UnknownGoProject,
		Modules: []string{},
	}

	// Check root directory
	info.RootHasGoMod = fileExists(filepath.Join(dir, "go.mod"))
	info.RootHasGoFiles = hasGoFiles(dir)

	if info.RootHasGoMod {
		info.Type = SingleModuleProject
		info.Modules = append(info.Modules, dir)
		log.Printf("INFO: %s Detected single module Go project", logPrefix)
	}

	// Count files and detect structure
	err := filepath.Walk(dir, func(path string, fileInfo os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if fileInfo.IsDir() {
			name := fileInfo.Name()
			if strings.HasPrefix(name, ".") ||
				name == "vendor" ||
				name == "node_modules" ||
				name == "build" ||
				name == "dist" {
				return filepath.SkipDir
			}
		}

		if !fileInfo.IsDir() && strings.HasSuffix(fileInfo.Name(), ".go") {
			info.FileCount++
			if strings.HasSuffix(fileInfo.Name(), "_test.go") {
				info.HasTests = true
				info.TestCount++
			}
		}

		// Check for additional go.mod files (multi-module)
		if fileInfo.Name() == "go.mod" && path != filepath.Join(dir, "go.mod") {
			if info.Type == SingleModuleProject {
				info.Type = MultiModuleProject
			}
			moduleDir := filepath.Dir(path)
			info.Modules = append(info.Modules, moduleDir)
			log.Printf("INFO: %s Found additional Go module at: %s", logPrefix, moduleDir)
		}

		return nil
	})

	if err != nil {
		log.Printf("WARNING: %s Error analyzing Go project: %v", logPrefix, err)
	}

	// Determine project type if not already set
	if info.Type == UnknownGoProject {
		if len(info.Modules) > 1 {
			info.Type = MultiModuleProject
		} else if info.FileCount > 0 {
			info.Type = LegacyGoPathProject
			if len(info.Modules) == 0 {
				info.Modules = append(info.Modules, dir)
			}
		}
	}

	log.Printf("INFO: %s Go project analysis complete - Type: %v, Files: %d, Tests: %d, Modules: %d",
		logPrefix, info.Type, info.FileCount, info.TestCount, len(info.Modules))

	return info
}

// RunGoCoverage performs comprehensive Go coverage analysis
func RunGoCoverage(dir, logPrefix string) (GoCoverageResponse, error) {
	log.Printf("INFO: %s Starting comprehensive Go coverage analysis", logPrefix)

	projectInfo := DetectGoProjectInfo(dir, logPrefix)
	if projectInfo.FileCount == 0 {
		return GoCoverageResponse{}, errors.New("no Go files found")
	}

	if len(projectInfo.Modules) == 1 {
		// Single module/directory
		coverage, files, err := runGoModuleCoverage(projectInfo.Modules[0], logPrefix)
		if err != nil {
			return GoCoverageResponse{}, err
		}

		return GoCoverageResponse{
			TotalCoverage: coverage,
			Files:         files,
		}, nil
	}

	// Multiple modules - process in parallel
	resp, success := processGoDirectoriesInParallel(projectInfo.Modules, dir, logPrefix)
	if !success {
		return GoCoverageResponse{}, errors.New("failed to process Go modules")
	}

	return resp, nil
}

// EstimateGoCoverage provides a quick estimation of Go coverage
func EstimateGoCoverage(dir, logPrefix string) (GoCoverageResponse, error) {
	log.Printf("INFO: %s Estimating Go coverage", logPrefix)

	projectInfo := DetectGoProjectInfo(dir, logPrefix)
	if projectInfo.FileCount == 0 {
		return GoCoverageResponse{}, errors.New("no Go files found")
	}

	// Simple estimation based on test presence
	estimatedCoverage := 0.0
	if projectInfo.HasTests {
		testRatio := float64(projectInfo.TestCount) / float64(projectInfo.FileCount)
		estimatedCoverage = testRatio * 85.0 // Assume 85% max coverage with good tests
		if estimatedCoverage > 85.0 {
			estimatedCoverage = 85.0
		}
	} else {
		estimatedCoverage = 15.0 // Minimal coverage without tests
	}

	var files []FileCoverage
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}

		if strings.HasSuffix(info.Name(), ".go") && !strings.HasSuffix(info.Name(), "_test.go") {
			relPath, _ := filepath.Rel(dir, path)
			coverage := estimatedCoverage + (float64(len(info.Name())%20) - 10)
			status := "Success"
			errorMsg := ""
			if coverage <= 0 {
				status = "Failure"
				errorMsg = "File has 0% code coverage - no tests cover this file"
				coverage = 0.0
			}
			files = append(files, FileCoverage{
				File:     relPath,
				Coverage: coverage,
				Error:    errorMsg,
				Status:   status,
			})
		}
		return nil
	})

	if err != nil {
		log.Printf("WARNING: %s Error during estimation: %v", logPrefix, err)
	}

	log.Printf("INFO: %s Go coverage estimation complete: %.2f%%", logPrefix, estimatedCoverage)

	return GoCoverageResponse{
		TotalCoverage: estimatedCoverage,
		Files:         files,
	}, nil
}

// detectGoStructure detects Go modules and packages in a directory
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

// runGoModuleCoverage runs coverage analysis for a single Go module/directory
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

	// Try fallback commands if primary failed
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

		// Add file errors to coverage data
		for i := range coverageData.Files {
			if errorMsg, exists := fileErrors[coverageData.Files[i].File]; exists {
				coverageData.Files[i].Error = errorMsg
			}
		}

		os.Remove(coverageFile)
		log.Printf("INFO: %s Successfully parsed coverage manually: %.2f%%", logPrefix, coverageData.TotalCoverage)
		return coverageData.TotalCoverage, coverageData.Files, nil
	}

	// Try to extract coverage from command output
	if strings.Contains(string(output), "coverage:") {
		coverage := parseSimpleCoverageOutput(string(output))
		if coverage > 0 {
			log.Printf("INFO: %s Extracted coverage from command output: %.2f%%", logPrefix, coverage)
			return coverage, []FileCoverage{}, nil
		}
	}

	return 0.0, []FileCoverage{}, err
}

// processGoDirectoriesInParallel processes multiple Go directories in parallel
func processGoDirectoriesInParallel(goDirectories []string, tmpDir string, logPrefix string) (GoCoverageResponse, bool) {
	log.Printf("INFO: %s Processing %d Go directories in parallel", logPrefix, len(goDirectories))

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
					fn   func(string) (GoCoverageResponse, error)
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

			// Add file errors to successful results
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

		// Adjust file paths for non-root directories
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

		return GoCoverageResponse{
			TotalCoverage: finalCoverage,
			Files:         allFiles,
		}, true
	}

	return GoCoverageResponse{}, false
}

// Utility functions

// fileExists checks if a file exists and is not a directory
func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// hasGoFiles checks if directory contains Go files (excluding test files)
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

// dirContainsGoFiles checks if a directory contains any Go files
func dirContainsGoFiles(dir string) bool {
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

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// Parsing and fallback functions

// parseSimpleCoverageOutput extracts coverage percentage from command output
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

// fallbackCoverage runs 'go test -cover' and parses output
func fallbackCoverage(dir string) (GoCoverageResponse, error) {
	cmd := exec.Command("go", "test", "-cover")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return GoCoverageResponse{}, err
	}
	re := regexp.MustCompile(`coverage: ([0-9]+\.[0-9]+)% of statements`)
	matches := re.FindStringSubmatch(string(out))
	if len(matches) < 2 {
		return GoCoverageResponse{}, errors.New("no coverage info")
	}
	val, _ := strconv.ParseFloat(matches[1], 64)
	return GoCoverageResponse{TotalCoverage: val, Files: []FileCoverage{}}, nil
}

// fallbackGocov runs 'gocov test ./...' and parses output
func fallbackGocov(dir string) (GoCoverageResponse, error) {
	cmd := exec.Command("gocov", "test", "./...")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return GoCoverageResponse{}, err
	}
	re := regexp.MustCompile(`"percent":\s*([0-9]+\.?[0-9]*)`)
	match := re.FindStringSubmatch(string(out))
	if len(match) < 2 {
		return GoCoverageResponse{}, errors.New("no gocov coverage info")
	}
	val, _ := strconv.ParseFloat(match[1], 64)
	return GoCoverageResponse{TotalCoverage: val, Files: []FileCoverage{}}, nil
}

// fallbackGocover runs 'go tool cover -func=coverage.out' and parses output
func fallbackGocover(dir string) (GoCoverageResponse, error) {
	covFile := filepath.Join(dir, "coverage.out")
	if !fileExists(covFile) {
		minimalContent := "mode: set\n"
		if err := os.WriteFile(covFile, []byte(minimalContent), 0644); err != nil {
			return GoCoverageResponse{TotalCoverage: 0.0, Files: []FileCoverage{}}, nil
		}
	}
	cmd := exec.Command("go", "tool", "cover", "-func=coverage.out")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return GoCoverageResponse{TotalCoverage: 0.0, Files: []FileCoverage{}}, nil
	}
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "total:") {
			parts := strings.Fields(line)
			if len(parts) >= 3 && strings.HasSuffix(parts[2], "%") {
				valStr := strings.TrimSuffix(parts[2], "%")
				if val, err := strconv.ParseFloat(valStr, 64); err == nil {
					return GoCoverageResponse{TotalCoverage: val, Files: []FileCoverage{}}, nil
				}
			}
		}
	}
	return GoCoverageResponse{TotalCoverage: 0.0, Files: []FileCoverage{}}, nil
}

// parseCoverageFile parses a Go coverage file
func parseCoverageFile(path string) (GoCoverageResponse, error) {
	file, err := os.Open(path)
	if err != nil {
		return GoCoverageResponse{}, fmt.Errorf("failed to open coverage file: %v", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)

	if !scanner.Scan() {
		return GoCoverageResponse{}, errors.New("empty coverage file")
	}

	firstLine := scanner.Text()
	if !strings.HasPrefix(firstLine, "mode:") {
		return GoCoverageResponse{}, errors.New("invalid coverage file format")
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
	}

	if err := scanner.Err(); err != nil {
		return GoCoverageResponse{}, fmt.Errorf("error reading coverage file: %v", err)
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

		status := "Success"
		errorMsg := fileErrors[cleanFilename]
		if fileCoverage == 0.0 {
			status = "Failure"
			if errorMsg == "" {
				errorMsg = "File has 0% code coverage - no tests cover this file"
			}
		} else if errorMsg != "" {
			status = "Failure"
		}

		fileCov := FileCoverage{
			File:     cleanFilename,
			Coverage: fileCoverage,
			Error:    errorMsg,
			Status:   status,
		}
		files = append(files, fileCov)
	}

	log.Printf("INFO: Final calculated coverage: %.2f%% (%d covered out of %d executable lines)",
		totalCoverage, totalCoveredLines, totalExecutableLines)

	return GoCoverageResponse{
		TotalCoverage: totalCoverage,
		Files:         files,
	}, nil
}

// parseWithGoToolCover parses coverage.out using 'go tool cover -func'
func parseWithGoToolCover(coverageFile string, dir string) (GoCoverageResponse, error) {
	log.Printf("INFO: Using go tool cover to parse coverage file")
	cmd := exec.Command("go", "tool", "cover", "-func", coverageFile)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return GoCoverageResponse{}, fmt.Errorf("go tool cover failed: %v, output: %s", err, string(out))
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

	return GoCoverageResponse{
		TotalCoverage: totalCoverage,
		Files:         files,
	}, nil
}

// cleanupFilename cleans up file paths for better display
func cleanupFilename(filename string) string {
	if strings.Contains(filename, "/") {
		parts := strings.Split(filename, "/")
		if len(parts) > 3 {
			return strings.Join(parts[len(parts)-3:], "/")
		}
	}
	return filename
}

// fileErrorMatch represents a file error match from error output
type fileErrorMatch struct {
	filename string
	errorMsg string
}

// extractFileErrorFromLine extracts file and error information from error messages
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

	return nil
}
