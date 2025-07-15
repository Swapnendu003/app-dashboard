# Building a Modern Code Coverage & Activity Dashboard: My Journey So Far

Hey there, fellow developers! 👋

Ever wondered how you could get a bird’s-eye view of your codebase’s health, track repository activity, and visualize test coverage across multiple languages—all in one place? In this blog, I’ll walk you through the platform I’ve been building, the technical challenges I faced, and the features I’ve implemented so far. Whether you’re a backend enthusiast, a frontend wizard, or just curious about building developer tools, there’s something here for you!

---

## 🚀 What Is This Platform?

This project is a **full-stack dashboard** for code coverage, repository activity, and developer insights. It’s designed to:

- **Scan repositories** (Go, Python, JavaScript/TypeScript)
- **Compute and visualize code coverage**
- **Track activity and contributions**
- **Show job status and history**
- **Provide a beautiful, interactive frontend**

> **Placeholder for a hero image of the dashboard UI**

---

## 🏗️ Architecture Overview

- **Backend:** Go (Gin framework), MongoDB, custom coverage runners for Go, Python, JS/TS
- **Frontend:** Next.js (TypeScript), Tailwind CSS, modular React components
- **Async Job System:** For long-running coverage scans
- **API Layer:** RESTful endpoints for all features

> **Placeholder for an architecture diagram**

---

## 🔍 Key Features (So Far)

### 1. Multi-Language Code Coverage

#### Advanced Project Type Detection
The dashboard uses sophisticated detection algorithms for each language:

```go
// Example: Multi-language detection strategy
if totalJSFiles > 0 && totalPyFiles > 0 {
    log.Printf("INFO: Detected mixed-language project")
    jsWeight := float64(totalJSFiles) / float64(totalFiles)
    pyWeight := float64(totalPyFiles) / float64(totalFiles)
    totalCoverage := jsCoverage*jsWeight + pyCoverage*pyWeight
}
```

#### Python Coverage System
Supports multiple project structures with intelligent fallbacks:

1. **Project Types**
   - **Poetry** (`pyproject.toml`, `poetry.lock`)
   ```go
   // Example: Poetry project detection and execution
   if info.HasPyProjectToml && info.HasPoetryLock {
       info.Type = PoetryProject
       poetryPath := FindPoetryExecutable()
       // Install deps: poetry install
       // Run tests: poetry run pytest --cov
   }
   ```
   - **Pipenv** (`Pipfile`, `Pipfile.lock`)
   - **Conda** (`environment.yml`, `conda.yml`)
   - **Standard Requirements** (`requirements.txt`)
   - **Setup.py Projects** (`setup.py`)
   - **Venv/Virtualenv** (auto-created if needed)

2. **Test Framework Detection**
   - Pytest
   - Unittest
   - Coverage.py
   - Custom test runners
   
3. **Environment Management**
   - Auto-detects virtual environments
   - Creates isolated test environments
   - Handles different Python versions
   
4. **Coverage Strategies (In Order)**
   ```go
   // 1. Poetry-specific coverage
   RunCoverageWithPoetry()
   // 2. Pipenv coverage
   RunCoverageWithPipenv()
   // 3. Conda coverage
   RunCoverageWithConda()
   // 4. Standard pytest/coverage
   runStandardPythonCoverage()
   // 5. Fallback to estimation
   EstimatePythonCoverage()
   ```

#### JavaScript/TypeScript Coverage System
Handles modern JS ecosystem complexities:

1. **Project Types**
   - **Node.js** (plain, Express, NestJS)
   - **React** (CRA, Next.js, Remix)
   - **Vue** (Vue 2/3, Nuxt)
   - **Angular** (Angular 2+)
   - **TypeScript** (with/without Babel)

2. **Package Managers**
   - npm
   - yarn
   - pnpm

3. **Test Frameworks**
   ```go
   type coverageStrategy struct {
       name    string
       execute func() (JSCoverageResponse, error)
   }

   strategies := []coverageStrategy{
       {"Angular CLI", runAngularCoverage},
       {"Jest", runJestCoverage},
       {"NYC", runNycCoverage},
       {"Vitest", runVitestCoverage},
   }
   ```

4. **Framework-Specific Strategies**
   ```go
   // Example: Angular coverage
   if projectInfo.Type == AngularProject {
       cmd := exec.Command("ng", "test", "--code-coverage")
       // Parse lcov output
   }

   // Example: Jest coverage
   if strings.Contains(packageJson, "jest") {
       cmd := exec.Command("npx", "jest", "--coverage")
       // Parse coverage output
   }
   ```

### 2. Advanced Async Job System

The async job system is implemented using a combination of in-memory state and MongoDB persistence:

1. **Job Creation & Tracking**
```go
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

// In-memory job tracking
var activeJobs = make(map[string]*JobStatus)
var completedJobs = make(map[string]*JobStatus)
var jobsMutex sync.RWMutex
```

2. **Progress Updates**
```go
// Progress update goroutine
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
```

3. **Job Cleanup System**
```go
func CleanupOldJobs() {
    ticker := time.NewTicker(1 * time.Hour)
    go func() {
        for {
            select {
            case <-ticker.C:
                // Clean up completed jobs older than 24h
                // Mark stuck jobs as failed after 2h
                performJobCleanup()
            }
        }
    }()
}
```

4. **Error Recovery**
```go
defer func() {
    if r := recover(); r != nil {
        log.Printf("ERROR: Panic in async coverage scan: %v", r)
        updateJobStatus(jobID, "failed", "", "Internal server error")
    }
}()
```

### 3. Activity & Contribution Tracking
- Tracks repository activity (commits, PRs, etc.)
- Visualizes user contributions over time
- Activity graphs and lists

> **Placeholder for an activity graph screenshot**

### 4. Beautiful, Interactive Frontend
- Built with Next.js and Tailwind CSS
- Modular components: Sidebar, Coverage Cards, Activity Graphs, File Heatmaps
- Responsive and modern UI
- Authenticated routes and user settings

```tsx
// Example: Coverage Card component (poc-frontend/src/components/CoverageVisualizations/CoverageCard.tsx)
export function CoverageCard({ coverage }) {
  return (
    <div className="p-4 bg-white rounded shadow">
      <h3>Total Coverage</h3>
      <p className="text-2xl font-bold">{coverage}%</p>
    </div>
  );
}
```

### 5. History & Branch Comparison
- View coverage history for each repo/branch
- Compare coverage across branches
- Drill down to file-level heatmaps

> **Placeholder for a branch comparison screenshot**

---

## 🧩 Technical Highlights

- **Dynamic Language Detection:**
  - Scans repo for Go, Python, JS/TS files
  - Picks the right coverage tool automatically
  - For Python: detects Poetry, Pipenv, Conda, requirements.txt, setup.py, venv
  - For JS: detects React, Angular, Vue, Next.js, TypeScript, Express, NestJS, etc.
- **Parallel Processing:**
  - Runs coverage in parallel for multi-module Go projects
  - Async job system for scalability
- **Error Handling:**
  - Captures file-specific errors and displays them in the UI
  - For Python/JS, parses error output and attaches to file-level results
- **Extensible Design:**
  - Easy to add new languages or coverage tools
  - Modular backend and frontend structure

---

## 🛠️ Challenges & Learnings

- Handling mixed-language repos and normalizing coverage
- Dealing with flaky or slow coverage tools (e.g., timeouts, missing dependencies)
- Supporting many Python/JS project types and test frameworks
- Designing a job system that’s both robust and user-friendly
- Making the UI both beautiful and information-dense

---


## 🙌 Let’s Connect!

I’d love to hear your feedback, ideas, or questions. What features would you want in a code coverage dashboard? Drop a comment or reach out!

> **Placeholder for a call-to-action image or contact info**

---

Thanks for reading and happy coding! 🚀
```go
func processGoDirectoriesInParallel(goDirectories []string, tmpDir string, logPrefix string) (CoverageResponse, bool) {
    maxWorkers := min(len(goDirectories), runtime.NumCPU())
    log.Printf("INFO: %s Using %d workers for parallel processing", logPrefix, maxWorkers)
    resultsChan := make(chan CoverageResult, len(goDirectories))
    semaphore := make(chan struct{}, maxWorkers)
    // Process each module concurrently
    for _, dir := range goDirectories {
        go func(directory string) {
            defer wg.Done()
            semaphore <- struct{}{}
            defer func() { <-semaphore }()
            
            coverage, files, err := runGoModuleCoverage(directory, logPrefix)
            // Handle results...
        }(dir)
    }
}
```