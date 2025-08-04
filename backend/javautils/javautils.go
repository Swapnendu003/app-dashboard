package javautils

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type FileCoverage struct {
	File     string  `json:"file"`
	Coverage float64 `json:"coverage"`
	Error    string  `json:"error,omitempty"`
	Status   string  `json:"status"`
}

type JavaFileStats struct {
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
	ProjectType   string         `json:"project_type,omitempty"`
	BuildTool     string         `json:"build_tool,omitempty"`
	Framework     string         `json:"framework,omitempty"`
}

type JavaCoverageResponse = CoverageResponse

type JavaProjectType int

const (
	UnknownProject JavaProjectType = iota
	MavenProject
	GradleProject
	AntProject
	SimpleJavaProject
	SpringBootProject
	QuarkusProject
	MicronautProject
	AndroidProject
	AndroidLibraryProject
	ScalaProject
	KotlinProject
	PlayFrameworkProject
	MavenMultiModuleProject
	GradleMultiModuleProject
	JavaEEProject
	JakartaEEProject
	VertxProject
	MicronautGraalProject
	NativeImageProject
	LombokProject
	BazelProject
	SBTProject 
	LeiningenProject 
	DropwizardProject
	SparkJavaProject
	JHipsterProject
)

type JavaBuildTool int

const (
	UnknownBuildTool JavaBuildTool = iota
	Maven
	Gradle
	Ant
	SBT
	Bazel
	Leiningen
	Mill
	IvyBuildTool
	MakefileBuild
)

type JavaProjectInfo struct {
	Type             JavaProjectType
	BuildTool        JavaBuildTool
	HasPomXml        bool
	HasBuildGradle   bool
	HasBuildXml      bool
	HasGradleWrapper bool
	HasMavenWrapper  bool
	IsSpringBoot     bool
	IsQuarkus        bool
	IsMicronaut      bool
	IsAndroid        bool
	IsScala          bool
	IsKotlin         bool
	IsMultiModule    bool
	JavaPath         string
	WorkingDir       string
	TestFrameworks   []string
	CoverageTools    []string
	Framework        string
	Languages        []string
	SourceDirs       []string
	TestDirs         []string
	BuildFiles       []string
	ConfigFiles      []string
	HasDocker        bool
	HasK8s           bool
	HasCI            bool
	CITools          []string
	PackageManager   string
	JDKVersion       string
	Dependencies     map[string]string
}

// Enhanced file existence check with symlink support
func FileExists(path string) bool {
	info, err := os.Lstat(path)
	if err != nil {
		return false
	}
	if info.Mode()&os.ModeSymlink != 0 {
		if _, err := os.Stat(path); err != nil {
			return false
		}
	}
	
	return !info.IsDir()
}

// Enhanced directory existence check
func DirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// Find all files matching patterns recursively
func FindFiles(dir string, patterns []string) []string {
	var files []string
	
	for _, pattern := range patterns {
		matches, err := filepath.Glob(filepath.Join(dir, pattern))
		if err == nil {
			files = append(files, matches...)
		}
		err = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil 
			}
			
			if info.IsDir() {
				dirName := filepath.Base(path)
				if shouldSkipDirectory(dirName) {
					return filepath.SkipDir
				}
				return nil
			}
			
			if matched, _ := filepath.Match(pattern, filepath.Base(path)); matched {
				files = append(files, path)
			}
			
			return nil
		})
	}
	
	return removeDuplicates(files)
}

// Check if directory should be skipped during traversal
func shouldSkipDirectory(dirName string) bool {
	skipDirs := []string{
		".git", ".svn", ".hg", ".bzr",
		"node_modules", ".npm", "npm-cache",
		"build", "target", "dist", "out",
		".gradle", ".maven", ".m2",
		"bin", "obj", "debug", "release",
		".idea", ".vscode", ".eclipse",
		"__pycache__", ".pytest_cache",
		"coverage", "htmlcov", ".nyc_output",
		"logs", "tmp", "temp", ".tmp",
		".docker", "docker-compose",
		".terraform", ".vagrant",
	}
	
	for _, skip := range skipDirs {
		if dirName == skip {
			return true
		}
	}
	if strings.HasPrefix(dirName, ".") && len(dirName) > 1 {
		return true
	}
	
	return false
}

// Remove duplicate strings from slice
func removeDuplicates(slice []string) []string {
	keys := make(map[string]bool)
	var result []string
	
	for _, item := range slice {
		if !keys[item] {
			keys[item] = true
			result = append(result, item)
		}
	}
	
	return result
}

// Function for Java project detection with comprehensive analysis
func DetectJavaProjectInfo(dir string, logPrefix string) *JavaProjectInfo {
	log.Printf("INFO: %s Analyzing comprehensive Java project structure in %s", logPrefix, dir)

	info := &JavaProjectInfo{
		Type:         UnknownProject,
		BuildTool:    UnknownBuildTool,
		WorkingDir:   dir,
		Languages:    []string{},
		SourceDirs:   []string{},
		TestDirs:     []string{},
		BuildFiles:   []string{},
		ConfigFiles:  []string{},
		Dependencies: make(map[string]string),
	}

	info.detectBuildSystem(dir, logPrefix)
	info.detectProjectType(dir, logPrefix)
	info.detectLanguages(dir, logPrefix)
	info.detectFrameworks(dir, logPrefix)
	info.detectSourceStructure(dir, logPrefix)
	info.detectInfrastructure(dir, logPrefix)
	
	info.JavaPath = FindJavaExecutable()
	info.TestFrameworks = DetectJavaTestFrameworks(dir, logPrefix)
	info.CoverageTools = DetectJavaCoverageTools(dir, logPrefix)
	info.JDKVersion = detectJDKVersion(dir, info.JavaPath, logPrefix)
	info.analyzeDependencies(dir, logPrefix)

	return info
}

// Detect build system comprehensively
func (info *JavaProjectInfo) detectBuildSystem(dir string, logPrefix string) {
	buildFiles := map[string]JavaBuildTool{
		"pom.xml":           Maven,
		"build.gradle":      Gradle,
		"build.gradle.kts":  Gradle,
		"build.xml":         Ant,
		"build.sbt":         SBT,
		"project/build.scala": SBT,
		"BUILD":             Bazel,
		"BUILD.bazel":       Bazel,
		"WORKSPACE":         Bazel,
		"project.clj":       Leiningen,
		"build.mill":        Mill,
		"ivy.xml":           IvyBuildTool,
		"Makefile":          MakefileBuild,
		"makefile":          MakefileBuild,
	}

	for file, tool := range buildFiles {
		fullPath := filepath.Join(dir, file)
		if FileExists(fullPath) {
			info.BuildFiles = append(info.BuildFiles, fullPath)
			if info.BuildTool == UnknownBuildTool {
				info.BuildTool = tool
				log.Printf("INFO: %s Detected build tool: %s (from %s)", logPrefix, getBuildToolName(tool), file)
			}
		}
	}
	info.HasMavenWrapper = FileExists(filepath.Join(dir, "mvnw")) || FileExists(filepath.Join(dir, "mvnw.cmd"))
	info.HasGradleWrapper = FileExists(filepath.Join(dir, "gradlew")) || FileExists(filepath.Join(dir, "gradlew.bat"))

	switch info.BuildTool {
	case Maven:
		info.Type = MavenProject
	case Gradle:
		info.Type = GradleProject
	case Ant:
		info.Type = AntProject
	case SBT:
		info.Type = ScalaProject
	case Bazel:
		info.Type = BazelProject
	case Leiningen:
		info.Type = LeiningenProject
	}
}

// Detect project type with enhanced recognition
func (info *JavaProjectInfo) detectProjectType(dir string, logPrefix string) {
	if info.BuildTool == Maven && info.detectMavenMultiModule(dir) {
		info.Type = MavenMultiModuleProject
		info.IsMultiModule = true
		log.Printf("INFO: %s Detected Maven multi-module project", logPrefix)
	} else if info.BuildTool == Gradle && info.detectGradleMultiModule(dir) {
		info.Type = GradleMultiModuleProject
		info.IsMultiModule = true
		log.Printf("INFO: %s Detected Gradle multi-module project", logPrefix)
	}
	if info.detectAndroidProject(dir) {
		info.IsAndroid = true
		if info.detectAndroidLibrary(dir) {
			info.Type = AndroidLibraryProject
		} else {
			info.Type = AndroidProject
		}
		log.Printf("INFO: %s Detected Android project", logPrefix)
	}
	indicators := map[string]JavaProjectType{
		"src/main/webapp/WEB-INF/web.xml": JavaEEProject,
		"src/main/webapp/WEB-INF/beans.xml": JakartaEEProject,
		"jhipster": JHipsterProject,
	}

	for indicator, projectType := range indicators {
		if FileExists(filepath.Join(dir, indicator)) || info.containsInBuildFiles(indicator) {
			info.Type = projectType
			log.Printf("INFO: %s Detected project type: %s", logPrefix, getProjectTypeName(projectType))
			break
		}
	}
}

// Detect programming languages in the project
func (info *JavaProjectInfo) detectLanguages(dir string, logPrefix string) {
	languagePatterns := map[string][]string{
		"Java":       {"**/*.java"},
		"Kotlin":     {"**/*.kt", "**/*.kts"},
		"Scala":      {"**/*.scala"},
		"Groovy":     {"**/*.groovy"},
		"Clojure":    {"**/*.clj", "**/*.cljs", "**/*.cljc"},
		"JavaScript": {"**/*.js", "**/*.mjs"},
		"TypeScript": {"**/*.ts"},
		"XML":        {"**/*.xml"},
		"YAML":       {"**/*.yml", "**/*.yaml"},
		"JSON":       {"**/*.json"},
		"Properties": {"**/*.properties"},
	}

	for language, patterns := range languagePatterns {
		files := FindFiles(dir, patterns)
		if len(files) > 0 {
			info.Languages = append(info.Languages, language)
			
			switch language {
			case "Kotlin":
				info.IsKotlin = true
			case "Scala":
				info.IsScala = true
			}
		}
	}

	log.Printf("INFO: %s Detected languages: %v", logPrefix, info.Languages)
}

// Detect frameworks with comprehensive analysis
func (info *JavaProjectInfo) detectFrameworks(dir string, logPrefix string) {
	frameworks := info.analyzeFrameworksInBuildFiles(dir)

	structureIndicators := map[string]string{
		"src/main/resources/application.properties": "Spring Boot",
		"src/main/resources/application.yml":        "Spring Boot",
		"src/main/resources/application.yaml":       "Spring Boot",
		"quarkus.properties":                        "Quarkus",
		"src/main/resources/META-INF/microprofile-config.properties": "MicroProfile",
		"play.sbt":                                  "Play Framework",
		"conf/application.conf":                     "Play Framework",
		"vertx-stack.json":                          "Vert.x",
		"docker-compose.yml":                        "Docker Compose",
		"Dockerfile":                                "Docker",
		"k8s":                                      "Kubernetes",
		"kubernetes":                               "Kubernetes",
	}

	for indicator, framework := range structureIndicators {
		if FileExists(filepath.Join(dir, indicator)) || DirExists(filepath.Join(dir, indicator)) {
			frameworks = append(frameworks, framework)
		}
	}
	for _, framework := range frameworks {
		switch framework {
		case "Spring Boot":
			info.IsSpringBoot = true
			info.Framework = "Spring Boot"
		case "Quarkus":
			info.IsQuarkus = true
			info.Framework = "Quarkus"
		case "Micronaut":
			info.IsMicronaut = true
			info.Framework = "Micronaut"
		case "Play Framework":
			info.Type = PlayFrameworkProject
			info.Framework = "Play Framework"
		case "Vert.x":
			info.Type = VertxProject
			info.Framework = "Vert.x"
		case "Dropwizard":
			info.Type = DropwizardProject
			info.Framework = "Dropwizard"
		case "Spark Java":
			info.Type = SparkJavaProject
			info.Framework = "Spark Java"
		}
	}

	log.Printf("INFO: %s Detected frameworks: %v", logPrefix, removeDuplicates(frameworks))
}

// Analyze frameworks in build files
func (info *JavaProjectInfo) analyzeFrameworksInBuildFiles(dir string) []string {
	var frameworks []string
	
	for _, buildFile := range info.BuildFiles {
		content, err := os.ReadFile(buildFile)
		if err != nil {
			continue
		}
		
		contentStr := string(content)
		
		frameworkPatterns := map[string]string{
			"spring-boot":              "Spring Boot",
			"org.springframework":      "Spring Framework",
			"quarkus":                  "Quarkus",
			"micronaut":                "Micronaut",
			"jakarta.ee":               "Jakarta EE",
			"javax.servlet":            "Java EE",
			"play-java":                "Play Framework",
			"vertx":                    "Vert.x",
			"dropwizard":               "Dropwizard",
			"spark-java":               "Spark Java",
			"jhipster":                 "JHipster",
			"lombok":                   "Lombok",
			"graalvm":                  "GraalVM",
			"native-image":             "GraalVM Native Image",
			"android":                  "Android",
			"kotlin":                   "Kotlin",
			"scala":                    "Scala",
		}
		
		for pattern, framework := range frameworkPatterns {
			if strings.Contains(strings.ToLower(contentStr), pattern) {
				frameworks = append(frameworks, framework)
			}
		}
	}
	
	return frameworks
}

// Detect source and test directory structure
func (info *JavaProjectInfo) detectSourceStructure(dir string, logPrefix string) {
	
	standardDirs := []string{
		"src/main/java", "src/main/kotlin", "src/main/scala", "src/main/groovy",
		"src/test/java", "src/test/kotlin", "src/test/scala", "src/test/groovy",
		"src/androidTest/java", "src/androidTest/kotlin",
		"src/integrationTest/java", "src/integrationTest/kotlin",
	}
	additionalSourcePatterns := []string{
		"app/src/main/java", "app/src/main/kotlin",
		"lib/src/main/java", "lib/src/main/kotlin",
		"*/src/main/java", "*/src/main/kotlin",
		"src", "source", "sources",
		"java", "kotlin", "scala",
	}
	for _, dir := range standardDirs {
		fullPath := filepath.Join(info.WorkingDir, dir)
		if DirExists(fullPath) {
			if strings.Contains(dir, "test") {
				info.TestDirs = append(info.TestDirs, fullPath)
			} else {
				info.SourceDirs = append(info.SourceDirs, fullPath)
			}
		}
	}
	if len(info.SourceDirs) == 0 {
		for _, pattern := range additionalSourcePatterns {
			matches, err := filepath.Glob(filepath.Join(info.WorkingDir, pattern))
			if err == nil {
				for _, match := range matches {
					if DirExists(match) && containsSourceFiles(match) {
						info.SourceDirs = append(info.SourceDirs, match)
					}
				}
			}
		}
	}

	log.Printf("INFO: %s Source directories: %v", logPrefix, info.SourceDirs)
	log.Printf("INFO: %s Test directories: %v", logPrefix, info.TestDirs)
}

// Check if directory contains source files
func containsSourceFiles(dir string) bool {
	sourceExtensions := []string{".java", ".kt", ".scala", ".groovy", ".clj"}
	
	count := 0
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		
		for _, ext := range sourceExtensions {
			if strings.HasSuffix(path, ext) {
				count++
				if count >= 1 { 
					return filepath.SkipDir
				}
			}
		}
		return nil
	})
	
	return count > 0
}

// Detect infrastructure and DevOps configurations
func (info *JavaProjectInfo) detectInfrastructure(dir string, logPrefix string) {
	dockerFiles := []string{"Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".dockerignore"}
	for _, file := range dockerFiles {
		if FileExists(filepath.Join(dir, file)) {
			info.HasDocker = true
			info.ConfigFiles = append(info.ConfigFiles, filepath.Join(dir, file))
		}
	}
	k8sDirs := []string{"k8s", "kubernetes", "deployment", "manifests"}
	k8sFiles := []string{"*.yaml", "*.yml"}
	
	for _, k8sDir := range k8sDirs {
		k8sPath := filepath.Join(dir, k8sDir)
		if DirExists(k8sPath) {
			info.HasK8s = true
			for _, pattern := range k8sFiles {
				matches, _ := filepath.Glob(filepath.Join(k8sPath, pattern))
				info.ConfigFiles = append(info.ConfigFiles, matches...)
			}
		}
	}
	ciIndicators := map[string]string{
		".github/workflows":     "GitHub Actions",
		".gitlab-ci.yml":        "GitLab CI",
		"Jenkinsfile":           "Jenkins",
		".travis.yml":           "Travis CI",
		"circle.yml":            "CircleCI",
		".circleci/config.yml":  "CircleCI",
		"azure-pipelines.yml":   "Azure Pipelines",
		"bitbucket-pipelines.yml": "Bitbucket Pipelines",
		".buildkite":            "Buildkite",
		"drone.yml":             "Drone CI",
	}

	for indicator, tool := range ciIndicators {
		indicatorPath := filepath.Join(dir, indicator)
		if FileExists(indicatorPath) || DirExists(indicatorPath) {
			info.HasCI = true
			info.CITools = append(info.CITools, tool)
			info.ConfigFiles = append(info.ConfigFiles, indicatorPath)
		}
	}

	log.Printf("INFO: %s Infrastructure - Docker: %t, K8s: %t, CI: %t (%v)", 
		logPrefix, info.HasDocker, info.HasK8s, info.HasCI, info.CITools)
}

// Function for Maven multi-module detection
func (info *JavaProjectInfo) detectMavenMultiModule(dir string) bool {
	pomPath := filepath.Join(dir, "pom.xml")
	if !FileExists(pomPath) {
		return false
	}

	content, err := os.ReadFile(pomPath)
	if err != nil {
		return false
	}

	contentStr := string(content)
	return strings.Contains(contentStr, "<modules>") || strings.Contains(contentStr, "<module>")
}

// Function for Gradle multi-module detection
func (info *JavaProjectInfo) detectGradleMultiModule(dir string) bool {
	settingsFiles := []string{"settings.gradle", "settings.gradle.kts"}
	
	for _, settingsFile := range settingsFiles {
		settingsPath := filepath.Join(dir, settingsFile)
		if FileExists(settingsPath) {
			content, err := os.ReadFile(settingsPath)
			if err != nil {
				continue
			}
			
			contentStr := string(content)
			if strings.Contains(contentStr, "include") && (strings.Contains(contentStr, ":") || strings.Contains(contentStr, "'") || strings.Contains(contentStr, "\"")) {
				return true
			}
		}
	}
	
	return false
}

// Function for Android project detection
func (info *JavaProjectInfo) detectAndroidProject(dir string) bool {
	androidIndicators := []string{
		"app/build.gradle",
		"app/build.gradle.kts",
		"app/src/main/AndroidManifest.xml",
		"src/main/AndroidManifest.xml",
		"gradle.properties",
		"local.properties",
	}

	for _, indicator := range androidIndicators {
		if FileExists(filepath.Join(dir, indicator)) {
			return true
		}
	}
	for _, buildFile := range info.BuildFiles {
		content, err := os.ReadFile(buildFile)
		if err != nil {
			continue
		}

		contentStr := string(content)
		if strings.Contains(contentStr, "com.android.application") ||
		   strings.Contains(contentStr, "com.android.library") ||
		   strings.Contains(contentStr, "com.android.feature") ||
		   strings.Contains(contentStr, "com.android.dynamic-feature") {
			return true
		}
	}

	return false
}

// Detect Android library project
func (info *JavaProjectInfo) detectAndroidLibrary(dir string) bool {
	for _, buildFile := range info.BuildFiles {
		content, err := os.ReadFile(buildFile)
		if err != nil {
			continue
		}

		contentStr := string(content)
		if strings.Contains(contentStr, "com.android.library") {
			return true
		}
	}
	return false
}

// Check if build files contain specific content
func (info *JavaProjectInfo) containsInBuildFiles(searchTerm string) bool {
	for _, buildFile := range info.BuildFiles {
		content, err := os.ReadFile(buildFile)
		if err != nil {
			continue
		}

		if strings.Contains(string(content), searchTerm) {
			return true
		}
	}
	return false
}

// Analyze project dependencies
func (info *JavaProjectInfo) analyzeDependencies(dir string, logPrefix string) {
	switch info.BuildTool {
	case Maven:
		info.analyzeMavenDependencies(dir, logPrefix)
	case Gradle:
		info.analyzeGradleDependencies(dir, logPrefix)
	case SBT:
		info.analyzeSBTDependencies(dir, logPrefix)
	}
}

// Analyze Maven dependencies
func (info *JavaProjectInfo) analyzeMavenDependencies(dir string, logPrefix string) {
	pomPath := filepath.Join(dir, "pom.xml")
	if !FileExists(pomPath) {
		return
	}

	content, err := os.ReadFile(pomPath)
	if err != nil {
		return
	}

	contentStr := string(content)
	
	depPatterns := map[string]string{
		`junit.*?(\d+\.\d+\.\d+)`:                    "JUnit",
		`testng.*?(\d+\.\d+\.\d+)`:                   "TestNG",
		`spring-boot.*?(\d+\.\d+\.\d+)`:              "Spring Boot",
		`spring-framework.*?(\d+\.\d+\.\d+)`:         "Spring Framework",
		`hibernate.*?(\d+\.\d+\.\d+)`:                "Hibernate",
		`jackson.*?(\d+\.\d+\.\d+)`:                  "Jackson",
		`slf4j.*?(\d+\.\d+\.\d+)`:                    "SLF4J",
		`logback.*?(\d+\.\d+\.\d+)`:                  "Logback",
		`mockito.*?(\d+\.\d+\.\d+)`:                  "Mockito",
		`guava.*?(\d+\.\d+\.\d+)`:                    "Guava",
		`apache.commons.*?(\d+\.\d+\.\d+)`:           "Apache Commons",
	}

	for pattern, depName := range depPatterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(contentStr)
		if len(matches) > 1 {
			info.Dependencies[depName] = matches[1]
		} else if strings.Contains(contentStr, strings.ToLower(depName)) {
			info.Dependencies[depName] = "detected"
		}
	}
}

// Analyze Gradle dependencies
func (info *JavaProjectInfo) analyzeGradleDependencies(dir string, logPrefix string) {
	buildFiles := []string{"build.gradle", "build.gradle.kts"}
	
	for _, buildFile := range buildFiles {
		buildPath := filepath.Join(dir, buildFile)
		if !FileExists(buildPath) {
			continue
		}

		content, err := os.ReadFile(buildPath)
		if err != nil {
			continue
		}

		contentStr := string(content)
		info.extractGradleDependencies(contentStr)
		break
	}
}

// Extract Gradle dependencies from build file content
func (info *JavaProjectInfo) extractGradleDependencies(content string) {
	depPatterns := map[string]string{
		`junit.*?(\d+\.\d+\.\d+)`:              "JUnit",
		`testng.*?(\d+\.\d+\.\d+)`:             "TestNG",
		`spring-boot.*?(\d+\.\d+\.\d+)`:        "Spring Boot",
		`kotlin.*?(\d+\.\d+\.\d+)`:             "Kotlin",
		`scala.*?(\d+\.\d+\.\d+)`:              "Scala",
	}

	for pattern, depName := range depPatterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(content)
		if len(matches) > 1 {
			info.Dependencies[depName] = matches[1]
		} else if strings.Contains(strings.ToLower(content), strings.ToLower(depName)) {
			info.Dependencies[depName] = "detected"
		}
	}
}

// Analyze SBT dependencies (for Scala projects)
func (info *JavaProjectInfo) analyzeSBTDependencies(dir string, logPrefix string) {
	sbtFiles := []string{"build.sbt", "project/build.scala", "project/Build.scala"}
	
	for _, sbtFile := range sbtFiles {
		sbtPath := filepath.Join(dir, sbtFile)
		if !FileExists(sbtPath) {
			continue
		}

		content, err := os.ReadFile(sbtPath)
		if err != nil {
			continue
		}

		contentStr := string(content)
		if strings.Contains(contentStr, "scalatest") {
			info.Dependencies["ScalaTest"] = "detected"
		}
		if strings.Contains(contentStr, "specs2") {
			info.Dependencies["Specs2"] = "detected"
		}
		if strings.Contains(contentStr, "akka") {
			info.Dependencies["Akka"] = "detected"
		}
	}
}

// Function to find Java executable
func FindJavaExecutable() string {
	log.Printf("INFO: Looking for Java executable")

	javaCommands := []string{"java"}
	if javaHome := os.Getenv("JAVA_HOME"); javaHome != "" {
		javaPath := filepath.Join(javaHome, "bin", "java")
		if runtime.GOOS == "windows" {
			javaPath += ".exe"
		}
		javaCommands = append([]string{javaPath}, javaCommands...)
	}
	commonPaths := []string{
		"/usr/bin/java",
		"/usr/local/bin/java",
		"/opt/java/bin/java",
		"/usr/lib/jvm/default-java/bin/java",
		"/usr/lib/jvm/java-11-openjdk/bin/java",
		"/usr/lib/jvm/java-17-openjdk/bin/java",
		"/usr/lib/jvm/java-21-openjdk/bin/java",
	}
	
	if runtime.GOOS == "windows" {
		windowsPaths := []string{
			"C:\\Program Files\\Java\\jdk-11\\bin\\java.exe",
			"C:\\Program Files\\Java\\jdk-17\\bin\\java.exe",
			"C:\\Program Files\\Java\\jdk-21\\bin\\java.exe",
			"C:\\Program Files\\OpenJDK\\jdk-11\\bin\\java.exe",
			"C:\\Program Files\\OpenJDK\\jdk-17\\bin\\java.exe",
			"C:\\Program Files\\Eclipse Adoptium\\jdk-11\\bin\\java.exe",
			"C:\\Program Files\\Eclipse Adoptium\\jdk-17\\bin\\java.exe",
		}
		commonPaths = append(commonPaths, windowsPaths...)
	} else if runtime.GOOS == "darwin" {
		macPaths := []string{
			"/Library/Java/JavaVirtualMachines/openjdk-11.jdk/Contents/Home/bin/java",
			"/Library/Java/JavaVirtualMachines/openjdk-17.jdk/Contents/Home/bin/java",
			"/Library/Java/JavaVirtualMachines/temurin-11.jdk/Contents/Home/bin/java",
			"/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java",
			"/usr/libexec/java_home",
		}
		commonPaths = append(commonPaths, macPaths...)
	}
	
	javaCommands = append(javaCommands, commonPaths...)

	for _, cmd := range javaCommands {
		if FileExists(cmd) {
			log.Printf("INFO: Found Java at %s", cmd)
			return cmd
		}
	
		if runtime.GOOS != "windows" {
			checkCmd := exec.Command("which", cmd)
			if out, err := checkCmd.Output(); err == nil {
				javaPath := strings.TrimSpace(string(out))
				if FileExists(javaPath) {
					log.Printf("INFO: Found Java at %s", javaPath)
					return javaPath
				}
			}
		}
	}
	if err := exec.Command("java", "-version").Run(); err == nil {
		log.Printf("INFO: Found Java in PATH")
		return "java"
	}

	log.Printf("WARNING: Could not find Java executable")
	return ""
}

// Function to find Maven executable
func FindMavenExecutable(dir string) string {
	log.Printf("INFO: Looking for Maven executable")

	if runtime.GOOS == "windows" {
		if FileExists(filepath.Join(dir, "mvnw.cmd")) {
			log.Printf("INFO: Found Maven wrapper at mvnw.cmd")
			return filepath.Join(dir, "mvnw.cmd")
		}
	} else {
		if FileExists(filepath.Join(dir, "mvnw")) {
			if err := os.Chmod(filepath.Join(dir, "mvnw"), 0755); err == nil {
				log.Printf("INFO: Found Maven wrapper at mvnw")
				return filepath.Join(dir, "mvnw")
			}
		}
	}

	mavenCommands := []string{"mvn"}

	for _, homeVar := range []string{"M2_HOME", "MAVEN_HOME"} {
		if mavenHome := os.Getenv(homeVar); mavenHome != "" {
			mavenPath := filepath.Join(mavenHome, "bin", "mvn")
			if runtime.GOOS == "windows" {
				mavenPath += ".cmd"
			}
			mavenCommands = append([]string{mavenPath}, mavenCommands...)
		}
	}
	commonPaths := []string{
		"/usr/bin/mvn",
		"/usr/local/bin/mvn",
		"/opt/maven/bin/mvn",
		"/usr/share/maven/bin/mvn",
	}
	
	if runtime.GOOS == "windows" {
		windowsPaths := []string{
			"C:\\Program Files\\Apache\\maven\\bin\\mvn.cmd",
			"C:\\Program Files\\Maven\\bin\\mvn.cmd",
			"C:\\apache-maven\\bin\\mvn.cmd",
		}
		commonPaths = append(commonPaths, windowsPaths...)
	}
	
	mavenCommands = append(mavenCommands, commonPaths...)

	for _, cmd := range mavenCommands {
		if FileExists(cmd) {
			log.Printf("INFO: Found Maven at %s", cmd)
			return cmd
		}
		
		if runtime.GOOS != "windows" {
			checkCmd := exec.Command("which", cmd)
			if out, err := checkCmd.Output(); err == nil {
				mavenPath := strings.TrimSpace(string(out))
				if FileExists(mavenPath) {
					log.Printf("INFO: Found Maven at %s", mavenPath)
					return mavenPath
				}
			}
		}
	}

	if err := exec.Command("mvn", "-version").Run(); err == nil {
		log.Printf("INFO: Found Maven in PATH")
		return "mvn"
	}

	log.Printf("WARNING: Could not find Maven executable")
	return ""
}

// Function to find Gradle executable
func FindGradleExecutable(dir string) string {
	log.Printf("INFO: Looking for Gradle executable")
	if runtime.GOOS == "windows" {
		if FileExists(filepath.Join(dir, "gradlew.bat")) {
			log.Printf("INFO: Found Gradle wrapper at gradlew.bat")
			return filepath.Join(dir, "gradlew.bat")
		}
	} else {
		if FileExists(filepath.Join(dir, "gradlew")) {
			if err := os.Chmod(filepath.Join(dir, "gradlew"), 0755); err == nil {
				log.Printf("INFO: Found Gradle wrapper at gradlew")
				return filepath.Join(dir, "gradlew")
			}
		}
	}

	gradleCommands := []string{"gradle"}

	if gradleHome := os.Getenv("GRADLE_HOME"); gradleHome != "" {
		gradlePath := filepath.Join(gradleHome, "bin", "gradle")
		if runtime.GOOS == "windows" {
			gradlePath += ".bat"
		}
		gradleCommands = append([]string{gradlePath}, gradleCommands...)
	}
	commonPaths := []string{
		"/usr/bin/gradle",
		"/usr/local/bin/gradle",
		"/opt/gradle/bin/gradle",
	}
	
	if runtime.GOOS == "windows" {
		windowsPaths := []string{
			"C:\\Program Files\\Gradle\\bin\\gradle.bat",
			"C:\\gradle\\bin\\gradle.bat",
		}
		commonPaths = append(commonPaths, windowsPaths...)
	}
	
	gradleCommands = append(gradleCommands, commonPaths...)

	for _, cmd := range gradleCommands {
		if FileExists(cmd) {
			log.Printf("INFO: Found Gradle at %s", cmd)
			return cmd
		}
		
		if runtime.GOOS != "windows" {
			checkCmd := exec.Command("which", cmd)
			if out, err := checkCmd.Output(); err == nil {
				gradlePath := strings.TrimSpace(string(out))
				if FileExists(gradlePath) {
					log.Printf("INFO: Found Gradle at %s", gradlePath)
					return gradlePath
				}
			}
		}
	}

	if err := exec.Command("gradle", "-version").Run(); err == nil {
		log.Printf("INFO: Found Gradle in PATH")
		return "gradle"
	}

	log.Printf("WARNING: Could not find Gradle executable")
	return ""
}

// Function for test framework detection
func DetectJavaTestFrameworks(dir string, logPrefix string) []string {
	log.Printf("INFO: %s Detecting Java test frameworks", logPrefix)
	frameworks := []string{}

	testPatterns := []string{
		"**/*Test.java", "**/*Tests.java", "**/*TestCase.java", "**/Test*.java",
		"**/*Test.kt", "**/*Tests.kt", "**/*TestCase.kt", "**/Test*.kt",
		"**/*Test.scala", "**/*Tests.scala", "**/*Spec.scala",
		"src/test/**/*.java", "src/test/**/*.kt", "src/test/**/*.scala",
		"test/**/*.java", "test/**/*.kt", "test/**/*.scala",
		"src/androidTest/**/*.java", "src/androidTest/**/*.kt",
		"src/integrationTest/**/*.java", "src/integrationTest/**/*.kt",
	}

	testFiles := FindFiles(dir, testPatterns)
	
	frameworkPatterns := map[string][]string{
		"junit5": {
			"org.junit.jupiter", "@Test", "@BeforeEach", "@AfterEach",
			"org.junit.jupiter.api", "jupiter-api", "junit-jupiter",
		},
		"junit4": {
			"org.junit.Test", "org.junit.Before", "org.junit.After",
			"junit:junit:4", "junit-4",
		},
		"testng": {
			"org.testng", "@Test", "testng.xml", "TestNG",
		},
		"mockito": {
			"org.mockito", "@Mock", "@InjectMocks", "Mockito.mock",
		},
		"spock": {
			"spock.lang", "Specification", "def \"", "given:", "when:", "then:",
		},
		"scalatest": {
			"org.scalatest", "FunSuite", "FlatSpec", "WordSpec",
		},
		"specs2": {
			"org.specs2", "Specification", "mutable.Specification",
		},
		"cucumber": {
			"cucumber", "@Given", "@When", "@Then", "Feature:",
		},
		"spring-test": {
			"org.springframework.test", "@SpringBootTest", "@WebMvcTest",
			"@DataJpaTest", "TestRestTemplate",
		},
		"android-test": {
			"androidx.test", "android.support.test", "@RunWith",
			"InstrumentationRegistry", "Espresso",
		},
		"robolectric": {
			"org.robolectric", "@RunWith(RobolectricTestRunner",
		},
		"wiremock": {
			"com.github.tomakehurst.wiremock", "WireMock", "stubFor",
		},
		"rest-assured": {
			"io.restassured", "RestAssured", "given().when().then()",
		},
	}
	for _, testFile := range testFiles {
		content, err := os.ReadFile(testFile)
		if err != nil {
			continue
		}
		
		contentStr := string(content)
		
		for framework, patterns := range frameworkPatterns {
			for _, pattern := range patterns {
				if strings.Contains(contentStr, pattern) {
					if !contains(frameworks, framework) {
						frameworks = append(frameworks, framework)
					}
					break
				}
			}
		}
	}
	buildFiles := []string{"pom.xml", "build.gradle", "build.gradle.kts", "build.sbt"}
	for _, buildFile := range buildFiles {
		buildPath := filepath.Join(dir, buildFile)
		if !FileExists(buildPath) {
			continue
		}
		
		content, err := os.ReadFile(buildPath)
		if err != nil {
			continue
		}
		
		contentStr := string(content)
	
		dependencyPatterns := map[string][]string{
			"junit5": {
				"junit-jupiter", "org.junit.jupiter", "junit-jupiter-api",
				"junit-jupiter-engine", "junit-platform",
			},
			"junit4": {
				"junit:junit:4", "junit</artifactId>", "junit\" version",
			},
			"testng": {
				"testng", "org.testng",
			},
			"mockito": {
				"mockito-core", "mockito-all", "org.mockito",
			},
			"spock": {
				"spock-core", "org.spockframework",
			},
			"scalatest": {
				"scalatest", "org.scalatest",
			},
			"cucumber": {
				"cucumber-java", "cucumber-junit", "io.cucumber",
			},
			"spring-test": {
				"spring-boot-starter-test", "spring-test",
			},
		}

		for framework, patterns := range dependencyPatterns {
			for _, pattern := range patterns {
				if strings.Contains(contentStr, pattern) {
					if !contains(frameworks, framework) {
						frameworks = append(frameworks, framework)
					}
					break
				}
			}
		}
	}

	log.Printf("INFO: %s Detected Java test frameworks: %v", logPrefix, frameworks)
	return frameworks
}

// Functiion to find coverage tools 
func DetectJavaCoverageTools(dir string, logPrefix string) []string {
	log.Printf("INFO: %s Detecting Java coverage tools", logPrefix)
	tools := []string{}
	buildFiles := []string{"pom.xml", "build.gradle", "build.gradle.kts", "build.sbt"}
	
	coveragePatterns := map[string][]string{
		"jacoco": {
			"jacoco-maven-plugin", "org.jacoco", "jacoco",
			"jacocoTestReport", "jacocoTestCoverageVerification",
		},
		"cobertura": {
			"cobertura-maven-plugin", "cobertura", "net.sourceforge.cobertura",
		},
		"clover": {
			"clover-maven-plugin", "com.atlassian.clover", "clover",
		},
		"codecov": {
			"codecov", "codecov.io", "codecov-maven-plugin",
		},
		"coveralls": {
			"coveralls-maven-plugin", "coveralls", "org.kt3k.gradle.plugin",
		},
		"scoverage": {
			"scoverage", "org.scoverage", "scoverage-maven-plugin",
		},
	}

	for _, buildFile := range buildFiles {
		buildPath := filepath.Join(dir, buildFile)
		if !FileExists(buildPath) {
			continue
		}
		
		content, err := os.ReadFile(buildPath)
		if err != nil {
			continue
		}
		
		contentStr := string(content)
		
		for tool, patterns := range coveragePatterns {
			for _, pattern := range patterns {
				if strings.Contains(contentStr, pattern) {
					if !contains(tools, tool) {
						tools = append(tools, tool)
					}
					break
				}
			}
		}
	}
	reportDirs := []string{
		"target/site/jacoco",
		"build/reports/jacoco",
		"target/site/cobertura",
		"build/reports/cobertura",
		"target/site/clover",
		"build/reports/coverage",
		"coverage",
		"htmlcov",
	}

	for _, reportDir := range reportDirs {
		if DirExists(filepath.Join(dir, reportDir)) {
			toolName := extractToolNameFromPath(reportDir)
			if toolName != "" && !contains(tools, toolName) {
				tools = append(tools, toolName)
			}
		}
	}

	log.Printf("INFO: %s Detected Java coverage tools: %v", logPrefix, tools)
	return tools
}

// Extract tool name from report directory path
func extractToolNameFromPath(path string) string {
	if strings.Contains(path, "jacoco") {
		return "jacoco"
	}
	if strings.Contains(path, "cobertura") {
		return "cobertura"
	}
	if strings.Contains(path, "clover") {
		return "clover"
	}
	return ""
}

// Enhanced project detection
func DetectJavaProject(dir string) bool {
	log.Printf("INFO: Detecting if %s is a Java/JVM project", dir)
	primaryFiles := []string{
		"pom.xml", "build.gradle", "build.gradle.kts", "build.xml",
		"build.sbt", "project/build.scala", "BUILD", "BUILD.bazel",
		"WORKSPACE", "project.clj", "build.mill",
	}

	for _, file := range primaryFiles {
		if FileExists(filepath.Join(dir, file)) {
			log.Printf("INFO: Java/JVM project detected by %s", file)
			return true
		}
	}
	sourcePatterns := []string{
		"**/*.java", "**/*.kt", "**/*.scala", "**/*.groovy", "**/*.clj",
	}

	for _, pattern := range sourcePatterns {
		files := FindFiles(dir, []string{pattern})
		if len(files) > 0 {
			log.Printf("INFO: Java/JVM project detected by source files: %d %s files found", 
				len(files), strings.TrimPrefix(pattern, "**/*."))
			return true
		}
	}
	jvmDirs := []string{
		"src/main/java", "src/main/kotlin", "src/main/scala",
		"src/test/java", "src/test/kotlin", "src/test/scala",
		"app/src/main/java", "app/src/main/kotlin",
	}

	for _, dir := range jvmDirs {
		if DirExists(filepath.Join(dir, dir)) {
			log.Printf("INFO: Java/JVM project detected by directory structure: %s", dir)
			return true
		}
	}

	log.Printf("INFO: Not a Java/JVM project")
	return false
}

// Enhanced utility functions
func contains(slice []string, str string) bool {
	for _, s := range slice {
		if s == str {
			return true
		}
	}
	return false
}

// Detect JDK version from various sources
func detectJDKVersion(dir string, javaPath string, logPrefix string) string {
	if javaPath != "" {
		if version := getJavaVersionFromExecutable(javaPath); version != "" {
			log.Printf("INFO: %s Detected JDK version from executable: %s", logPrefix, version)
			return version
		}
	}
	if version := getJavaVersionFromBuildFiles(dir); version != "" {
		log.Printf("INFO: %s Detected JDK version from build files: %s", logPrefix, version)
		return version
	}
	if version := getJavaVersionFromVersionFile(dir); version != "" {
		log.Printf("INFO: %s Detected JDK version from .java-version: %s", logPrefix, version)
		return version
	}

	return ""
}

// Get Java version from executable
func getJavaVersionFromExecutable(javaPath string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	cmd := exec.CommandContext(ctx, javaPath, "-version")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "version") {
			re := regexp.MustCompile(`"([^"]*)"`)
			matches := re.FindStringSubmatch(line)
			if len(matches) > 1 {
				version := matches[1]
				if strings.HasPrefix(version, "1.") {
					parts := strings.Split(version, ".")
					if len(parts) > 1 {
						return parts[1]
					}
				} else {
					parts := strings.Split(version, ".")
					if len(parts) > 0 {
						return parts[0]
					}
				}
				return version
			}
		}
	}
	
	return ""
}

// Get Java version from build files
func getJavaVersionFromBuildFiles(dir string) string {
	pomPath := filepath.Join(dir, "pom.xml")
	if FileExists(pomPath) {
		content, err := os.ReadFile(pomPath)
		if err == nil {
			contentStr := string(content)
			
			patterns := []string{
				`<maven\.compiler\.source>(\d+)</maven\.compiler\.source>`,
				`<maven\.compiler\.target>(\d+)</maven\.compiler\.target>`,
				`<java\.version>(\d+)</java\.version>`,
				`<jdk\.version>(\d+)</jdk\.version>`,
			}
			
			for _, pattern := range patterns {
				re := regexp.MustCompile(pattern)
				matches := re.FindStringSubmatch(contentStr)
				if len(matches) > 1 {
					return matches[1]
				}
			}
		}
	}

	gradleFiles := []string{"build.gradle", "build.gradle.kts"}
	for _, gradleFile := range gradleFiles {
		gradlePath := filepath.Join(dir, gradleFile)
		if FileExists(gradlePath) {
			content, err := os.ReadFile(gradlePath)
			if err == nil {
				contentStr := string(content)
				
				patterns := []string{
					`sourceCompatibility = ['"]*(\d+)['"]*`,
					`targetCompatibility = ['"]*(\d+)['"]*`,
					`JavaVersion\.VERSION_(\d+)`,
					`jvmTarget = ['"]*(\d+)['"]*`,
				}
				
				for _, pattern := range patterns {
					re := regexp.MustCompile(pattern)
					matches := re.FindStringSubmatch(contentStr)
					if len(matches) > 1 {
						return matches[1]
					}
				}
			}
		}
	}

	return ""
}

func getJavaVersionFromVersionFile(dir string) string {
	versionFiles := []string{".java-version", ".sdkmanrc"}
	
	for _, versionFile := range versionFiles {
		versionPath := filepath.Join(dir, versionFile)
		if FileExists(versionPath) {
			content, err := os.ReadFile(versionPath)
			if err == nil {
				version := strings.TrimSpace(string(content))
				if strings.Contains(version, "-") {
					parts := strings.Split(version, "-")
					if len(parts) > 0 {
						return extractMajorVersion(parts[0])
					}
				}
				return extractMajorVersion(version)
			}
		}
	}
	
	return ""
}

// Extract major version number from version string
func extractMajorVersion(version string) string {
	if strings.HasPrefix(version, "1.") {
		parts := strings.Split(version, ".")
		if len(parts) > 1 {
			return parts[1]
		}
	} else {
		re := regexp.MustCompile(`^(\d+)`)
		matches := re.FindStringSubmatch(version)
		if len(matches) > 1 {
			return matches[1]
		}
	}
	return version
}

// Enhanced coverage execution with timeout and error handling
func RunCoverageWithMaven(dir string, logPrefix string, frameworks []string) (CoverageResponse, error) {
	log.Printf("INFO: %s Running enhanced Maven coverage analysis", logPrefix)

	mavenPath := FindMavenExecutable(dir)
	if mavenPath == "" {
		return CoverageResponse{}, errors.New("maven executable not found")
	}
	if err := ensureJaCoCoMavenPlugin(dir, logPrefix); err != nil {
		log.Printf("WARNING: %s Failed to ensure JaCoCo plugin: %v", logPrefix, err)
	}
	env := setupJavaEnvironment(FindJavaExecutable())
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	log.Printf("INFO: %s Cleaning and compiling with Maven", logPrefix)
	if err := runMavenCommand(ctx, mavenPath, dir, env, []string{"clean", "compile", "test-compile"}, logPrefix); err != nil {
		log.Printf("WARNING: %s Maven clean/compile failed: %v", logPrefix, err)
	}
	testArgs := []string{"test"}
	testArgs = append(testArgs, "jacoco:report")
	if contains(frameworks, "testng") {
		testArgs = append(testArgs, "-Dsurefire.suiteXmlFiles=testng.xml")
	}
	testArgs = append(testArgs, "-Dmaven.test.failure.ignore=true")

	log.Printf("INFO: %s Running Maven tests with coverage: %v", logPrefix, testArgs)
	if err := runMavenCommand(ctx, mavenPath, dir, env, testArgs, logPrefix); err != nil {
		log.Printf("WARNING: %s Maven test with coverage failed: %v", logPrefix, err)
		log.Printf("INFO: %s Trying alternative Maven coverage approach", logPrefix)
		altArgs := []string{
			"org.jacoco:jacoco-maven-plugin:prepare-agent",
			"test",
			"org.jacoco:jacoco-maven-plugin:report",
			"-Dmaven.test.failure.ignore=true",
		}
		
		if err := runMavenCommand(ctx, mavenPath, dir, env, altArgs, logPrefix); err != nil {
			log.Printf("ERROR: %s Alternative Maven coverage also failed: %v", logPrefix, err)
			return CoverageResponse{}, err
		}
	}
	return parseJaCoCoReport(dir, logPrefix)
}

// Run Maven command with proper error handling
func runMavenCommand(ctx context.Context, mavenPath, dir string, env []string, args []string, logPrefix string) error {
	cmd := exec.CommandContext(ctx, mavenPath, args...)
	cmd.Dir = dir
	cmd.Env = env
	output, err := cmd.CombinedOutput()
	
	if err != nil {
		log.Printf("ERROR: %s Maven command failed: %v", logPrefix, err)
		log.Printf("ERROR: %s Maven output: %s", logPrefix, string(output))
		return err
	}
	
	log.Printf("DEBUG: %s Maven command succeeded: %v", logPrefix, args)
	return nil
}

// Enhanced Gradle coverage execution
func RunCoverageWithGradle(dir string, logPrefix string, frameworks []string) (CoverageResponse, error) {
	log.Printf("INFO: %s Running enhanced Gradle coverage analysis", logPrefix)

	gradlePath := FindGradleExecutable(dir)
	if gradlePath == "" {
		return CoverageResponse{}, errors.New("gradle executable not found")
	}
	if err := ensureJaCoCoGradlePlugin(dir, logPrefix); err != nil {
		log.Printf("WARNING: %s Failed to ensure JaCoCo plugin: %v", logPrefix, err)
	}
	env := setupJavaEnvironment(FindJavaExecutable())
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	log.Printf("INFO: %s Cleaning and building with Gradle", logPrefix)
	if err := runGradleCommand(ctx, gradlePath, dir, env, []string{"clean", "compileJava", "compileTestJava"}, logPrefix); err != nil {
		log.Printf("WARNING: %s Gradle clean/compile failed: %v", logPrefix, err)
	}
	testArgs := []string{"test", "jacocoTestReport"}
	
	testArgs = append(testArgs, "--continue")

	log.Printf("INFO: %s Running Gradle tests with coverage: %v", logPrefix, testArgs)
	if err := runGradleCommand(ctx, gradlePath, dir, env, testArgs, logPrefix); err != nil {
		log.Printf("WARNING: %s Gradle test with coverage failed: %v", logPrefix, err)
		
		log.Printf("INFO: %s Trying separate test and coverage commands", logPrefix)
		
		if err := runGradleCommand(ctx, gradlePath, dir, env, []string{"test", "--continue"}, logPrefix); err != nil {
			log.Printf("WARNING: %s Gradle tests failed: %v", logPrefix, err)
		}
		
		if err := runGradleCommand(ctx, gradlePath, dir, env, []string{"jacocoTestReport"}, logPrefix); err != nil {
			log.Printf("ERROR: %s Gradle coverage report failed: %v", logPrefix, err)
			return CoverageResponse{}, err
		}
	}
	return parseJaCoCoReport(dir, logPrefix)
}

// Run Gradle command with proper error handling
func runGradleCommand(ctx context.Context, gradlePath, dir string, env []string, args []string, logPrefix string) error {
	cmd := exec.CommandContext(ctx, gradlePath, args...)
	cmd.Dir = dir
	cmd.Env = env
	output, err := cmd.CombinedOutput()
	
	if err != nil {
		log.Printf("ERROR: %s Gradle command failed: %v", logPrefix, err)
		log.Printf("ERROR: %s Gradle output: %s", logPrefix, string(output))
		return err
	}
	
	log.Printf("DEBUG: %s Gradle command succeeded: %v", logPrefix, args)
	return nil
}

// Setup Java environment variables
func setupJavaEnvironment(javaPath string) []string {
	env := os.Environ()
	
	if javaPath != "" {
		var javaHome string
		if strings.Contains(javaPath, "/bin/java") {
			javaHome = strings.Replace(javaPath, "/bin/java", "", 1)
		} else if strings.Contains(javaPath, "\\bin\\java.exe") {
			javaHome = strings.Replace(javaPath, "\\bin\\java.exe", "", 1)
		} else {
			if envJavaHome := os.Getenv("JAVA_HOME"); envJavaHome != "" {
				javaHome = envJavaHome
			}
		}
		
		if javaHome != "" {
			javaHomeSet := false
			for i, envVar := range env {
				if strings.HasPrefix(envVar, "JAVA_HOME=") {
					env[i] = "JAVA_HOME=" + javaHome
					javaHomeSet = true
					break
				}
			}
			if !javaHomeSet {
				env = append(env, "JAVA_HOME="+javaHome)
			}
		}
	}
	
	return env
}

// Enhanced JaCoCo Maven plugin configuration
func ensureJaCoCoMavenPlugin(dir string, logPrefix string) error {
	pomPath := filepath.Join(dir, "pom.xml")
	if !FileExists(pomPath) {
		return errors.New("pom.xml not found")
	}

	content, err := os.ReadFile(pomPath)
	if err != nil {
		return err
	}

	contentStr := string(content)
	if strings.Contains(contentStr, "jacoco-maven-plugin") {
		log.Printf("INFO: %s JaCoCo plugin already configured in Maven", logPrefix)
		return nil
	}
	if strings.Contains(contentStr, "<plugins>") || strings.Contains(contentStr, "<pluginManagement>") {
		log.Printf("INFO: %s JaCoCo plugin not found but build section exists, project may need manual configuration", logPrefix)
	} else {
		log.Printf("INFO: %s No plugins section found in pom.xml, project may need manual configuration", logPrefix)
	}

	return nil
}

// Enhanced JaCoCo Gradle plugin configuration
func ensureJaCoCoGradlePlugin(dir string, logPrefix string) error {
	buildFiles := []string{"build.gradle", "build.gradle.kts"}
	
	for _, buildFile := range buildFiles {
		buildPath := filepath.Join(dir, buildFile)
		if FileExists(buildPath) {
			content, err := os.ReadFile(buildPath)
			if err != nil {
				continue
			}

			contentStr := string(content)
			if strings.Contains(contentStr, "jacoco") || strings.Contains(contentStr, "id 'jacoco'") {
				log.Printf("INFO: %s JaCoCo plugin already configured in Gradle", logPrefix)
				return nil
			}
			
			log.Printf("INFO: %s JaCoCo plugin not found in %s, project may need manual configuration", logPrefix, buildFile)
			return nil
		}
	}

	log.Printf("INFO: %s No Gradle build files found", logPrefix)
	return nil
}

// Enhanced JaCoCo report parsing with multiple format support
func parseJaCoCoReport(dir string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Parsing JaCoCo coverage report", logPrefix)
	reportPaths := []string{
		"target/site/jacoco/jacoco.xml",
		"target/jacoco-report/jacoco.xml", 
		"target/site/jacoco-ut/jacoco.xml",
		"target/site/jacoco-it/jacoco.xml",
		"build/reports/jacoco/test/jacocoTestReport.xml",
		"build/reports/jacoco/jacocoTestReport.xml",
		"build/jacoco/jacoco.xml",
		"build/reports/tests/jacoco.xml",
		"*/target/site/jacoco/jacoco.xml",
		"*/build/reports/jacoco/test/jacocoTestReport.xml",
		"jacoco.xml",
		"coverage/jacoco.xml",
		"reports/jacoco.xml",
	}

	var reportPath string
	for _, path := range reportPaths {
		if strings.Contains(path, "*") {
			matches, err := filepath.Glob(filepath.Join(dir, path))
			if err == nil && len(matches) > 0 {
				reportPath = matches[0]
				break
			}
		} else {
			fullPath := filepath.Join(dir, path)
			if FileExists(fullPath) {
				reportPath = fullPath
				break
			}
		}
	}

	if reportPath == "" {
		log.Printf("WARNING: %s No JaCoCo XML report found in standard locations", logPrefix)
		err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			
			if !info.IsDir() && strings.HasSuffix(info.Name(), "jacoco.xml") {
				if shouldSkipDirectory(filepath.Dir(path)) {
					return nil
				}
				reportPath = path
				return filepath.SkipDir
			}
			return nil
		})
		
		if err != nil || reportPath == "" {
			return CoverageResponse{}, errors.New("no JaCoCo XML report found")
		}
		
		log.Printf("INFO: %s Found JaCoCo report through recursive search: %s", logPrefix, reportPath)
	} else {
		log.Printf("INFO: %s Found JaCoCo report at: %s", logPrefix, reportPath)
	}

	content, err := os.ReadFile(reportPath)
	if err != nil {
		return CoverageResponse{}, fmt.Errorf("failed to read JaCoCo report: %v", err)
	}

	return parseJaCoCoXMLContent(string(content), logPrefix)
}

// Parse JaCoCo XML content with enhanced error handling
func parseJaCoCoXMLContent(xmlContent string, logPrefix string) (CoverageResponse, error) {
	var totalCoverage float64
	reportRe := regexp.MustCompile(`<report[^>]*>[\s\S]*?<counter type="INSTRUCTION"[^>]*covered="(\d+)"[^>]*missed="(\d+)"`)
	if matches := reportRe.FindStringSubmatch(xmlContent); len(matches) >= 3 {
		covered, _ := strconv.ParseFloat(matches[1], 64)
		missed, _ := strconv.ParseFloat(matches[2], 64)
		if covered+missed > 0 {
			totalCoverage = (covered / (covered + missed)) * 100
		}
	}
	if totalCoverage == 0 {
		packageRe := regexp.MustCompile(`<package[^>]*>[\s\S]*?<counter type="INSTRUCTION"[^>]*covered="(\d+)"[^>]*missed="(\d+)"`)
		allMatches := packageRe.FindAllStringSubmatch(xmlContent, -1)
		
		var totalCovered, totalMissed float64
		for _, match := range allMatches {
			if len(match) >= 3 {
				covered, _ := strconv.ParseFloat(match[1], 64)
				missed, _ := strconv.ParseFloat(match[2], 64)
				totalCovered += covered
				totalMissed += missed
			}
		}
		
		if totalCovered+totalMissed > 0 {
			totalCoverage = (totalCovered / (totalCovered + totalMissed)) * 100
		}
	}
	var files []FileCoverage
	classRe := regexp.MustCompile(`<class name="([^"]*)"[^>]*sourcefilename="([^"]*)"[^>]*>[\s\S]*?<counter type="INSTRUCTION"[^>]*covered="(\d+)"[^>]*missed="(\d+)"`)
	classMatches := classRe.FindAllStringSubmatch(xmlContent, -1)
	
	fileMap := make(map[string]JavaFileStats)
	
	for _, classMatch := range classMatches {
		if len(classMatch) >= 5 {
			className := classMatch[1]
			sourceFile := classMatch[2]
			covered, _ := strconv.ParseFloat(classMatch[3], 64)
			missed, _ := strconv.ParseFloat(classMatch[4], 64)
			fileName := sourceFile
			if fileName == "" {
				fileName = strings.ReplaceAll(className, ".", "/") + ".java"
			} else {
				packagePath := strings.ReplaceAll(className, ".", "/")
				if strings.Contains(packagePath, "/") {
					dir := filepath.Dir(packagePath)
					fileName = filepath.Join(dir, sourceFile)
				} else {
					fileName = sourceFile
				}
			}
			if existing, exists := fileMap[fileName]; exists {
				existing.CoveredLines += int(covered)
				existing.MissedLines += int(missed)
				existing.TotalExecutableLines = existing.CoveredLines + existing.MissedLines
				fileMap[fileName] = existing
			} else {
				fileMap[fileName] = JavaFileStats{
					CoveredLines:         int(covered),
					MissedLines:          int(missed),
					TotalExecutableLines: int(covered + missed),
				}
			}
		}
	}
	for fileName, stats := range fileMap {
		var fileCoverage float64
		if stats.TotalExecutableLines > 0 {
			fileCoverage = (float64(stats.CoveredLines) / float64(stats.TotalExecutableLines)) * 100
		}
		
		status := "Success"
		errorMsg := ""
		
		if fileCoverage == 0.0 && stats.TotalExecutableLines > 0 {
			status = "Failure"
			errorMsg = "File has 0% code coverage - no tests cover this file"
		} else if stats.TotalExecutableLines == 0 {
			status = "Warning"
			errorMsg = "File has no executable lines"
		}
		
		files = append(files, FileCoverage{
			File:     fileName,
			Coverage: fileCoverage,
			Status:   status,
			Error:    errorMsg,
		})
	}

	log.Printf("INFO: %s Successfully parsed JaCoCo report - Total coverage: %.2f%%, Files: %d", 
		logPrefix, totalCoverage, len(files))
	
	return CoverageResponse{
		TotalCoverage: totalCoverage, 
		Files:         files,
		Timestamp:     time.Now().Format(time.RFC3339),
	}, nil
}

// Enhanced coverage estimation with sophisticated analysis
func EstimateJavaCoverage(dir string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Estimating comprehensive Java/JVM coverage", logPrefix)
	
	var allSourceFiles []string
	var allTestFiles []string
	languageStats := make(map[string]int)
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
		if info.IsDir() {
			dirName := filepath.Base(path)
			if shouldSkipDirectory(dirName) {
				return filepath.SkipDir
			}
		}
		
		if !info.IsDir() {
			ext := filepath.Ext(path)
			switch ext {
			case ".java":
				languageStats["Java"]++
				if isJavaTestFile(path) {
					allTestFiles = append(allTestFiles, path)
				} else {
					allSourceFiles = append(allSourceFiles, path)
				}
			case ".kt":
				languageStats["Kotlin"]++
				if isKotlinTestFile(path) {
					allTestFiles = append(allTestFiles, path)
				} else {
					allSourceFiles = append(allSourceFiles, path)
				}
			case ".scala":
				languageStats["Scala"]++
				if isScalaTestFile(path) {
					allTestFiles = append(allTestFiles, path)
				} else {
					allSourceFiles = append(allSourceFiles, path)
				}
			case ".groovy":
				languageStats["Groovy"]++
				if isGroovyTestFile(path) {
					allTestFiles = append(allTestFiles, path)
				} else {
					allSourceFiles = append(allSourceFiles, path)
				}
			case ".clj", ".cljs", ".cljc":
				languageStats["Clojure"]++
				if isClojureTestFile(path) {
					allTestFiles = append(allTestFiles, path)
				} else {
					allSourceFiles = append(allSourceFiles, path)
				}
			}
		}
		return nil
	})

	if err != nil {
		log.Printf("ERROR: %s Failed to walk directory: %v", logPrefix, err)
		return CoverageResponse{TotalCoverage: 0, Files: []FileCoverage{}}, 
			fmt.Errorf("failed to analyze source files: %v", err)
	}

	totalSourceFiles := len(allSourceFiles)
	totalTestFiles := len(allTestFiles)
	
	log.Printf("INFO: %s Language distribution: %v", logPrefix, languageStats)
	log.Printf("INFO: %s Found %d source files, %d test files", logPrefix, totalSourceFiles, totalTestFiles)

	if totalSourceFiles == 0 {
		log.Printf("WARNING: %s No source files found in project", logPrefix)
		if isAndroidProject(dir) {
			log.Printf("INFO: %s Detected Android project, using Android-specific estimation", logPrefix)
			return estimateAndroidCoverage(dir, logPrefix)
		}
		
		return CoverageResponse{TotalCoverage: 0, Files: []FileCoverage{}}, 
			errors.New("no source files found")
	}
	coverageEstimate := calculateAdvancedCoverageEstimate(dir, totalSourceFiles, totalTestFiles, languageStats, logPrefix)

	var files []FileCoverage
	for _, file := range allSourceFiles {
		relPath, err := filepath.Rel(dir, file)
		if err != nil {
			relPath = file
		}

		fileCoverage := estimateFileCoverage(file, allTestFiles, dir, coverageEstimate)
		
		status := "Success"
		errorMsg := ""
		if fileCoverage <= 0 {
			status = "Failure"
			errorMsg = "File estimated to have 0% code coverage - no tests found for this file"
			fileCoverage = 0.0
		} else if fileCoverage < 30 {
			status = "Warning"
			errorMsg = "File estimated to have low code coverage"
		}

		files = append(files, FileCoverage{
			File:     relPath,
			Coverage: fileCoverage,
			Status:   status,
			Error:    errorMsg,
		})
	}

	return CoverageResponse{
		TotalCoverage: coverageEstimate, 
		Files:         files,
		Timestamp:     time.Now().Format(time.RFC3339),
	}, nil
}

// Calculate advanced coverage estimate based on multiple factors
func calculateAdvancedCoverageEstimate(dir string, sourceFiles, testFiles int, languageStats map[string]int, logPrefix string) float64 {
	var baseCoverage float64 = 20 
	if sourceFiles > 0 {
		testRatio := float64(testFiles) / float64(sourceFiles)
		ratioScore := math.Min(50, testRatio*40) 
		baseCoverage += ratioScore
		log.Printf("DEBUG: %s Test ratio score: %.2f%% (ratio: %.2f)", logPrefix, ratioScore, testRatio)
	}
	
	structureBonus := analyzeProjectStructure(dir, logPrefix)
	baseCoverage += structureBonus

	languageBonus := calculateLanguageBonus(languageStats, logPrefix)
	baseCoverage += languageBonus

	frameworkBonus := analyzeFrameworkPresence(dir, logPrefix)
	baseCoverage += frameworkBonus
	finalEstimate := math.Min(100, baseCoverage)
	
	log.Printf("INFO: %s Advanced coverage estimate: %.2f%% (base: 20%%, test ratio: +%.2f%%, structure: +%.2f%%, language: +%.2f%%, framework: +%.2f%%)", 
		logPrefix, finalEstimate, baseCoverage-20-structureBonus-languageBonus-frameworkBonus, 
		structureBonus, languageBonus, frameworkBonus)
	
	return finalEstimate
}

// Analyze project structure for coverage hints
func analyzeProjectStructure(dir string, logPrefix string) float64 {
	bonus := 0.0
	if DirExists(filepath.Join(dir, "src/main/java")) && DirExists(filepath.Join(dir, "src/test/java")) {
		bonus += 10.0
		log.Printf("DEBUG: %s Standard Maven/Gradle structure bonus: +10%%", logPrefix)
	}
	ciFiles := []string{".github/workflows", ".gitlab-ci.yml", "Jenkinsfile", ".travis.yml"}
	for _, ciFile := range ciFiles {
		if FileExists(filepath.Join(dir, ciFile)) || DirExists(filepath.Join(dir, ciFile)) {
			bonus += 5.0
			log.Printf("DEBUG: %s CI/CD configuration bonus: +5%%", logPrefix)
			break
		}
	}
	coverageFiles := []string{"jacoco.xml", "cobertura.xml", ".coveragerc", "coverage.xml"}
	for _, coverageFile := range coverageFiles {
		if FileExists(filepath.Join(dir, coverageFile)) {
			bonus += 5.0
			log.Printf("DEBUG: %s Coverage tool configuration bonus: +5%%", logPrefix)
			break
		}
	}
	
	return math.Min(20, bonus) 
}

// Calculate language-specific coverage bonus
func calculateLanguageBonus(languageStats map[string]int, logPrefix string) float64 {
	bonus := 0.0
	testingCultureLangs := map[string]float64{
		"Java":    5.0,
		"Kotlin":  3.0,
		"Scala":   4.0,
		"Groovy":  2.0,
		"Clojure": 3.0,
	}
	
	for lang, count := range languageStats {
		if langBonus, exists := testingCultureLangs[lang]; exists && count > 0 {
			bonus += langBonus
			log.Printf("DEBUG: %s %s language bonus: +%.1f%%", logPrefix, lang, langBonus)
		}
	}
	
	return math.Min(10, bonus) 
}

// Analyze framework presence for coverage hints
func analyzeFrameworkPresence(dir string, logPrefix string) float64 {
	bonus := 0.0
	
	frameworkIndicators := map[string]float64{
		"Spring Boot":        8.0,
		"Spring Framework":   6.0,
		"Quarkus":           7.0,
		"Micronaut":         6.0,
		"JUnit":             5.0,
		"TestNG":            4.0,
		"Mockito":           3.0,
		"AssertJ":           2.0,
	}
	
	buildFiles := []string{"pom.xml", "build.gradle", "build.gradle.kts"}
	for _, buildFile := range buildFiles {
		buildPath := filepath.Join(dir, buildFile)
		if !FileExists(buildPath) {
			continue
		}
		
		content, err := os.ReadFile(buildPath)
		if err != nil {
			continue
		}
		
		contentStr := strings.ToLower(string(content))
		
		for framework, frameworkBonus := range frameworkIndicators {
			if strings.Contains(contentStr, strings.ToLower(framework)) || 
			   strings.Contains(contentStr, strings.ReplaceAll(strings.ToLower(framework), " ", "-")) {
				bonus += frameworkBonus
				log.Printf("DEBUG: %s %s framework bonus: +%.1f%%", logPrefix, framework, frameworkBonus)
			}
		}
		break 
	}
	
	return math.Min(15, bonus) 
}

// Estimate coverage for individual file
func estimateFileCoverage(sourceFile string, testFiles []string, baseDir string, baseCoverage float64) float64 {
	fileCoverage := baseCoverage
	if hasCorrespondingTestFile(sourceFile, testFiles, baseDir) {
		fileCoverage += 20 
	} else {
		fileCoverage -= 15 
	}

	if info, err := os.Stat(sourceFile); err == nil {
		fileSize := info.Size()
		if fileSize < 1000 { 
			fileCoverage += 5
		} else if fileSize > 5000 { 
			fileCoverage -= 10
		}
	}
	fileName := strings.ToLower(filepath.Base(sourceFile))
	if strings.Contains(fileName, "main") || 
	   strings.Contains(fileName, "config") ||
	   strings.Contains(fileName, "application") {
		fileCoverage -= 20
	}
	if strings.Contains(fileName, "util") || 
	   strings.Contains(fileName, "helper") ||
	   strings.Contains(fileName, "tool") {
		fileCoverage += 10
	}
	
	return math.Max(0, math.Min(100, fileCoverage))
}

func isJavaTestFile(filename string) bool {
	lowerName := strings.ToLower(filename)
	return strings.Contains(lowerName, "test") ||
		strings.Contains(lowerName, "/test/") ||
		strings.HasSuffix(lowerName, "test.java") ||
		strings.HasSuffix(lowerName, "tests.java") ||
		strings.Contains(lowerName, "testcase") ||
		strings.Contains(lowerName, "spec.java") ||
		strings.Contains(lowerName, "/androidtest/") ||
		strings.Contains(lowerName, "/integrationtest/")
}

func isKotlinTestFile(filename string) bool {
	lowerName := strings.ToLower(filename)
	return strings.Contains(lowerName, "test") ||
		strings.Contains(lowerName, "/test/") ||
		strings.HasSuffix(lowerName, "test.kt") ||
		strings.HasSuffix(lowerName, "tests.kt") ||
		strings.Contains(lowerName, "testcase") ||
		strings.Contains(lowerName, "spec.kt") ||
		strings.Contains(lowerName, "/androidtest/") ||
		strings.Contains(lowerName, "/integrationtest/")
}

func isScalaTestFile(filename string) bool {
	lowerName := strings.ToLower(filename)
	return strings.Contains(lowerName, "test") ||
		strings.Contains(lowerName, "/test/") ||
		strings.HasSuffix(lowerName, "test.scala") ||
		strings.HasSuffix(lowerName, "tests.scala") ||
		strings.HasSuffix(lowerName, "spec.scala") ||
		strings.Contains(lowerName, "testcase")
}

func isGroovyTestFile(filename string) bool {
	lowerName := strings.ToLower(filename)
	return strings.Contains(lowerName, "test") ||
		strings.Contains(lowerName, "/test/") ||
		strings.HasSuffix(lowerName, "test.groovy") ||
		strings.HasSuffix(lowerName, "tests.groovy") ||
		strings.HasSuffix(lowerName, "spec.groovy")
}

func isClojureTestFile(filename string) bool {
	lowerName := strings.ToLower(filename)
	return strings.Contains(lowerName, "test") ||
		strings.Contains(lowerName, "/test/") ||
		strings.HasSuffix(lowerName, "_test.clj") ||
		strings.HasSuffix(lowerName, "_test.cljs") ||
		strings.Contains(lowerName, "test_")
}

// Enhanced test correspondence checking
func hasCorrespondingTestFile(sourceFile string, testFiles []string, baseDir string) bool {
	baseName := filepath.Base(sourceFile)
	className := strings.TrimSuffix(baseName, filepath.Ext(baseName))
	relPath, _ := filepath.Rel(baseDir, sourceFile)
	packagePath := filepath.Dir(relPath)
	
	for _, testFile := range testFiles {
		testBaseName := filepath.Base(testFile)
		testRelPath, _ := filepath.Rel(baseDir, testFile)
		testPackagePath := filepath.Dir(testRelPath)
		nameMatches := []bool{
			strings.Contains(testBaseName, className+"Test"),
			strings.Contains(testBaseName, "Test"+className),
			strings.Contains(testBaseName, className+"Tests"),
			strings.Contains(testBaseName, className+"TestCase"),
			strings.Contains(testBaseName, className+"Spec"),
			strings.Contains(testBaseName, className+"IT"), 
			strings.Contains(testBaseName, className+"E2E"), 
		}
		
		for _, nameMatch := range nameMatches {
			if nameMatch {
				if packagePath == testPackagePath || 
				   strings.Contains(testPackagePath, packagePath) ||
				   (strings.Contains(testPackagePath, "test") && strings.Contains(testPackagePath, strings.ReplaceAll(packagePath, "main", ""))) {
					return true
				}
			}
		}
		if content, err := os.ReadFile(testFile); err == nil {
			contentStr := string(content)
			if strings.Contains(contentStr, className) && 
			   (strings.Contains(contentStr, "import") || strings.Contains(contentStr, "package")) {
				return true
			}
		}
	}
	
	return false
}

// Enhanced Android project detection and coverage estimation
func isAndroidProject(dir string) bool {
	androidIndicators := []string{
		"app/build.gradle",
		"app/build.gradle.kts",
		"app/src/main/AndroidManifest.xml",
		"src/main/AndroidManifest.xml",
		"gradle.properties",
		"local.properties",
		"settings.gradle",
		"gradlew",
	}

	for _, indicator := range androidIndicators {
		if FileExists(filepath.Join(dir, indicator)) {
			return true
		}
	}
	buildFiles := []string{"build.gradle", "build.gradle.kts", "app/build.gradle", "app/build.gradle.kts"}
	for _, buildFile := range buildFiles {
		buildPath := filepath.Join(dir, buildFile)
		if FileExists(buildPath) {
			content, err := os.ReadFile(buildPath)
			if err != nil {
				continue
			}

			contentStr := string(content)
			if strings.Contains(contentStr, "com.android.application") ||
			   strings.Contains(contentStr, "com.android.library") ||
			   strings.Contains(contentStr, "com.android.feature") ||
			   strings.Contains(contentStr, "com.android.dynamic-feature") ||
			   strings.Contains(contentStr, "android {") {
				return true
			}
		}
	}

	return false
}

// Enhanced Android coverage estimation
func estimateAndroidCoverage(dir string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Estimating Android project coverage", logPrefix)
	sourceDirs := []string{
		"app/src/main/java",
		"app/src/main/kotlin", 
		"src/main/java",
		"src/main/kotlin",
		"lib/src/main/java",
		"lib/src/main/kotlin",
		"*/src/main/java",
		"*/src/main/kotlin",
	}
	
	testDirs := []string{
		"app/src/test/java",
		"app/src/test/kotlin",
		"app/src/androidTest/java", 
		"app/src/androidTest/kotlin",
		"src/test/java",
		"src/test/kotlin",
		"src/androidTest/java",
		"src/androidTest/kotlin",
		"*/src/test/java",
		"*/src/test/kotlin",
		"*/src/androidTest/java",
		"*/src/androidTest/kotlin",
	}
	
	var sourceFiles []string
	var testFiles []string
	for _, sourceDir := range sourceDirs {
		sourcePath := filepath.Join(dir, sourceDir)
		if strings.Contains(sourceDir, "*") {
			matches, err := filepath.Glob(sourcePath)
			if err == nil {
				for _, match := range matches {
					if DirExists(match) {
						files := FindFiles(match, []string{"*.java", "*.kt"})
						sourceFiles = append(sourceFiles, files...)
					}
				}
			}
		} else if DirExists(sourcePath) {
			files := FindFiles(sourcePath, []string{"*.java", "*.kt"})
			sourceFiles = append(sourceFiles, files...)
		}
	}
	for _, testDir := range testDirs {
		testPath := filepath.Join(dir, testDir)
		if strings.Contains(testDir, "*") {
			matches, err := filepath.Glob(testPath)
			if err == nil {
				for _, match := range matches {
					if DirExists(match) {
						files := FindFiles(match, []string{"*.java", "*.kt"})
						testFiles = append(testFiles, files...)
					}
				}
			}
		} else if DirExists(testPath) {
			files := FindFiles(testPath, []string{"*.java", "*.kt"})
			testFiles = append(testFiles, files...)
		}
	}
	sourceFiles = removeDuplicates(sourceFiles)
	testFiles = removeDuplicates(testFiles)
	
	if len(sourceFiles) == 0 {
		return CoverageResponse{TotalCoverage: 0, Files: []FileCoverage{}}, 
			errors.New("no source files found in Android project")
	}
	
	baseCoverage := float64(25)
	
	if len(testFiles) > 0 {
		testRatio := float64(len(testFiles)) / float64(len(sourceFiles))
		coverageBonus := math.Min(40, testRatio*60) 
		baseCoverage += coverageBonus
	}
	androidTestBonus := analyzeAndroidTestingFrameworks(dir, logPrefix)
	baseCoverage += androidTestBonus
	
	coverageEstimate := math.Min(100, baseCoverage)
	
	log.Printf("INFO: %s Android project estimated coverage: %.2f%% (based on %d source files and %d test files)",
		logPrefix, coverageEstimate, len(sourceFiles), len(testFiles))
	
	var files []FileCoverage
	for _, file := range sourceFiles {
		relPath, err := filepath.Rel(dir, file)
		if err != nil {
			relPath = file
		}
		fileCoverage := estimateAndroidFileCoverage(file, testFiles, dir, coverageEstimate)
		
		status := "Success"
		errorMsg := ""
		if fileCoverage <= 0 {
			status = "Failure"
			errorMsg = "File estimated to have 0% code coverage"
			fileCoverage = 0.0
		} else if fileCoverage < 20 {
			status = "Warning"
			errorMsg = "File estimated to have low code coverage"
		}
		
		files = append(files, FileCoverage{
			File:     relPath,
			Coverage: fileCoverage,
			Status:   status,
			Error:    errorMsg,
		})
	}
	
	return CoverageResponse{
		TotalCoverage: coverageEstimate, 
		Files:         files,
		ProjectType:   "Android",
		Framework:     "Android",
		Timestamp:     time.Now().Format(time.RFC3339),
	}, nil
}

// Analyze Android-specific testing frameworks
func analyzeAndroidTestingFrameworks(dir string, logPrefix string) float64 {
	bonus := 0.0
	
	frameworks := map[string]float64{
		"espresso":     8.0, 
		"robolectric":  6.0, 
		"mockito":      4.0, 
		"junit":        3.0,
		"testng":       3.0, 
		"uiautomator":  5.0,
		"androidx.test": 5.0, 
	}
	
	buildFiles := []string{"app/build.gradle", "app/build.gradle.kts", "build.gradle", "build.gradle.kts"}
	
	for _, buildFile := range buildFiles {
		buildPath := filepath.Join(dir, buildFile)
		if !FileExists(buildPath) {
			continue
		}
		
		content, err := os.ReadFile(buildPath)
		if err != nil {
			continue
		}
		
		contentStr := strings.ToLower(string(content))
		
		for framework, frameworkBonus := range frameworks {
			if strings.Contains(contentStr, framework) {
				bonus += frameworkBonus
				log.Printf("DEBUG: %s Android %s framework bonus: +%.1f%%", logPrefix, framework, frameworkBonus)
			}
		}
		break
	}
	
	return math.Min(15, bonus) 
}

// Estimate coverage for individual Android file
func estimateAndroidFileCoverage(sourceFile string, testFiles []string, baseDir string, baseCoverage float64) float64 {
	fileCoverage := baseCoverage
	
	fileName := strings.ToLower(filepath.Base(sourceFile))
	if strings.Contains(fileName, "activity") || strings.Contains(fileName, "fragment") {
		fileCoverage -= 15
	} else if strings.Contains(fileName, "service") || strings.Contains(fileName, "receiver") {
		fileCoverage -= 10 
	} else if strings.Contains(fileName, "util") || strings.Contains(fileName, "helper") {
		fileCoverage += 10 
	} else if strings.Contains(fileName, "model") || strings.Contains(fileName, "data") {
		fileCoverage += 5
	}
	if hasCorrespondingTestFile(sourceFile, testFiles, baseDir) {
		fileCoverage += 15
	} else {
		fileCoverage -= 20
	}
	
	return math.Max(0, math.Min(100, fileCoverage))
}

// Enhanced multi-language project support
func RunJavaCoverage(dir string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Running comprehensive Java/JVM coverage analysis", logPrefix)

	projectInfo := DetectJavaProjectInfo(dir, logPrefix)
	if projectInfo.Type == UnknownProject {
		log.Printf("WARNING: %s Unknown project type, falling back to estimation", logPrefix)
		return EstimateJavaCoverage(dir, logPrefix)
	}
	var result CoverageResponse
	var err error
	switch projectInfo.BuildTool {
	case Maven:
		log.Printf("INFO: %s Processing Maven project", logPrefix)
		result, err = RunCoverageWithMaven(dir, logPrefix, projectInfo.TestFrameworks)
		if err != nil {
			log.Printf("WARNING: %s Maven coverage failed: %v, falling back to estimation", logPrefix, err)
			result, err = EstimateJavaCoverage(dir, logPrefix)
		}

	case Gradle:
		log.Printf("INFO: %s Processing Gradle project", logPrefix)
		result, err = RunCoverageWithGradle(dir, logPrefix, projectInfo.TestFrameworks)
		if err != nil {
			log.Printf("WARNING: %s Gradle coverage failed: %v, falling back to estimation", logPrefix, err)
			result, err = EstimateJavaCoverage(dir, logPrefix)
		}

	case Ant:
		log.Printf("INFO: %s Processing Ant project", logPrefix)
		result, err = runAntCoverage(dir, logPrefix, projectInfo)
		if err != nil {
			log.Printf("WARNING: %s Ant coverage failed: %v, falling back to estimation", logPrefix, err)
			result, err = EstimateJavaCoverage(dir, logPrefix)
		}

	case SBT:
		log.Printf("INFO: %s Processing SBT (Scala) project", logPrefix)
		result, err = runSBTCoverage(dir, logPrefix, projectInfo)
		if err != nil {
			log.Printf("WARNING: %s SBT coverage failed: %v, falling back to estimation", logPrefix, err)
			result, err = EstimateJavaCoverage(dir, logPrefix)
		}

	case Bazel:
		log.Printf("INFO: %s Processing Bazel project", logPrefix)
		result, err = runBazelCoverage(dir, logPrefix, projectInfo)
		if err != nil {
			log.Printf("WARNING: %s Bazel coverage failed: %v, falling back to estimation", logPrefix, err)
			result, err = EstimateJavaCoverage(dir, logPrefix)
		}

	case Leiningen:
		log.Printf("INFO: %s Processing Leiningen (Clojure) project", logPrefix)
		result, err = runLeiningenCoverage(dir, logPrefix, projectInfo)
		if err != nil {
			log.Printf("WARNING: %s Leiningen coverage failed: %v, falling back to estimation", logPrefix, err)
			result, err = EstimateJavaCoverage(dir, logPrefix)
		}

	default:
		log.Printf("INFO: %s Processing simple Java/JVM project", logPrefix)
		result, err = runSimpleJavaCoverage(dir, logPrefix, projectInfo)
		if err != nil {
			log.Printf("WARNING: %s Simple coverage failed: %v, falling back to estimation", logPrefix, err)
			result, err = EstimateJavaCoverage(dir, logPrefix)
		}
	}

	if err != nil {
		log.Printf("WARNING: %s All coverage methods failed: %v, using estimation", logPrefix, err)
		return EstimateJavaCoverage(dir, logPrefix)
	}
	result = enhanceResultWithProjectInfo(result, projectInfo, logPrefix)
	return result, nil
}

// Enhanced result enhancement with project metadata
func enhanceResultWithProjectInfo(result CoverageResponse, projectInfo *JavaProjectInfo, logPrefix string) CoverageResponse {
	result.ProjectType = getProjectTypeName(projectInfo.Type)
	result.BuildTool = getBuildToolName(projectInfo.BuildTool)
	result.Framework = projectInfo.Framework
	result.Timestamp = time.Now().Format(time.RFC3339)
	log.Printf("INFO: %s Enhanced coverage result - Type: %s, Build Tool: %s, Framework: %s", 
		logPrefix, result.ProjectType, result.BuildTool, result.Framework)
	
	return result
}

// SBT coverage support for Scala projects
func runSBTCoverage(dir string, logPrefix string, projectInfo *JavaProjectInfo) (CoverageResponse, error) {
	log.Printf("INFO: %s Running SBT coverage for Scala project", logPrefix)
	
	sbtPath := findSBTExecutable(dir)
	if sbtPath == "" {
		return CoverageResponse{}, errors.New("sbt executable not found")
	}

	env := setupJavaEnvironment(FindJavaExecutable())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	coverageArgs := []string{"clean", "coverage", "test", "coverageReport"}
	
	log.Printf("INFO: %s Running SBT coverage: %v", logPrefix, coverageArgs)
	cmd := exec.CommandContext(ctx, sbtPath, coverageArgs...)
	cmd.Dir = dir
	cmd.Env = env
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("WARNING: %s SBT coverage failed: %v, output: %s", logPrefix, err, string(output))
		return CoverageResponse{}, err
	}
	return parseScoverageReport(dir, logPrefix)
}

// Find SBT executable
func findSBTExecutable(dir string) string {
	if FileExists(filepath.Join(dir, "sbt")) {
		return filepath.Join(dir, "sbt")
	}
	sbtPaths := []string{"sbt", "/usr/bin/sbt", "/usr/local/bin/sbt"}
	
	for _, sbtPath := range sbtPaths {
		if err := exec.Command("which", sbtPath).Run(); err == nil {
			return sbtPath
		}
	}
	if err := exec.Command("sbt", "-version").Run(); err == nil {
		return "sbt"
	}

	return ""
}

// Parse scoverage report for Scala projects
func parseScoverageReport(dir string, logPrefix string) (CoverageResponse, error) {
	reportPaths := []string{
		"target/scala-*/scoverage-report/scoverage.xml",
		"target/scoverage-report/scoverage.xml",
		"*/target/scala-*/scoverage-report/scoverage.xml",
	}

	var reportPath string
	for _, path := range reportPaths {
		matches, err := filepath.Glob(filepath.Join(dir, path))
		if err == nil && len(matches) > 0 {
			reportPath = matches[0]
			break
		}
	}
	if reportPath == "" {
		return CoverageResponse{}, errors.New("no scoverage report found")
	}

	content, err := os.ReadFile(reportPath)
	if err != nil {
		return CoverageResponse{}, err
	}
	return parseScoverageXMLContent(string(content), logPrefix)
}

// Parse scoverage XML content
func parseScoverageXMLContent(xmlContent string, logPrefix string) (CoverageResponse, error) {
	var totalCoverage float64
	re := regexp.MustCompile(`statement-rate="([^"]*)"`)
	if matches := re.FindStringSubmatch(xmlContent); len(matches) >= 2 {
		if rate, err := strconv.ParseFloat(matches[1], 64); err == nil {
			totalCoverage = rate * 100 
		}
	}
	var files []FileCoverage
	classRe := regexp.MustCompile(`<class name="([^"]*)" filename="([^"]*)"[^>]*statement-rate="([^"]*)"`)
	classMatches := classRe.FindAllStringSubmatch(xmlContent, -1)
	
	for _, match := range classMatches {
		if len(match) >= 4 {
			// className := match[1]
			filename := match[2]
			rateStr := match[3]
			
			if rate, err := strconv.ParseFloat(rateStr, 64); err == nil {
				fileCoverage := rate * 100
				
				status := "Success"
				errorMsg := ""
				if fileCoverage == 0.0 {
					status = "Failure"
					errorMsg = "File has 0% statement coverage"
				}
				
				files = append(files, FileCoverage{
					File:     filename,
					Coverage: fileCoverage,
					Status:   status,
					Error:    errorMsg,
				})
			}
		}
	}

	log.Printf("INFO: %s Successfully parsed scoverage report - Total coverage: %.2f%%", logPrefix, totalCoverage)
	return CoverageResponse{TotalCoverage: totalCoverage, Files: files}, nil
}

// Bazel coverage support
func runBazelCoverage(dir string, logPrefix string, projectInfo *JavaProjectInfo) (CoverageResponse, error) {
	log.Printf("INFO: %s Running Bazel coverage", logPrefix)
	
	bazelPath := findBazelExecutable()
	if bazelPath == "" {
		return CoverageResponse{}, errors.New("bazel executable not found")
	}
	env := setupJavaEnvironment(FindJavaExecutable())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	coverageArgs := []string{"coverage", "//..."}
	
	log.Printf("INFO: %s Running Bazel coverage: %v", logPrefix, coverageArgs)
	cmd := exec.CommandContext(ctx, bazelPath, coverageArgs...)
	cmd.Dir = dir
	cmd.Env = env
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("WARNING: %s Bazel coverage failed: %v, output: %s", logPrefix, err, string(output))
		return CoverageResponse{}, err
	}
	return parseBazelCoverageReport(dir, logPrefix)
}

// Find Bazel executable
func findBazelExecutable() string {
	bazelPaths := []string{"bazel", "/usr/bin/bazel", "/usr/local/bin/bazel"}
	
	for _, bazelPath := range bazelPaths {
		if err := exec.Command("which", bazelPath).Run(); err == nil {
			return bazelPath
		}
	}

	if err := exec.Command("bazel", "version").Run(); err == nil {
		return "bazel"
	}

	return ""
}

// Parse Bazel coverage report (simplified)
func parseBazelCoverageReport(dir string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Bazel coverage parsing not fully implemented, using estimation", logPrefix)
	return EstimateJavaCoverage(dir, logPrefix)
}

// Leiningen coverage support for Clojure projects
func runLeiningenCoverage(dir string, logPrefix string, projectInfo *JavaProjectInfo) (CoverageResponse, error) {
	log.Printf("INFO: %s Running Leiningen coverage for Clojure project", logPrefix)
	
	leinPath := findLeiningenExecutable()
	if leinPath == "" {
		return CoverageResponse{}, errors.New("lein executable not found")
	}

	env := setupJavaEnvironment(FindJavaExecutable())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	coverageArgs := []string{"cloverage"}
	
	log.Printf("INFO: %s Running Leiningen coverage: %v", logPrefix, coverageArgs)
	cmd := exec.CommandContext(ctx, leinPath, coverageArgs...)
	cmd.Dir = dir
	cmd.Env = env
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("WARNING: %s Leiningen coverage failed: %v, output: %s", logPrefix, err, string(output))
		testArgs := []string{"test"}
		testCmd := exec.CommandContext(ctx, leinPath, testArgs...)
		testCmd.Dir = dir
		testCmd.Env = env
		testCmd.Run()
		
		return CoverageResponse{}, err
	}
	return parseCoverageReport(dir, logPrefix)
}

// Find Leiningen executable
func findLeiningenExecutable() string {
	leinPaths := []string{"lein", "/usr/bin/lein", "/usr/local/bin/lein"}
	
	for _, leinPath := range leinPaths {
		if err := exec.Command("which", leinPath).Run(); err == nil {
			return leinPath
		}
	}
	if err := exec.Command("lein", "version").Run(); err == nil {
		return "lein"
	}

	return ""
}

// Parse cloverage report for Clojure projects
func parseCoverageReport(dir string, logPrefix string) (CoverageResponse, error) {
	reportPaths := []string{
		"target/coverage/coverage.xml",
		"coverage/coverage.xml",
	}

	var reportPath string
	for _, path := range reportPaths {
		fullPath := filepath.Join(dir, path)
		if FileExists(fullPath) {
			reportPath = fullPath
			break
		}
	}

	if reportPath == "" {
		return CoverageResponse{}, errors.New("no cloverage report found")
	}

	content, err := os.ReadFile(reportPath)
	if err != nil {
		return CoverageResponse{}, err
	}
	return parseJaCoCoXMLContent(string(content), logPrefix)
}

// Enhanced Ant coverage support
func runAntCoverage(dir string, logPrefix string, projectInfo *JavaProjectInfo) (CoverageResponse, error) {
	log.Printf("INFO: %s Running enhanced Ant coverage", logPrefix)
	
	antPath := findAntExecutable()
	if antPath == "" {
		return CoverageResponse{}, errors.New("ant executable not found")
	}

	env := setupJavaEnvironment(FindJavaExecutable())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	testTargets := []string{"test", "junit", "run-tests", "check", "coverage"}
	
	for _, target := range testTargets {
		log.Printf("INFO: %s Attempting Ant target: %s", logPrefix, target)
		cmd := exec.CommandContext(ctx, antPath, target)
		cmd.Dir = dir
		cmd.Env = env
		
		if err := cmd.Run(); err == nil {
			log.Printf("INFO: %s Ant target '%s' succeeded", logPrefix, target)
			break
		}
	}
	return findAndParseAntCoverageReports(dir, logPrefix)
}

// Find Ant executable
func findAntExecutable() string {
	antPaths := []string{"ant", "/usr/bin/ant", "/usr/local/bin/ant"}
	
	if antHome := os.Getenv("ANT_HOME"); antHome != "" {
		antPaths = append([]string{filepath.Join(antHome, "bin", "ant")}, antPaths...)
	}
	for _, antPath := range antPaths {
		if err := exec.Command("which", antPath).Run(); err == nil {
			return antPath
		}
	}
	if err := exec.Command("ant", "-version").Run(); err == nil {
		return "ant"
	}

	return ""
}
// Find and parse Ant coverage reports
func findAndParseAntCoverageReports(dir string, logPrefix string) (CoverageResponse, error) {
	reportPaths := []string{
		"build/reports/coverage.xml",
		"target/coverage.xml", 
		"reports/jacoco.xml",
		"coverage/jacoco.xml",
		"build/jacoco.xml",
		"dist/coverage.xml",
	}
	
	for _, reportPath := range reportPaths {
		fullPath := filepath.Join(dir, reportPath)
		if FileExists(fullPath) {
			log.Printf("INFO: %s Found Ant coverage report: %s", logPrefix, fullPath)
			content, err := os.ReadFile(fullPath)
			if err != nil {
				continue
			}
			return parseJaCoCoXMLContent(string(content), logPrefix)
		}
	}
	return EstimateJavaCoverage(dir, logPrefix)
}

// Enhanced simple Java coverage
func runSimpleJavaCoverage(dir string, logPrefix string, projectInfo *JavaProjectInfo) (CoverageResponse, error) {
	log.Printf("INFO: %s Running enhanced simple Java coverage", logPrefix)

	if projectInfo.JavaPath == "" {
		return CoverageResponse{}, errors.New("java executable not found")
	}
	if err := compileJavaProject(dir, logPrefix, projectInfo.JavaPath); err != nil {
		log.Printf("WARNING: %s Failed to compile Java project: %v", logPrefix, err)
	}

	if err := runJavaTests(dir, logPrefix, projectInfo.JavaPath); err != nil {
		log.Printf("WARNING: %s Failed to run Java tests: %v", logPrefix, err)
	}
	return EstimateJavaCoverage(dir, logPrefix)
}

// Enhanced Java project compilation
func compileJavaProject(dir string, logPrefix string, javaPath string) error {
	log.Printf("INFO: %s Compiling Java project", logPrefix)

	javacPath := strings.Replace(javaPath, "java", "javac", 1)
	if runtime.GOOS == "windows" {
		javacPath = strings.Replace(javaPath, "java.exe", "javac.exe", 1)
	}
	
	if !FileExists(javacPath) {
		if err := exec.Command("javac", "-version").Run(); err == nil {
			javacPath = "javac"
		} else {
			return errors.New("javac not found")
		}
	}
	javaFiles := FindFiles(dir, []string{"**/*.java"})
	if len(javaFiles) == 0 {
		return errors.New("no Java files found to compile")
	}
	outputDir := filepath.Join(dir, "build", "classes")
	os.MkdirAll(outputDir, 0755)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	
	args := []string{"-d", outputDir, "-cp", buildClasspath(dir)}
	args = append(args, javaFiles...)
	
	cmd := exec.CommandContext(ctx, javacPath, args...)
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()

	if err != nil {
		log.Printf("WARNING: %s Java compilation failed: %v, output: %s", logPrefix, err, string(output))
		return err
	}

	log.Printf("INFO: %s Java compilation successful", logPrefix)
	return nil
}

// Build classpath for compilation
func buildClasspath(dir string) string {
	classpathElements := []string{"."}
	libDirs := []string{"lib", "libs", "lib/*", "libs/*"}
	for _, libDir := range libDirs {
		libPath := filepath.Join(dir, libDir)
		if DirExists(libPath) || len(FindFiles(dir, []string{libDir})) > 0 {
			classpathElements = append(classpathElements, libPath)
		}
	}
	depDirs := []string{
		"target/dependency/*",
		"build/libs/*",
		"~/.m2/repository/*",
	}
	
	for _, depDir := range depDirs {
		classpathElements = append(classpathElements, depDir)
	}
	
	separator := ":"
	if runtime.GOOS == "windows" {
		separator = ";"
	}
	
	return strings.Join(classpathElements, separator)
}

func runJavaTests(dir string, logPrefix string, javaPath string) error {
	log.Printf("INFO: %s Running Java tests", logPrefix)

	outputDir := filepath.Join(dir, "build", "classes")
	if !DirExists(outputDir) {
		return errors.New("no compiled classes found")
	}
	var testClasses []string
	err := filepath.Walk(outputDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		
		if !info.IsDir() && strings.HasSuffix(path, ".class") {
			className := strings.TrimSuffix(filepath.Base(path), ".class")
			if isTestClassName(className) {
				relPath, _ := filepath.Rel(outputDir, path)
				relPath = strings.TrimSuffix(relPath, ".class")
				fullClassName := strings.ReplaceAll(relPath, string(filepath.Separator), ".")
				testClasses = append(testClasses, fullClassName)
			}
		}
		return nil
	})

	if err != nil || len(testClasses) == 0 {
		log.Printf("INFO: %s No test classes found", logPrefix)
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	
	classpath := buildClasspath(dir) + string(os.PathListSeparator) + outputDir
	
	for _, testClass := range testClasses {
		log.Printf("INFO: %s Attempting to run test class: %s", logPrefix, testClass)
		
		cmd := exec.CommandContext(ctx, javaPath, "-cp", classpath, testClass)
		cmd.Dir = dir
		output, err := cmd.CombinedOutput()
		
		if err != nil {
			log.Printf("WARNING: %s Failed to run test class %s: %v, output: %s", 
				logPrefix, testClass, err, string(output))
		} else {
			log.Printf("INFO: %s Successfully ran test class %s", logPrefix, testClass)
		}
	}

	return nil
}

func isTestClassName(className string) bool {
	lowerName := strings.ToLower(className)
	return strings.Contains(lowerName, "test") ||
		strings.HasSuffix(lowerName, "tests") ||
		strings.HasPrefix(lowerName, "test") ||
		strings.Contains(lowerName, "testcase") ||
		strings.Contains(lowerName, "spec") ||
		strings.Contains(lowerName, "should") ||
		strings.Contains(lowerName, "when")
}

func getProjectTypeName(projectType JavaProjectType) string {
	switch projectType {
	case MavenProject:
		return "Maven Project"
	case GradleProject:
		return "Gradle Project"
	case AntProject:
		return "Ant Project"
	case SpringBootProject:
		return "Spring Boot Project"
	case QuarkusProject:
		return "Quarkus Project"
	case MicronautProject:
		return "Micronaut Project"
	case AndroidProject:
		return "Android Application"
	case AndroidLibraryProject:
		return "Android Library"
	case ScalaProject:
		return "Scala Project"
	case KotlinProject:
		return "Kotlin Project"
	case PlayFrameworkProject:
		return "Play Framework Project"
	case MavenMultiModuleProject:
		return "Maven Multi-Module Project"
	case GradleMultiModuleProject:
		return "Gradle Multi-Module Project"
	case JavaEEProject:
		return "Java EE Project"
	case JakartaEEProject:
		return "Jakarta EE Project"
	case VertxProject:
		return "Vert.x Project"
	case MicronautGraalProject:
		return "Micronaut GraalVM Project"
	case NativeImageProject:
		return "GraalVM Native Image Project"
	case LombokProject:
		return "Project with Lombok"
	case BazelProject:
		return "Bazel Project"
	case SBTProject:
		return "SBT Project"
	case LeiningenProject:
		return "Leiningen Project"
	case DropwizardProject:
		return "Dropwizard Project"
	case SparkJavaProject:
		return "Spark Java Project"
	case JHipsterProject:
		return "JHipster Project"
	case SimpleJavaProject:
		return "Simple Java Project"
	default:
		return "Unknown Java Project"
	}
}

func getBuildToolName(buildTool JavaBuildTool) string {
	switch buildTool {
	case Maven:
		return "Maven"
	case Gradle:
		return "Gradle"
	case Ant:
		return "Ant"
	case SBT:
		return "SBT (Scala Build Tool)"
	case Bazel:
		return "Bazel"
	case Leiningen:
		return "Leiningen"
	case Mill:
		return "Mill"
	case IvyBuildTool:
		return "Ivy"
	case MakefileBuild:
		return "Makefile"
	default:
		return "Unknown Build Tool"
	}
}

func DiagnoseJavaProject(dir string, logPrefix string) {
	log.Printf("INFO: %s Starting comprehensive Java/JVM project diagnosis", logPrefix)
	
	projectInfo := DetectJavaProjectInfo(dir, logPrefix)
	log.Printf("INFO: %s Project Type: %s", logPrefix, getProjectTypeName(projectInfo.Type))
	log.Printf("INFO: %s Build Tool: %s", logPrefix, getBuildToolName(projectInfo.BuildTool))
	log.Printf("INFO: %s Languages: %v", logPrefix, projectInfo.Languages)
	log.Printf("INFO: %s Test Frameworks: %v", logPrefix, projectInfo.TestFrameworks)
	log.Printf("INFO: %s Coverage Tools: %v", logPrefix, projectInfo.CoverageTools)
	if projectInfo.Framework != "" {
		log.Printf("INFO: %s Primary Framework: %s", logPrefix, projectInfo.Framework)
	}
	
	frameworkFlags := []string{}
	if projectInfo.IsSpringBoot { frameworkFlags = append(frameworkFlags, "Spring Boot") }
	if projectInfo.IsQuarkus { frameworkFlags = append(frameworkFlags, "Quarkus") }
	if projectInfo.IsMicronaut { frameworkFlags = append(frameworkFlags, "Micronaut") }
	if projectInfo.IsAndroid { frameworkFlags = append(frameworkFlags, "Android") }
	if projectInfo.IsScala { frameworkFlags = append(frameworkFlags, "Scala") }
	if projectInfo.IsKotlin { frameworkFlags = append(frameworkFlags, "Kotlin") }
	if projectInfo.IsMultiModule { frameworkFlags = append(frameworkFlags, "Multi-Module") }
	
	if len(frameworkFlags) > 0 {
		log.Printf("INFO: %s Framework Flags: %v", logPrefix, frameworkFlags)
	}
	buildFlags := []string{}
	if projectInfo.HasMavenWrapper { buildFlags = append(buildFlags, "Maven Wrapper") }
	if projectInfo.HasGradleWrapper { buildFlags = append(buildFlags, "Gradle Wrapper") }
	if projectInfo.HasPomXml { buildFlags = append(buildFlags, "pom.xml") }
	if projectInfo.HasBuildGradle { buildFlags = append(buildFlags, "build.gradle") }
	if projectInfo.HasBuildXml { buildFlags = append(buildFlags, "build.xml") }
	
	if len(buildFlags) > 0 {
		log.Printf("INFO: %s Build Files: %v", logPrefix, buildFlags)
	}

	infraFlags := []string{}
	if projectInfo.HasDocker { infraFlags = append(infraFlags, "Docker") }
	if projectInfo.HasK8s { infraFlags = append(infraFlags, "Kubernetes") }
	if projectInfo.HasCI { infraFlags = append(infraFlags, "CI/CD") }
	
	if len(infraFlags) > 0 {
		log.Printf("INFO: %s Infrastructure: %v", logPrefix, infraFlags)
		if len(projectInfo.CITools) > 0 {
			log.Printf("INFO: %s CI Tools: %v", logPrefix, projectInfo.CITools)
		}
	}

	if len(projectInfo.SourceDirs) > 0 {
		log.Printf("INFO: %s Source Directories: %v", logPrefix, projectInfo.SourceDirs)
	}
	if len(projectInfo.TestDirs) > 0 {
		log.Printf("INFO: %s Test Directories: %v", logPrefix, projectInfo.TestDirs)
	}
	
	sourceFiles, testFiles := countSourceFiles(dir, projectInfo.Languages)
	log.Printf("INFO: %s Source Files by Language: %v", logPrefix, sourceFiles)
	if len(testFiles) > 0 {
		log.Printf("INFO: %s Test Files by Language: %v", logPrefix, testFiles)
	}
	
	if projectInfo.JDKVersion != "" {
		log.Printf("INFO: %s JDK Version: %s", logPrefix, projectInfo.JDKVersion)
	}
	
	if projectInfo.JavaPath != "" {
		log.Printf("INFO: %s Java Executable: %s", logPrefix, projectInfo.JavaPath)
		if javaVersion := getJavaVersionFromExecutable(projectInfo.JavaPath); javaVersion != "" {
			log.Printf("INFO: %s Runtime Java Version: %s", logPrefix, javaVersion)
		}
	}
	if len(projectInfo.Dependencies) > 0 {
		log.Printf("INFO: %s Key Dependencies: %v", logPrefix, projectInfo.Dependencies)
	}

	if len(projectInfo.ConfigFiles) > 0 {
		log.Printf("INFO: %s Configuration Files: %d found", logPrefix, len(projectInfo.ConfigFiles))
	}
	
	log.Printf("INFO: %s ===== END PROJECT ANALYSIS =====", logPrefix)
}

func countSourceFiles(dir string, languages []string) (map[string]int, map[string]int) {
	sourceFiles := make(map[string]int)
	testFiles := make(map[string]int)
	
	languageExtensions := map[string][]string{
		"Java":       {".java"},
		"Kotlin":     {".kt", ".kts"},
		"Scala":      {".scala"},
		"Groovy":     {".groovy"},
		"Clojure":    {".clj", ".cljs", ".cljc"},
		"JavaScript": {".js", ".mjs"},
		"TypeScript": {".ts"},
	}
	
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
	
		if strings.HasPrefix(filepath.Base(path), ".") || shouldSkipDirectory(filepath.Dir(path)) {
			return nil
		}
		
		ext := filepath.Ext(path)
		
		for language, extensions := range languageExtensions {
			for _, langExt := range extensions {
				if ext == langExt {
					if isTestFile(path, language) {
						testFiles[language]++
					} else {
						sourceFiles[language]++
					}
					return nil
				}
			}
		}
		return nil
	})
	
	return sourceFiles, testFiles
}

func isTestFile(filename, language string) bool {
	switch language {
	case "Java":
		return isJavaTestFile(filename)
	case "Kotlin":
		return isKotlinTestFile(filename)
	case "Scala":
		return isScalaTestFile(filename)
	case "Groovy":
		return isGroovyTestFile(filename)
	case "Clojure":
		return isClojureTestFile(filename)
	default:
		return isJavaTestFile(filename) 
	}
}

// Main entry point for universal Java/JVM coverage analysis
func RunJavaComprehensiveCoverage(dir string, logPrefix string) (CoverageResponse, error) {
	log.Printf("INFO: %s Starting universal Java/JVM coverage analysis", logPrefix)

	// First, verify this is a Java/JVM project
	if !DetectJavaProject(dir) {
		return CoverageResponse{}, errors.New("not a Java/JVM project")
	}

	// Run comprehensive diagnosis
	DiagnoseJavaProject(dir, logPrefix)
	
	// Get detailed project information
	projectInfo := DetectJavaProjectInfo(dir, logPrefix)
	
	// Execute coverage analysis with fallback strategy
	result, err := RunJavaCoverage(dir, logPrefix)
	if err != nil {
		log.Printf("WARNING: %s Coverage analysis failed: %v", logPrefix, err)
		return result, err
	}

	// Enhance result with comprehensive metadata
	result = enhanceResultWithProjectInfo(result, projectInfo, logPrefix)
	
	// Add additional analysis results
	result.Repository = detectRepositoryInfo(dir, logPrefix)
	result.Branch = detectCurrentBranch(dir, logPrefix)
	result.CommitHash = detectCurrentCommit(dir, logPrefix)
	
	log.Printf("INFO: %s Universal coverage analysis complete - %.2f%% coverage across %d files", 
		logPrefix, result.TotalCoverage, len(result.Files))
	
	return result, nil
}

// Detect repository information
func detectRepositoryInfo(dir string, logPrefix string) string {
	// Check for .git directory
	if DirExists(filepath.Join(dir, ".git")) {
		// Try to get remote origin URL
		cmd := exec.Command("git", "config", "--get", "remote.origin.url")
		cmd.Dir = dir
		if output, err := cmd.Output(); err == nil {
			repoURL := strings.TrimSpace(string(output))
			log.Printf("DEBUG: %s Detected repository: %s", logPrefix, repoURL)
			return repoURL
		}
		return "git-repository"
	}
	
	// Check for other VCS
	if DirExists(filepath.Join(dir, ".svn")) {
		return "svn-repository"
	}
	if DirExists(filepath.Join(dir, ".hg")) {
		return "mercurial-repository"
	}
	
	return ""
}

// Detect current branch
func detectCurrentBranch(dir string, logPrefix string) string {
	if !DirExists(filepath.Join(dir, ".git")) {
		return ""
	}
	
	cmd := exec.Command("git", "branch", "--show-current")
	cmd.Dir = dir
	if output, err := cmd.Output(); err == nil {
		branch := strings.TrimSpace(string(output))
		log.Printf("DEBUG: %s Detected branch: %s", logPrefix, branch)
		return branch
	}
	
	return ""
}

// Detect current commit hash
func detectCurrentCommit(dir string, logPrefix string) string {
	if !DirExists(filepath.Join(dir, ".git")) {
		return ""
	}
	
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = dir
	if output, err := cmd.Output(); err == nil {
		commit := strings.TrimSpace(string(output))
		if len(commit) > 8 {
			commit = commit[:8] // Short hash
		}
		log.Printf("DEBUG: %s Detected commit: %s", logPrefix, commit)
		return commit
	}
	
	return ""
}




// Parse Cobertura XML content
func parseCoberturaXMLContent(xmlContent string, logPrefix string) (CoverageResponse, error) {
	// Parse line-rate from coverage element
	var totalCoverage float64
	
	re := regexp.MustCompile(`<coverage[^>]*line-rate="([^"]*)"`)
	if matches := re.FindStringSubmatch(xmlContent); len(matches) >= 2 {
		if rate, err := strconv.ParseFloat(matches[1], 64); err == nil {
			totalCoverage = rate * 100 // Convert from decimal to percentage
		}
	}

	// Parse class-level coverage
	var files []FileCoverage
	classRe := regexp.MustCompile(`<class name="([^"]*)" filename="([^"]*)"[^>]*line-rate="([^"]*)"`)
	classMatches := classRe.FindAllStringSubmatch(xmlContent, -1)
	
	for _, match := range classMatches {
		if len(match) >= 4 {
			// className := match[1]
			filename := match[2]
			rateStr := match[3]
			
			if rate, err := strconv.ParseFloat(rateStr, 64); err == nil {
				fileCoverage := rate * 100
				
				status := "Success"
				errorMsg := ""
				if fileCoverage == 0.0 {
					status = "Failure"
					errorMsg = "File has 0% line coverage"
				}
				
				files = append(files, FileCoverage{
					File:     filename,
					Coverage: fileCoverage,
					Status:   status,
					Error:    errorMsg,
				})
			}
		}
	}

	log.Printf("INFO: %s Successfully parsed Cobertura report - Total coverage: %.2f%%", logPrefix, totalCoverage)
	return CoverageResponse{TotalCoverage: totalCoverage, Files: files}, nil
}

