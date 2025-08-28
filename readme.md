<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/2/20/Keploy_Logo.png" alt="Keploy Logo" width="200"/>
</p>

<h1 align="center">Keploy App Dashboard With Metrics</h1>

<p align="center">
  A service to intelligently compute, visualize, and manage code coverage across multiple repositories and languages — integrated with Keploy.
</p>

---

[Keploy](https://keploy.io) is a no-code testing platform that generates tests from API calls.

This project adds a powerful capability to Keploy — **automated code coverage analysis and visualization**, helping teams understand, improve, and gate their repositories based on test coverage.

Maintainers and contributors to this project are expected to conduct themselves in a respectful way. See the [CNCF Community Code of Conduct](https://github.com/cncf/foundation/blob/master/code-of-conduct.md) as a reference.

---

# Code Coverage Dashboard

A comprehensive code coverage analysis tool that supports multiple programming languages (Go, Java, Python, JavaScript/TypeScript) and their respective testing frameworks.

## Table of Contents
- [Setup](#setup)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
- [Supported Languages](#supported-languages)
  - [Go Coverage](#go-coverage)
  - [Java Coverage](#java-coverage)
  - [Python Coverage](#python-coverage)
  - [JavaScript/TypeScript Coverage](#javascripttypescript-coverage)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Language-Specific Details](#language-specific-details)
- [Pull Request History](#pull-request-history)
- [Troubleshooting](#troubleshooting)

## Setup

### Prerequisites

Required tools and dependencies:

- Go 1.19 or later
- Node.js 16+ and npm/yarn
- Python 3.7+ and pip
- Java JDK 11+ and Maven/Gradle
- MongoDB 4.4+
- Git

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd app-dashboard
```

2. Install backend dependencies:
```bash
cd backend
go mod download
```

3. Install frontend dependencies:
```bash
cd poc-frontend
npm install
```

4. Set up MongoDB:
- Install MongoDB
- Create a new database
- Configure connection string in environment variables

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=8080
MONGODB_URI=mongodb://localhost:27017/coverage_dashboard
OPENAI_API_KEY=your_openai_api_key
```

## Supported Languages

### Go Coverage

Supported frameworks and tools:
- Native Go testing framework (`go test`)
- Coverage analysis with `go test -cover`
- JaCoCo reports parsing
- Custom coverage scripts

Features:
- Multi-module project support
- Concurrent package testing
- Coverage estimation for projects without tests

### Java Coverage

Supported build tools:
- Maven
- Gradle
- Ant
- SBT (for Scala projects)

Supported frameworks:
- JUnit 4/5
- TestNG
- Mockito
- Spock
- ScalaTest
- Specs2

Coverage tools:
- JaCoCo
- Cobertura
- Clover
- Codecov integration

Supported project types:
- Spring Boot
- Quarkus
- Micronaut
- Android
- Multi-module projects
- Kotlin/Scala projects

### Python Coverage

Supported package managers:
- pip
- Poetry
- Pipenv
- Conda

Testing frameworks:
- pytest
- unittest
- nose
- doctest

Coverage tools:
- coverage.py
- pytest-cov
- Coverage.py XML reports

Features:
- Virtual environment handling
- Multi-format report parsing
- Coverage estimation

### JavaScript/TypeScript Coverage

Supported frameworks:
- Jest
- Mocha
- Jasmine
- Karma
- NYC (Istanbul)

Project types:
- React
- Vue
- Angular
- Next.js
- Node.js
- Express

Features:
- TypeScript support
- React Testing Library
- Enzyme
- Vue Test Utils
- Angular Testing

## Project Structure

```
app-dashboard/
├── backend/
│   ├── handlers/      # Request handlers
│   ├── goutils/       # Go coverage utilities
│   ├── javautils/     # Java coverage utilities
│   ├── pythonutils/   # Python coverage utilities
│   ├── jsutils/       # JavaScript coverage utilities
│   └── main.go        # Main application
├── poc-frontend/
│   ├── src/
│   └── package.json
└── README.md
```

## API Endpoints

Coverage Analysis:
```
POST /coverage                 # Run coverage scan
GET  /coverage/history        # Get coverage history
GET  /coverage/:id            # Get coverage by ID
GET  /coverage/trends         # Get coverage trends
POST /coverage/branches       # Scan multiple branches
GET  /coverage/compare       # Compare branch coverage
GET  /coverage/status/:job_id # Get job status
```

Job Management:
```
GET    /coverage/jobs/active           # List active jobs
DELETE /coverage/jobs/:job_id          # Cancel job
GET    /coverage/jobs/:job_id/analysis # Get error analysis
```

## Language-Specific Details

### Java Project Detection

The system detects Java projects by:
1. Presence of build files (pom.xml, build.gradle)
2. Directory structure (src/main/java, src/test/java)
3. Framework-specific indicators

Common issues:
- External dependencies not found
- JDK version mismatches
- Build tool configuration issues

### Python Environment Handling

The system manages Python environments by:
1. Detecting virtual environments
2. Creating isolated test environments
3. Managing dependencies

Common issues:
- Poetry/Pipenv lock files
- System-wide Python conflicts
- Package version conflicts

### JavaScript/TypeScript Configuration

Project detection includes:
1. package.json analysis
2. Framework detection
3. Test configuration files

Common issues:
- Node version conflicts
- Missing dev dependencies
- Test configuration errors

## Pull Request History

Add your PR links and descriptions here:

1. [PR #123](link) - Initial project setup
2. [PR #124](link) - Added Java coverage support
3. ...

## Troubleshooting

### Common Issues

1. MongoDB Connection:
```
Error: MongoDB connection failed
Solution: Check MONGODB_URI and ensure MongoDB is running
```

2. Java Coverage:
```
Error: No JDK found
Solution: Set JAVA_HOME environment variable
```

3. Python Virtual Environments:
```
Error: externally-managed-environment
Solution: System creates isolated venv automatically
```

4. JavaScript Coverage:
```
Error: Cannot find module 'xyz'
Solution: Run npm install or check node_modules
```

### Coverage Analysis Failures

1. Repository Access:
- Ensure Git credentials are configured
- Check repository permissions
- Verify branch names

2. Build Failures:
- Check build tool installation
- Verify dependency versions
- Review build logs

3. Test Execution:
- Check test framework configuration
- Verify test dependencies
- Review test timeout settings

### Performance Optimization

1. Parallel Processing:
- Multi-module projects are processed concurrently
- Language-specific optimizations
- Caching mechanisms

2. Resource Management:
- Temporary file cleanup
- Process timeout handling
- Memory usage optimization

### Security Considerations

1. Repository Access:
- Use SSH keys when possible
- Implement token rotation
- Secure credential storage

2. API Security:
- Rate limiting
- Authentication
- Input validation

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Code style
- PR process
- Testing requirements
- Documentation updates