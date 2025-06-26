package pythonutils

import (
	"bufio"
	"errors"
	"log"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

type FileCoverage struct {
	File     string  `json:"file"`
	Coverage float64 `json:"coverage"`
}
type PythonFileStats struct {
	TotalExecutableLines int
	CoveredLines         int
	MissedLines          int
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

type PythonProjectType int

const (
	UnknownProject PythonProjectType = iota
	PipProject                       
	PoetryProject                    
	SetupPyProject                   
	PipenvProject                    
	CondaProject                     
)

type PythonProjectInfo struct {
	Type             PythonProjectType
	HasPoetry        bool
	HasPipfile       bool
	HasSetupPy       bool
	HasRequirements  bool
	HasPyProjectToml bool
	HasPoetryLock    bool
	HasCondaEnv      bool
	PythonPath       string
	WorkingDir       string
}

// Check if a file exists and is not a directory
func FileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// Analyze a directory to determine Python project type and configuration
func DetectPythonProjectInfo(dir string, logPrefix string) *PythonProjectInfo {
	log.Printf("INFO: %s Analyzing Python project structure in %s", logPrefix, dir)

	info := &PythonProjectInfo{
		Type:       UnknownProject,
		WorkingDir: dir,
	}
	info.HasPyProjectToml = FileExists(filepath.Join(dir, "pyproject.toml"))
	info.HasPoetryLock = FileExists(filepath.Join(dir, "poetry.lock"))
	info.HasRequirements = FileExists(filepath.Join(dir, "requirements.txt"))
	info.HasSetupPy = FileExists(filepath.Join(dir, "setup.py"))
	info.HasPipfile = FileExists(filepath.Join(dir, "Pipfile"))
	info.HasCondaEnv = FileExists(filepath.Join(dir, "environment.yml")) || FileExists(filepath.Join(dir, "conda.yml"))
	if info.HasPyProjectToml {
		if content, err := os.ReadFile(filepath.Join(dir, "pyproject.toml")); err == nil {
			if strings.Contains(string(content), "[tool.poetry]") ||
				strings.Contains(string(content), "poetry-core") ||
				strings.Contains(string(content), "poetry.core") {
				info.HasPoetry = true
			}
		}
	}

	// Determinaton of the project type priority:
	if info.HasPoetry {
		info.Type = PoetryProject
		log.Printf("INFO: %s Detected Poetry project", logPrefix)
	} else if info.HasPipfile {
		info.Type = PipenvProject
		log.Printf("INFO: %s Detected Pipenv project", logPrefix)
	} else if info.HasCondaEnv {
		info.Type = CondaProject
		log.Printf("INFO: %s Detected Conda project", logPrefix)
	} else if info.HasSetupPy {
		info.Type = SetupPyProject
		log.Printf("INFO: %s Detected setup.py project", logPrefix)
	} else if info.HasRequirements {
		info.Type = PipProject
		log.Printf("INFO: %s Detected pip/requirements.txt project", logPrefix)
	}
	info.PythonPath = FindPythonExecutable(dir)

	return info
}

// Locate Poetry executable
func FindPoetryExecutable() string {
	log.Printf("INFO: Looking for Poetry executable")

	poetryCommands := []string{
		"poetry",
		"/usr/local/bin/poetry",
		"/usr/bin/poetry",
		"~/.local/bin/poetry",
	}

	for _, cmd := range poetryCommands {
		if strings.HasPrefix(cmd, "~/") {
			if home, err := os.UserHomeDir(); err == nil {
				cmd = filepath.Join(home, cmd[2:])
			}
		}

		checkCmd := exec.Command("which", cmd)
		if out, err := checkCmd.Output(); err == nil {
			poetryPath := strings.TrimSpace(string(out))
			log.Printf("INFO: Found Poetry at %s", poetryPath)
			return poetryPath
		}
	}

	// Try direct execution
	if err := exec.Command("poetry", "--version").Run(); err == nil {
		log.Printf("INFO: Found Poetry in PATH")
		return "poetry"
	}

	log.Printf("WARNING: Could not find Poetry executable")
	return ""
}

// Locate Pipenv executable
func FindPipenvExecutable() string {
	log.Printf("INFO: Looking for Pipenv executable")

	pipenvCommands := []string{
		"pipenv",
		"/usr/local/bin/pipenv",
		"/usr/bin/pipenv",
	}

	for _, cmd := range pipenvCommands {
		checkCmd := exec.Command("which", cmd)
		if out, err := checkCmd.Output(); err == nil {
			pipenvPath := strings.TrimSpace(string(out))
			log.Printf("INFO: Found Pipenv at %s", pipenvPath)
			return pipenvPath
		}
	}

	if err := exec.Command("pipenv", "--version").Run(); err == nil {
		log.Printf("INFO: Found Pipenv in PATH")
		return "pipenv"
	}

	log.Printf("WARNING: Could not find Pipenv executable")
	return ""
}

// Locate Conda executable
func FindCondaExecutable() string {
	log.Printf("INFO: Looking for Conda executable")

	condaCommands := []string{
		"conda",
		"mamba",
		"/usr/local/bin/conda",
		"/usr/bin/conda",
		"~/miniconda3/bin/conda",
		"~/anaconda3/bin/conda",
	}

	for _, cmd := range condaCommands {
		if strings.HasPrefix(cmd, "~/") {
			if home, err := os.UserHomeDir(); err == nil {
				cmd = filepath.Join(home, cmd[2:])
			}
		}

		checkCmd := exec.Command("which", cmd)
		if out, err := checkCmd.Output(); err == nil {
			condaPath := strings.TrimSpace(string(out))
			log.Printf("INFO: Found Conda at %s", condaPath)
			return condaPath
		}
	}

	log.Printf("WARNING: Could not find Conda executable")
	return ""
}

// Find Python executable in system or venv
func FindPythonExecutable(dir string) string {
	log.Printf("INFO: Looking for Python executable")

	pythonCommands := []string{"python", "python3", "/usr/bin/python", "/usr/bin/python3",
		"/usr/local/bin/python", "/usr/local/bin/python3"}

	for _, cmd := range pythonCommands {
		checkCmd := exec.Command("which", cmd)
		if out, err := checkCmd.Output(); err == nil {
			pythonPath := strings.TrimSpace(string(out))
			log.Printf("INFO: Found Python at %s", pythonPath)
			return pythonPath
		}
	}

	venvPaths := []string{
		filepath.Join(dir, "venv", "bin", "python"),
		filepath.Join(dir, ".venv", "bin", "python"),
		filepath.Join(dir, "env", "bin", "python"),
	}

	for _, path := range venvPaths {
		if FileExists(path) {
			log.Printf("INFO: Found Python in virtual environment at %s", path)
			return path
		}
	}
	log.Printf("WARNING: Could not find Python executable")
	return ""
}

// Find pip executable in system or venv
func FindPipExecutable(dir string, pythonPath string) string {
	log.Printf("INFO: Looking for pip executable")

	if pythonPath != "" {
		checkCmd := exec.Command(pythonPath, "-m", "pip", "--version")
		if err := checkCmd.Run(); err == nil {
			log.Printf("INFO: Found pip via %s -m pip", pythonPath)
			return pythonPath + " -m pip"
		}
	}

	pipCommands := []string{"pip", "pip3", "/usr/bin/pip", "/usr/bin/pip3",
		"/usr/local/bin/pip", "/usr/local/bin/pip3"}

	for _, cmd := range pipCommands {
		checkCmd := exec.Command("which", cmd)
		if out, err := checkCmd.Output(); err == nil {
			pipPath := strings.TrimSpace(string(out))
			log.Printf("INFO: Found pip at %s", pipPath)
			return pipPath
		}
	}
	venvPaths := []string{
		filepath.Join(dir, "venv", "bin", "pip"),
		filepath.Join(dir, ".venv", "bin", "pip"),
		filepath.Join(dir, "env", "bin", "pip"),
	}

	for _, path := range venvPaths {
		if FileExists(path) {
			log.Printf("INFO: Found pip in virtual environment at %s", path)
			return path
		}
	}

	log.Printf("WARNING: Could not find pip executable")
	return ""
}

// Install dependencies using Poetry
func InstallPoetryDependencies(dir string, logPrefix string) error {
	poetryPath := FindPoetryExecutable()
	if poetryPath == "" {
		return errors.New("poetry executable not found")
	}

	log.Printf("INFO: %s Installing dependencies with Poetry", logPrefix)
	installCmd := exec.Command(poetryPath, "install")
	installCmd.Dir = dir
	installOut, installErr := installCmd.CombinedOutput()

	if installErr != nil {
		log.Printf("WARNING: %s Poetry install failed: %v, output: %s", logPrefix, installErr, string(installOut))

		// Try installing with --no-dev flag
		log.Printf("INFO: %s Retrying Poetry install without dev dependencies", logPrefix)
		installCmd = exec.Command(poetryPath, "install", "--no-dev")
		installCmd.Dir = dir
		installOut, installErr = installCmd.CombinedOutput()

		if installErr != nil {
			log.Printf("ERROR: %s Poetry install failed even without dev dependencies: %v, output: %s",
				logPrefix, installErr, string(installOut))
			return installErr
		}
	}

	log.Printf("INFO: %s Successfully installed Poetry dependencies", logPrefix)
	log.Printf("INFO: %s Adding coverage dependencies via Poetry", logPrefix)
	addCmd := exec.Command(poetryPath, "add", "--dev", "coverage", "pytest", "pytest-cov")
	addCmd.Dir = dir
	addOut, addErr := addCmd.CombinedOutput()

	if addErr != nil {
		log.Printf("WARNING: %s Failed to add coverage dependencies: %v, output: %s",
			logPrefix, addErr, string(addOut))
	} else {
		log.Printf("INFO: %s Successfully added coverage dependencies", logPrefix)
	}

	return nil
}

// Install dependencies using Pipenv
func InstallPipenvDependencies(dir string, logPrefix string) error {
	pipenvPath := FindPipenvExecutable()
	if pipenvPath == "" {
		return errors.New("pipenv executable not found")
	}

	log.Printf("INFO: %s Installing dependencies with Pipenv", logPrefix)
	installCmd := exec.Command(pipenvPath, "install", "--dev")
	installCmd.Dir = dir
	installOut, installErr := installCmd.CombinedOutput()

	if installErr != nil {
		log.Printf("WARNING: %s Pipenv install failed: %v, output: %s", logPrefix, installErr, string(installOut))
		installCmd = exec.Command(pipenvPath, "install")
		installCmd.Dir = dir
		installOut, installErr = installCmd.CombinedOutput()

		if installErr != nil {
			log.Printf("ERROR: %s Pipenv install failed: %v, output: %s", logPrefix, installErr, string(installOut))
			return installErr
		}
	}

	log.Printf("INFO: %s Successfully installed Pipenv dependencies", logPrefix)
	log.Printf("INFO: %s Installing coverage with Pipenv", logPrefix)
	coverageCmd := exec.Command(pipenvPath, "install", "coverage", "pytest", "pytest-cov", "--dev")
	coverageCmd.Dir = dir
	coverageOut, coverageErr := coverageCmd.CombinedOutput()

	if coverageErr != nil {
		log.Printf("WARNING: %s Failed to install coverage with Pipenv: %v, output: %s",
			logPrefix, coverageErr, string(coverageOut))
	} else {
		log.Printf("INFO: %s Successfully installed coverage with Pipenv", logPrefix)
	}

	return nil
}

// Install dependencies using Conda
func InstallCondaDependencies(dir string, logPrefix string) error {
	condaPath := FindCondaExecutable()
	if condaPath == "" {
		return errors.New("conda executable not found")
	}

	log.Printf("INFO: %s Installing dependencies with Conda", logPrefix)

	envFile := filepath.Join(dir, "environment.yml")
	if !FileExists(envFile) {
		envFile = filepath.Join(dir, "conda.yml")
	}

	if FileExists(envFile) {
		installCmd := exec.Command(condaPath, "env", "create", "-f", envFile)
		installCmd.Dir = dir
		installOut, installErr := installCmd.CombinedOutput()

		if installErr != nil {
			log.Printf("WARNING: %s Conda env create failed: %v, output: %s", logPrefix, installErr, string(installOut))
		} else {
			log.Printf("INFO: %s Successfully created Conda environment", logPrefix)
		}
	}
	coverageCmd := exec.Command(condaPath, "install", "-c", "conda-forge", "coverage", "pytest", "pytest-cov", "-y")
	coverageCmd.Dir = dir
	coverageOut, coverageErr := coverageCmd.CombinedOutput()

	if coverageErr != nil {
		log.Printf("WARNING: %s Failed to install coverage with Conda: %v, output: %s",
			logPrefix, coverageErr, string(coverageOut))
	} else {
		log.Printf("INFO: %s Successfully installed coverage with Conda", logPrefix)
	}

	return nil
}

// Detect Python test frameworks in a project
func DetectPythonTestFrameworks(dir string, pythonPath string) []string {
	log.Printf("INFO: Detecting Python test frameworks")
	frameworks := []string{}

	if pythonPath == "" {
		return frameworks
	}
	if files, err := filepath.Glob(filepath.Join(dir, "**/*test*.py")); err == nil && len(files) > 0 {
		for _, file := range files {
			content, err := os.ReadFile(file)
			if err == nil {
				if strings.Contains(string(content), "import pytest") ||
					strings.Contains(string(content), "from pytest") {
					frameworks = append(frameworks, "pytest")
					break
				}
			}
		}

		for _, file := range files {
			content, err := os.ReadFile(file)
			if err == nil {
				if strings.Contains(string(content), "unittest.TestCase") ||
					strings.Contains(string(content), "import unittest") {
					frameworks = append(frameworks, "unittest")
					break
				}
			}
		}
	}
	reqFiles := []string{
		"requirements.txt", "requirements-test.txt", "requirements-dev.txt",
		"pyproject.toml", "Pipfile", "setup.py",
	}

	for _, reqFile := range reqFiles {
		reqPath := filepath.Join(dir, reqFile)
		if FileExists(reqPath) {
			content, err := os.ReadFile(reqPath)
			if err == nil {
				contentStr := string(content)
				if strings.Contains(contentStr, "pytest") {
					frameworks = append(frameworks, "pytest")
				}
				if strings.Contains(contentStr, "unittest") {
					frameworks = append(frameworks, "unittest")
				}
				if strings.Contains(contentStr, "coverage") ||
					strings.Contains(contentStr, "pytest-cov") {
					frameworks = append(frameworks, "coverage")
				}
			}
		}
	}
	frameworksMap := make(map[string]bool)
	for _, f := range frameworks {
		frameworksMap[f] = true
	}

	frameworks = []string{}
	for f := range frameworksMap {
		frameworks = append(frameworks, f)
	}

	log.Printf("INFO: Detected Python test frameworks: %v", frameworks)
	return frameworks
}

// Check if a directory contains a Python project
func DetectPythonProject(dir string) bool {
	log.Printf("INFO: Detecting if %s is a Python project", dir)
	pythonFiles := []string{
		"setup.py",
		"requirements.txt",
		"pyproject.toml",
		"Pipfile",
		"Pipfile.lock",
		"poetry.lock",
		"tox.ini",
		"environment.yml",
		"conda.yml",
	}

	for _, file := range pythonFiles {
		fullPath := filepath.Join(dir, file)
		if FileExists(fullPath) {
			log.Printf("INFO: Python project detected by presence of %s", file)
			return true
		}
	}

	pyFiles, err := filepath.Glob(filepath.Join(dir, "*.py"))
	if err != nil {
		log.Printf("WARNING: Error checking for Python files: %v", err)
	} else {
		if len(pyFiles) > 0 {
			log.Printf("INFO: Python project detected by presence of .py files: %d found", len(pyFiles))
			return true
		}
	}

	dirs, err := os.ReadDir(dir)
	if err == nil {
		for _, entry := range dirs {
			if entry.IsDir() {
				initPath := filepath.Join(dir, entry.Name(), "__init__.py")
				if FileExists(initPath) {
					log.Printf("INFO: Python project detected by presence of package directory with __init__.py: %s", entry.Name())
					return true
				}
				subPyFiles, _ := filepath.Glob(filepath.Join(dir, entry.Name(), "*.py"))
				if len(subPyFiles) > 0 {
					log.Printf("INFO: Python project detected by presence of .py files in subdirectory %s", entry.Name())
					return true
				}
			}
		}
	}

	log.Printf("INFO: Not a Python project")
	return false
}
func Contains(slice []string, str string) bool {
	for _, s := range slice {
		if s == str {
			return true
		}
	}
	return false
}

// Create and activate a Python virtual environment
func CreatePythonVirtualEnv(projectDir string, logPrefix string) (string, string, error) {
	log.Printf("INFO: %s Creating Python virtual environment due to externally managed environment", logPrefix)
	venvPath := filepath.Join(projectDir, ".keploy_venv")
	pythonPath := FindPythonExecutable(projectDir)
	if pythonPath == "" {
		return "", "", errors.New("no python executable found")
	}
	venvCmd := exec.Command(pythonPath, "-m", "venv", venvPath)
	venvCmd.Dir = projectDir
	venvOut, venvErr := venvCmd.CombinedOutput()
	if venvErr != nil {
		log.Printf("ERROR: %s Failed to create virtual environment: %v, output: %s", logPrefix, venvErr, string(venvOut))
		return "", "", venvErr
	}
	var venvPythonPath, venvPipPath string
	if runtime.GOOS == "windows" {
		venvPythonPath = filepath.Join(venvPath, "Scripts", "python.exe")
		venvPipPath = filepath.Join(venvPath, "Scripts", "pip.exe")
	} else {
		venvPythonPath = filepath.Join(venvPath, "bin", "python")
		venvPipPath = filepath.Join(venvPath, "bin", "pip")
	}
	if !FileExists(venvPythonPath) {
		return "", "", errors.New("failed to locate python in virtual environment")
	}

	log.Printf("INFO: %s Successfully created virtual environment at %s", logPrefix, venvPath)
	return venvPythonPath, venvPipPath, nil
}

// Run coverage tests using Poetry
func RunCoverageWithPoetry(dir string, logPrefix string, frameworks []string) (CoverageResponse, error) {
	log.Printf("INFO: %s Running coverage with Poetry", logPrefix)

	poetryPath := FindPoetryExecutable()
	if poetryPath == "" {
		return CoverageResponse{}, errors.New("poetry executable not found")
	}
	if err := InstallPoetryDependencies(dir, logPrefix); err != nil {
		log.Printf("WARNING: %s Failed to install Poetry dependencies: %v", logPrefix, err)
	}

	var runErr error
	var runOut []byte
	if Contains(frameworks, "pytest") || len(frameworks) == 0 {
		log.Printf("INFO: %s Running pytest with Poetry coverage", logPrefix)
		runCmd := exec.Command(poetryPath, "run", "coverage", "run", "--source=.", "-m", "pytest")
		runCmd.Dir = dir
		runOut, runErr = runCmd.CombinedOutput()

		if runErr != nil {
			log.Printf("WARNING: %s Poetry coverage with pytest failed: %v, output: %s", logPrefix, runErr, string(runOut))
			runCmd = exec.Command(poetryPath, "run", "pytest", "--cov=.", "--cov-report=term")
			runCmd.Dir = dir
			runOut, runErr = runCmd.CombinedOutput()

			if runErr == nil {
				log.Printf("INFO: %s Poetry pytest-cov succeeded", logPrefix)
				return parsePytestCovOutput(string(runOut), logPrefix)
			}
		} else {
			log.Printf("INFO: %s Poetry coverage run with pytest succeeded", logPrefix)
		}
	}
	if runErr != nil || Contains(frameworks, "unittest") {
		log.Printf("INFO: %s Trying unittest with Poetry", logPrefix)
		runCmd := exec.Command(poetryPath, "run", "coverage", "run", "--source=.", "-m", "unittest", "discover")
		runCmd.Dir = dir
		runOut, runErr = runCmd.CombinedOutput()

		if runErr != nil {
			log.Printf("WARNING: %s Poetry coverage with unittest failed: %v, output: %s", logPrefix, runErr, string(runOut))
		} else {
			log.Printf("INFO: %s Poetry coverage run with unittest succeeded", logPrefix)
		}
	}

	if runErr == nil {
		reportCmd := exec.Command(poetryPath, "run", "coverage", "report")
		reportCmd.Dir = dir
		reportOut, reportErr := reportCmd.CombinedOutput()

		if reportErr != nil {
			log.Printf("WARNING: %s Failed to generate Poetry coverage report: %v", logPrefix, reportErr)
		} else {
			return parseCoverageReport(string(reportOut), logPrefix)
		}
	}

	return CoverageResponse{}, runErr
}

// Run coverage tests using Pipenv
func RunCoverageWithPipenv(dir string, logPrefix string, frameworks []string) (CoverageResponse, error) {
	log.Printf("INFO: %s Running coverage with Pipenv", logPrefix)

	pipenvPath := FindPipenvExecutable()
	if pipenvPath == "" {
		return CoverageResponse{}, errors.New("pipenv executable not found")
	}

	if err := InstallPipenvDependencies(dir, logPrefix); err != nil {
		log.Printf("WARNING: %s Failed to install Pipenv dependencies: %v", logPrefix, err)
	}

	var runErr error
	var runOut []byte

	if Contains(frameworks, "pytest") || len(frameworks) == 0 {
		log.Printf("INFO: %s Running pytest with Pipenv coverage", logPrefix)

		runCmd := exec.Command(pipenvPath, "run", "coverage", "run", "--source=.", "-m", "pytest")
		runCmd.Dir = dir
		runOut, runErr = runCmd.CombinedOutput()

		if runErr != nil {
			log.Printf("WARNING: %s Pipenv coverage with pytest failed: %v, output: %s", logPrefix, runErr, string(runOut))

			// Try pytest-cov
			runCmd = exec.Command(pipenvPath, "run", "pytest", "--cov=.", "--cov-report=term")
			runCmd.Dir = dir
			runOut, runErr = runCmd.CombinedOutput()

			if runErr == nil {
				return parsePytestCovOutput(string(runOut), logPrefix)
			}
		} else {
			log.Printf("INFO: %s Pipenv coverage run with pytest succeeded", logPrefix)
		}
	}

	if runErr != nil || Contains(frameworks, "unittest") {
		log.Printf("INFO: %s Trying unittest with Pipenv", logPrefix)
		runCmd := exec.Command(pipenvPath, "run", "coverage", "run", "--source=.", "-m", "unittest", "discover")
		runCmd.Dir = dir
		runOut, runErr = runCmd.CombinedOutput()

		if runErr != nil {
			log.Printf("WARNING: %s Pipenv coverage with unittest failed: %v, output: %s", logPrefix, runErr, string(runOut))
		} else {
			log.Printf("INFO: %s Pipenv coverage run with unittest succeeded", logPrefix)
		}
	}

	if runErr == nil {
		reportCmd := exec.Command(pipenvPath, "run", "coverage", "report")
		reportCmd.Dir = dir
		reportOut, reportErr := reportCmd.CombinedOutput()

		if reportErr != nil {
			log.Printf("WARNING: %s Failed to generate Pipenv coverage report: %v", logPrefix, reportErr)
		} else {
			return parseCoverageReport(string(reportOut), logPrefix)
		}
	}

	return CoverageResponse{}, runErr
}

func parsePytestCovOutput(output string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Parsing pytest-cov output", logPrefix)

	re := regexp.MustCompile(`TOTAL\s+\d+\s+\d+\s+(\d+)%`)
	matches := re.FindStringSubmatch(output)

	if len(matches) < 2 {
		re = regexp.MustCompile(`Total coverage:\s*(\d+(?:\.\d+)?)%`)
		matches = re.FindStringSubmatch(output)
	}

	if len(matches) >= 2 {
		if totalCov, err := strconv.ParseFloat(matches[1], 64); err == nil {
			return CoverageResponse{TotalCoverage: totalCov, Files: []FileCoverage{}}, nil
		}
	}

	return CoverageResponse{}, errors.New("failed to parse pytest-cov output")
}

// Parse coverage report output to extract total coverage and file details
func parseCoverageReport(output string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Parsing coverage report", logPrefix)
	re := regexp.MustCompile(`TOTAL\s+\d+\s+\d+\s+(\d+)%`)
	matches := re.FindStringSubmatch(output)

	if len(matches) < 2 {
		log.Printf("WARNING: %s No total coverage found in report", logPrefix)
		return CoverageResponse{}, errors.New("no coverage data found in report")
	}

	totalCov, err := strconv.ParseFloat(matches[1], 64)
	if err != nil {
		return CoverageResponse{}, err
	}

	log.Printf("INFO: %s Successfully extracted total coverage: %.2f%%", logPrefix, totalCov)
	var files []FileCoverage
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "Name") ||
			strings.HasPrefix(line, "----") ||
			strings.HasPrefix(line, "TOTAL") ||
			strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 4 {
			fileName := fields[0]
			covStr := strings.TrimSuffix(fields[3], "%")
			if coverage, err := strconv.ParseFloat(covStr, 64); err == nil {
				files = append(files, FileCoverage{
					File:     fileName,
					Coverage: coverage,
				})
			}
		}
	}

	return CoverageResponse{TotalCoverage: totalCov, Files: files}, nil
}

// Estimate Python coverage by analyzing files
func EstimatePythonCoverage(dir string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Estimating Python coverage by analyzing files", logPrefix)
	var pyFiles []string
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if strings.HasPrefix(filepath.Base(path), ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if !info.IsDir() && strings.HasSuffix(path, ".py") &&
			!strings.Contains(filepath.Base(path), "test") && !strings.Contains(path, "/tests/") {
			pyFiles = append(pyFiles, path)
		}
		return nil
	})

	if err != nil {
		log.Printf("ERROR: %s Failed to walk directory: %v", logPrefix, err)
		return CoverageResponse{TotalCoverage: 0, Files: []FileCoverage{}}, errors.New("failed to analyze Python files")
	}

	if len(pyFiles) == 0 {
		log.Printf("WARNING: %s No Python files found in project", logPrefix)
		return CoverageResponse{TotalCoverage: 0, Files: []FileCoverage{}}, errors.New("no Python files found")
	}
	var testFiles []string
	_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if strings.HasPrefix(filepath.Base(path), ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if !info.IsDir() && strings.HasSuffix(path, ".py") &&
			(strings.Contains(filepath.Base(path), "test") || strings.Contains(path, "/tests/")) {
			testFiles = append(testFiles, path)
		}
		return nil
	})

	totalFiles := float64(len(pyFiles))
	totalTestFiles := float64(len(testFiles))

	if totalFiles == 0 {
		return CoverageResponse{TotalCoverage: 0, Files: []FileCoverage{}}, errors.New("no Python files found")
	}

	coverageEstimate := math.Min(100, (totalTestFiles/totalFiles)*50+10)

	log.Printf("INFO: %s Estimated coverage: %.2f%% (based on %d source files and %d test files)",
		logPrefix, coverageEstimate, int(totalFiles), int(totalTestFiles))

	var files []FileCoverage
	for _, file := range pyFiles {
		relPath, err := filepath.Rel(dir, file)
		if err != nil {
			relPath = file
		}

		hasDedicatedTests := false
		baseFilename := filepath.Base(file)
		baseNameWithoutExt := strings.TrimSuffix(baseFilename, filepath.Ext(baseFilename))
		testFilename := "test_" + baseNameWithoutExt + ".py"

		for _, testFile := range testFiles {
			if strings.HasSuffix(testFile, testFilename) {
				hasDedicatedTests = true
				break
			}
			content, err := os.ReadFile(testFile)
			if err == nil {
				if strings.Contains(string(content), "import "+baseNameWithoutExt) ||
					strings.Contains(string(content), "from "+baseNameWithoutExt) {
					hasDedicatedTests = true
					break
				}
			}
		}

		fileCoverage := coverageEstimate
		if hasDedicatedTests {
			fileCoverage = math.Min(100, fileCoverage+20)
		} else {
			fileCoverage = math.Max(0, fileCoverage-10)
		}

		files = append(files, FileCoverage{
			File:     relPath,
			Coverage: fileCoverage,
		})
	}

	return CoverageResponse{TotalCoverage: coverageEstimate, Files: files}, nil
}

// Run Python coverage tests on a directory
func RunPythonCoverage(dir string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Running comprehensive Python coverage analysis", logPrefix)

	projectInfo := DetectPythonProjectInfo(dir, logPrefix)
	if projectInfo.Type == UnknownProject {
		log.Printf("WARNING: %s Unknown Python project type, falling back to estimation", logPrefix)
		return EstimatePythonCoverage(dir, logPrefix)
	}

	frameworks := DetectPythonTestFrameworks(dir, projectInfo.PythonPath)

	var result CoverageResponse
	var err error

	switch projectInfo.Type {
	case PoetryProject:
		log.Printf("INFO: %s Processing Poetry project", logPrefix)
		result, err = RunCoverageWithPoetry(dir, logPrefix, frameworks)
		if err != nil {
			log.Printf("WARNING: %s Poetry coverage failed: %v, falling back to pip method", logPrefix, err)
			result, err = runStandardPythonCoverage(dir, logPrefix, projectInfo, frameworks)
		}

	case PipenvProject:
		log.Printf("INFO: %s Processing Pipenv project", logPrefix)
		result, err = RunCoverageWithPipenv(dir, logPrefix, frameworks)
		if err != nil {
			log.Printf("WARNING: %s Pipenv coverage failed: %v, falling back to pip method", logPrefix, err)
			result, err = runStandardPythonCoverage(dir, logPrefix, projectInfo, frameworks)
		}

	case CondaProject:
		log.Printf("INFO: %s Processing Conda project", logPrefix)
		if condaErr := InstallCondaDependencies(dir, logPrefix); condaErr != nil {
			log.Printf("WARNING: %s Conda setup failed: %v", logPrefix, condaErr)
		}
		result, err = runStandardPythonCoverage(dir, logPrefix, projectInfo, frameworks)

	case PipProject, SetupPyProject:
		log.Printf("INFO: %s Processing standard pip/setup.py project", logPrefix)
		result, err = runStandardPythonCoverage(dir, logPrefix, projectInfo, frameworks)

	default:
		log.Printf("WARNING: %s Unsupported project type, using estimation", logPrefix)
		return EstimatePythonCoverage(dir, logPrefix)
	}

	if err != nil {
		log.Printf("WARNING: %s All coverage methods failed: %v, falling back to estimation", logPrefix, err)
		return EstimatePythonCoverage(dir, logPrefix)
	}

	return result, nil
}

// Run coverage using standard pip/venv approach
func runStandardPythonCoverage(dir string, logPrefix string, projectInfo *PythonProjectInfo, frameworks []string) (CoverageResponse, error) {
	log.Printf("INFO: %s Running standard Python coverage", logPrefix)

	pythonPath := projectInfo.PythonPath
	if pythonPath == "" {
		log.Printf("ERROR: %s No Python executable found", logPrefix)
		return EstimatePythonCoverage(dir, logPrefix)
	}

	pipPath := FindPipExecutable(dir, pythonPath)

	var venvPythonPath, venvPipPath string
	var useVenv bool

	if pipPath != "" {
		log.Printf("INFO: %s Installing coverage packages using %s", logPrefix, pipPath)
		var installCmd *exec.Cmd
		if strings.Contains(pipPath, " -m pip") {
			parts := strings.Split(pipPath, " ")
			args := append(parts[1:], "install", "coverage", "pytest", "pytest-cov")
			installCmd = exec.Command(parts[0], args...)
		} else {
			installCmd = exec.Command(pipPath, "install", "coverage", "pytest", "pytest-cov")
		}
		installCmd.Dir = dir
		installOut, installErr := installCmd.CombinedOutput()

		if installErr != nil && strings.Contains(string(installOut), "externally-managed-environment") {
			log.Printf("INFO: %s Detected externally managed Python environment, switching to virtual environment", logPrefix)
			venvPython, venvPip, venvErr := CreatePythonVirtualEnv(dir, logPrefix)
			if venvErr == nil {
				venvPythonPath = venvPython
				venvPipPath = venvPip
				useVenv = true
				log.Printf("INFO: %s Installing packages in virtual environment with %s", logPrefix, venvPipPath)
				venvInstallCmd := exec.Command(venvPipPath, "install", "coverage", "pytest", "pytest-cov")
				venvInstallCmd.Dir = dir
				venvInstallOut, venvInstallErr := venvInstallCmd.CombinedOutput()
				if venvInstallErr != nil {
					log.Printf("WARNING: %s Failed to install packages in virtual environment: %v, output: %s",
						logPrefix, venvInstallErr, string(venvInstallOut))
				} else {
					log.Printf("INFO: %s Successfully installed packages in virtual environment", logPrefix)
				}
			} else {
				log.Printf("WARNING: %s Failed to create virtual environment: %v", logPrefix, venvErr)
			}
		} else if installErr != nil {
			log.Printf("WARNING: %s Failed to install coverage packages: %v, output: %s", logPrefix, installErr, string(installOut))
		} else {
			log.Printf("INFO: %s Successfully installed coverage packages", logPrefix)
		}
	} else {
		log.Printf("WARNING: %s No pip executable found, skipping package installation", logPrefix)
	}
	activePython := pythonPath
	if useVenv && venvPythonPath != "" {
		activePython = venvPythonPath
		log.Printf("INFO: %s Using virtual environment Python: %s", logPrefix, activePython)
	}

	var runErr error
	var runOut []byte
	coverageStrategies := []struct {
		name string
		cmd  []string
	}{
		{"pytest with coverage", []string{activePython, "-m", "coverage", "run", "--source=.", "-m", "pytest"}},
		{"pytest-cov plugin", []string{activePython, "-m", "pytest", "--cov=.", "--cov-report=term"}},
		{"unittest with coverage", []string{activePython, "-m", "coverage", "run", "--source=.", "-m", "unittest", "discover"}},
		{"unittest discovery", []string{activePython, "-m", "unittest", "discover", "-v"}},
	}

	for _, strategy := range coverageStrategies {
		if (strategy.name == "pytest with coverage" || strategy.name == "pytest-cov plugin") &&
			!Contains(frameworks, "pytest") && len(frameworks) > 0 {
			continue
		}
		if (strategy.name == "unittest with coverage" || strategy.name == "unittest discovery") &&
			!Contains(frameworks, "unittest") && Contains(frameworks, "pytest") {
			continue
		}

		log.Printf("INFO: %s Trying strategy: %s", logPrefix, strategy.name)

		runCmd := exec.Command(strategy.cmd[0], strategy.cmd[1:]...)
		runCmd.Dir = dir
		runOut, runErr = runCmd.CombinedOutput()

		if runErr == nil {
			log.Printf("INFO: %s Strategy '%s' succeeded", logPrefix, strategy.name)
			if strategy.name == "pytest-cov plugin" {
				if result, parseErr := parsePytestCovOutput(string(runOut), logPrefix); parseErr == nil {
					if useVenv {
						cleanupVirtualEnv(dir, logPrefix)
					}
					return result, nil
				}
			}
			break
		} else {
			log.Printf("WARNING: %s Strategy '%s' failed: %v, output: %s", logPrefix, strategy.name, runErr, string(runOut))
		}
	}
	if runErr == nil {
		reportCmd := exec.Command(activePython, "-m", "coverage", "report")
		reportCmd.Dir = dir
		reportOut, reportErr := reportCmd.CombinedOutput()

		if reportErr != nil {
			log.Printf("WARNING: %s Failed to generate coverage report: %v, output: %s", logPrefix, reportErr, string(reportOut))

			// Try alternative report generation methods
			if result := tryAlternativeReportMethods(activePython, dir, logPrefix); result != nil {
				if useVenv {
					cleanupVirtualEnv(dir, logPrefix)
				}
				return *result, nil
			}
		} else {
			log.Printf("INFO: %s Successfully generated coverage report", logPrefix)

			if result, parseErr := parseCoverageReport(string(reportOut), logPrefix); parseErr == nil {
				if useVenv {
					cleanupVirtualEnv(dir, logPrefix)
				}
				return result, nil
			}
		}
	}
	if useVenv {
		cleanupVirtualEnv(dir, logPrefix)
	}

	return runTestFilesDirectly(activePython, dir, logPrefix)
}

func tryAlternativeReportMethods(pythonPath, dir, logPrefix string) *CoverageResponse {
	log.Printf("INFO: %s Trying alternative report generation methods", logPrefix)
	covFile := filepath.Join(dir, ".coverage")
	if FileExists(covFile) {
		log.Printf("INFO: %s Found .coverage file, trying to generate JSON report", logPrefix)
		jsonCmd := exec.Command(pythonPath, "-m", "coverage", "json")
		jsonCmd.Dir = dir
		if jsonErr := jsonCmd.Run(); jsonErr == nil {
			jsonFile := filepath.Join(dir, "coverage.json")
			if FileExists(jsonFile) {
				if jsonData, err := os.ReadFile(jsonFile); err == nil {
					re := regexp.MustCompile(`"percent_covered":\s*([0-9]+\.?[0-9]*)`)
					match := re.FindStringSubmatch(string(jsonData))
					if len(match) >= 2 {
						if totalCov, parseErr := strconv.ParseFloat(match[1], 64); parseErr == nil {
							log.Printf("INFO: %s Successfully extracted coverage from JSON: %.2f%%", logPrefix, totalCov)
							return &CoverageResponse{TotalCoverage: totalCov, Files: []FileCoverage{}}
						}
					}
				}
			}
		}

		xmlCmd := exec.Command(pythonPath, "-m", "coverage", "xml")
		xmlCmd.Dir = dir
		xmlCmd.Run()
	}

	return nil
}

func runTestFilesDirectly(pythonPath, dir, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Attempting to run test files directly", logPrefix)

	// Find test files
	testFiles, _ := filepath.Glob(filepath.Join(dir, "test_*.py"))
	testDirs, _ := filepath.Glob(filepath.Join(dir, "tests"))

	for _, testDir := range testDirs {
		testDirFiles, _ := filepath.Glob(filepath.Join(testDir, "test_*.py"))
		testFiles = append(testFiles, testDirFiles...)
	}

	if len(testFiles) > 0 {
		log.Printf("INFO: %s Found %d test files, trying to run them with coverage", logPrefix, len(testFiles))
		successCount := 0

		for _, testFile := range testFiles {
			testCmd := exec.Command(pythonPath, "-m", "coverage", "run", "-a", "--source=.", testFile)
			testCmd.Dir = dir
			if testErr := testCmd.Run(); testErr != nil {
				log.Printf("WARNING: %s Failed to run test file %s: %v", logPrefix, testFile, testErr)
			} else {
				log.Printf("INFO: %s Successfully ran test file %s", logPrefix, testFile)
				successCount++
			}
		}

		if successCount > 0 {
			reportCmd := exec.Command(pythonPath, "-m", "coverage", "report")
			reportCmd.Dir = dir
			if reportOut, reportErr := reportCmd.CombinedOutput(); reportErr == nil {
				if result, parseErr := parseCoverageReport(string(reportOut), logPrefix); parseErr == nil {
					return result, nil
				}
			}
		}
	}
	log.Printf("INFO: %s All direct test execution failed, falling back to estimation", logPrefix)
	return EstimatePythonCoverage(dir, logPrefix)
}

// Remove the temporary virtual environment
func cleanupVirtualEnv(dir, logPrefix string) {
	venvPath := filepath.Join(dir, ".keploy_venv")
	if FileExists(venvPath) {
		log.Printf("INFO: %s Cleaning up virtual environment at %s", logPrefix, venvPath)
		os.RemoveAll(venvPath)
	}
}
