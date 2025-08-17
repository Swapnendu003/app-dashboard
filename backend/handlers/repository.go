package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"log"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/backend/config"
	"github.com/yourusername/backend/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type RepoWithLang struct {
	models.Repository
	Languages map[string]float64 `json:"languages"`
}

// GitHub API Response Structures for Branches
type GitHubBranch struct {
	Name   string `json:"name"`
	Commit struct {
		SHA string `json:"sha"`
		URL string `json:"url"`
	} `json:"commit"`
	Protected bool `json:"protected"`
}

type GitHubRepository struct {
	DefaultBranch string `json:"default_branch"`
	Private       bool   `json:"private"`
	Fork          bool   `json:"fork"`
	Language      string `json:"language"`
}

// Response Structures for Branches
type BranchInfo struct {
	Name      string `json:"name"`
	CommitSHA string `json:"commit_sha"`
	Protected bool   `json:"protected"`
	IsDefault bool   `json:"is_default"`
}

type RepositoryBranchesResponse struct {
	Repository    string       `json:"repository"`
	DefaultBranch string       `json:"default_branch"`
	TotalBranches int          `json:"total_branches"`
	Branches      []BranchInfo `json:"branches"`
}

// GetRepositoryBranches fetches all branches from a GitHub repository
func GetRepositoryBranches(c *gin.Context) {
	repoURL := c.Query("repo_url")
	if repoURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Repository URL is required"})
		return
	}

	// Extract owner and repo name from GitHub URL
	owner, repo, err := parseGitHubURL(repoURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid GitHub repository URL"})
		return
	}

	// Get GitHub token from user context
	githubToken, err := extractGitHubToken(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	// Get repository info first to get default branch
	repoInfo, err := getRepositoryInfo(owner, repo, githubToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to get repository info: %v", err)})
		return
	}

	// Get branches from GitHub API
	branches, err := getRepositoryBranches(owner, repo, githubToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to fetch branches: %v", err)})
		return
	}

	// Convert to response format
	var branchInfos []BranchInfo
	for _, branch := range branches {
		branchInfo := BranchInfo{
			Name:      branch.Name,
			CommitSHA: branch.Commit.SHA,
			Protected: branch.Protected,
			IsDefault: branch.Name == repoInfo.DefaultBranch,
		}
		branchInfos = append(branchInfos, branchInfo)
	}

	response := RepositoryBranchesResponse{
		Repository:    repoURL,
		DefaultBranch: repoInfo.DefaultBranch,
		TotalBranches: len(branchInfos),
		Branches:      branchInfos,
	}

	c.JSON(http.StatusOK, response)
}

func GetUserRepositories(c *gin.Context) {
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

	skip := 0
	limit := 10
	skipParam := c.Query("skip")
	limitParam := c.Query("limit")
	searchParam := c.Query("search")
	refreshParam := c.Query("refresh")
	refreshData := refreshParam == "true"

	if skipParam != "" {
		if skipInt, err := strconv.Atoi(skipParam); err == nil {
			skip = skipInt
		}
	}

	if limitParam != "" {
		if limitInt, err := strconv.Atoi(limitParam); err == nil && limitInt > 0 && limitInt <= 50 {
			limit = limitInt
		}
	}

	if !refreshData {
		dbRepos, totalCount, dbErr := getRepositoriesFromDB(userID, skip, limit, searchParam)
		if dbErr != nil {
		} else if totalCount > 0 {
			c.JSON(http.StatusOK, gin.H{
				"repositories": dbRepos,
				"totalCount":   totalCount,
				"skip":         skip,
				"limit":        limit,
				"source":       "database",
			})
			return
		}
		fetchRepositoriesFromGitHub(c, userID, skip, limit, searchParam, false)
		return
	}

	fetchRepositoriesFromGitHub(c, userID, skip, limit, searchParam, true)
}

func getRepositoriesFromDB(userID primitive.ObjectID, skip, limit int, search string) ([]RepoWithLang, int, error) {
	collection := config.GetCollection("repositories")
	filter := bson.M{"user_id": userID}
	if search != "" {
		filter["$or"] = []bson.M{
			{"name": bson.M{"$regex": search, "$options": "i"}},
			{"description": bson.M{"$regex": search, "$options": "i"}},
		}
	}
	totalCount, err := collection.CountDocuments(context.Background(), filter)
	if err != nil {
		return nil, 0, fmt.Errorf("error counting repositories: %w", err)
	}
	findOptions := options.Find().
		SetSkip(int64(skip)).
		SetLimit(int64(limit)).
		SetSort(bson.D{{Key: "name", Value: 1}})
	cursor, err := collection.Find(context.Background(), filter, findOptions)
	if err != nil {
		return nil, 0, fmt.Errorf("error finding repositories: %w", err)
	}
	defer cursor.Close(context.Background())
	var repositories []models.Repository
	if err = cursor.All(context.Background(), &repositories); err != nil {
		return nil, 0, fmt.Errorf("error decoding repositories: %w", err)
	}
	reposWithLang := make([]RepoWithLang, len(repositories))
	for i, repo := range repositories {
		reposWithLang[i] = RepoWithLang{
			Repository: repo,
			Languages:  repo.Languages,
		}
	}
	return reposWithLang, int(totalCount), nil
}

func fetchRepositoriesFromGitHub(c *gin.Context, userID primitive.ObjectID, skip, limit int, searchParam string, forceRefresh bool) {
	log.Printf("Fetching repositories from GitHub - User: %s, Skip: %d, Limit: %d, Search: %s, ForceRefresh: %v", userID.Hex(), skip, limit, searchParam, forceRefresh)
	collection := config.GetCollection("users")
	var user models.User
	if err := collection.FindOne(context.Background(), bson.M{"_id": userID}).Decode(&user); err != nil {
		log.Printf("Error: Failed to get user information for ID %s: %v", userID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user information"})
		return
	}
	if user.AccessToken == "" {
		log.Printf("Error: GitHub token not available for user %s", userID.Hex())
		c.JSON(http.StatusUnauthorized, gin.H{"error": "GitHub token not available. Please reconnect your GitHub account."})
		return
	}
	var allRepos []models.GitHubRepository
	page := 1
	perPage := 100
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	for {
		url := fmt.Sprintf("https://api.github.com/user/repos?per_page=%d&page=%d&type=all", perPage, page)
		log.Printf("Making GitHub API request to %s", url)
		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("Authorization", "token "+user.AccessToken)
		req.Header.Set("Accept", "application/vnd.github.v3+json")
		req.Header.Set("User-Agent", "YourAppName")
		if forceRefresh {
			req.Header.Set("Cache-Control", "no-cache")
			req.URL.RawQuery = req.URL.RawQuery + "&_=" + strconv.FormatInt(time.Now().Unix(), 10)
			log.Printf("Adding cache-busting parameter for force refresh: %s", req.URL.String())
		}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Error: Failed to fetch repositories from GitHub: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch repositories from GitHub: " + err.Error()})
			return
		}
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			log.Printf("GitHub API error - Status: %d, Body: %s", resp.StatusCode, string(body))
			switch resp.StatusCode {
			case http.StatusForbidden:
				c.JSON(http.StatusForbidden, gin.H{"error": "GitHub API rate limit exceeded or permissions issue", "code": resp.StatusCode, "details": string(body)})
			case http.StatusUnauthorized:
				c.JSON(http.StatusUnauthorized, gin.H{"error": "GitHub authentication failed. Please reconnect your GitHub account.", "code": resp.StatusCode})
			default:
				c.JSON(http.StatusInternalServerError, gin.H{"error": "GitHub API returned an error", "code": resp.StatusCode, "details": string(body)})
			}
			return
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		var pageRepos []models.GitHubRepository
		if err := json.Unmarshal(body, &pageRepos); err != nil {
			log.Printf("Error: Failed to parse GitHub response: %v\nResponse body: %s", err, string(body))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse GitHub response"})
			return
		}
		log.Printf("Successfully fetched %d repositories from GitHub (page %d) for user %s", len(pageRepos), page, userID.Hex())
		allRepos = append(allRepos, pageRepos...)
		if len(pageRepos) < perPage {
			break
		}
		page++
		time.Sleep(100 * time.Millisecond)
	}
	log.Printf("Total repositories fetched from GitHub: %d", len(allRepos))
	if searchParam != "" {
		searchLower := strings.ToLower(searchParam)
		var filtered []models.GitHubRepository
		for _, repo := range allRepos {
			if strings.Contains(strings.ToLower(repo.Name), searchLower) ||
				(strings.TrimSpace(repo.Description) != "" && strings.Contains(strings.ToLower(repo.Description), searchLower)) {
				filtered = append(filtered, repo)
			}
		}
		log.Printf("Applied search filter '%s': filtered from %d to %d repositories", searchParam, len(allRepos), len(filtered))
		allRepos = filtered
	}
	if c == nil {
		processAndSaveRepositoriesBackground(context.Background(), userID, allRepos, skip, limit, user.AccessToken, forceRefresh)
	} else {
		processAndSaveRepositories(c, userID, allRepos, skip, limit, user.AccessToken, forceRefresh)
	}
}

func processAndSaveRepositories(c *gin.Context, userID primitive.ObjectID, githubRepos []models.GitHubRepository, skip, limit int, accessToken string, forceRefresh bool) {
	log.Printf("Processing %d repositories for user %s (forceRefresh: %v)", len(githubRepos), userID.Hex(), forceRefresh)
	const maxConcurrent = 5
	sem := make(chan struct{}, maxConcurrent)
	var (
		reposWithLang []RepoWithLang
		wg            sync.WaitGroup
		mu            sync.Mutex
		now           = time.Now()
		errorCount    = 0
		successCount  = 0
	)
	for idx, repo := range githubRepos {
		wg.Add(1)
		go func(idx int, repo models.GitHubRepository) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			repoCollection := config.GetCollection("repositories")
			var existingRepo models.Repository
			err := repoCollection.FindOne(
				context.Background(),
				bson.M{
					"github_id": repo.ID,
					"user_id":   userID,
				},
			).Decode(&existingRepo)
			var languages map[string]float64
			repoLog := fmt.Sprintf("[Repo %d/%d] %s/%s (ID: %d)", idx+1, len(githubRepos), repo.Owner.Login, repo.Name, repo.ID)
			if err == nil && len(existingRepo.Languages) > 0 && !isLanguageDataStale(existingRepo.LastFetched) && !forceRefresh {
				log.Printf("%s: Using cached language data (last fetched: %s)", repoLog, existingRepo.LastFetched.Format(time.RFC3339))
				languages = existingRepo.Languages
			} else {
				langURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/languages", repo.Owner.Login, repo.Name)
				log.Printf("%s: Fetching languages from %s", repoLog, langURL)
				langReq, _ := http.NewRequest("GET", langURL, nil)
				langReq.Header.Set("Authorization", "token "+accessToken)
				langReq.Header.Set("Accept", "application/vnd.github.v3+json")
				langReq.Header.Set("User-Agent", "YourAppName")
				langClient := &http.Client{
					Timeout: 10 * time.Second,
				}
				langResp, err := langClient.Do(langReq)
				if err != nil || langResp.StatusCode != http.StatusOK {
					if err != nil {
						log.Printf("%s: Error fetching languages: %v", repoLog, err)
					} else {
						langBody, _ := io.ReadAll(langResp.Body)
						log.Printf("%s: Language API error - Status: %d, Body: %s", repoLog, langResp.StatusCode, string(langBody))
						langResp.Body.Close()
					}
					languages = make(map[string]float64)
					if err == nil && len(existingRepo.Languages) > 0 {
						log.Printf("%s: Using existing language data due to API error", repoLog)
						languages = existingRepo.Languages
					}
				} else {
					defer langResp.Body.Close()
					var langBytes map[string]int
					if err := json.NewDecoder(langResp.Body).Decode(&langBytes); err != nil {
						log.Printf("%s: Error decoding language data: %v", repoLog, err)
						languages = make(map[string]float64)
						if len(existingRepo.Languages) > 0 {
							languages = existingRepo.Languages
						}
					} else {
						total := 0
						for _, b := range langBytes {
							total += b
						}
						languages = make(map[string]float64)
						if total > 0 {
							for lang, b := range langBytes {
								languages[lang] = float64(b) * 100 / float64(total)
							}
						}
						log.Printf("%s: Successfully fetched language data: %v", repoLog, languages)
					}
				}
			}
			modelRepo := models.Repository{
				Name:        repo.Name,
				FullName:    repo.FullName,
				Description: repo.Description,
				URL:         repo.URL,
				HTMLURL:     repo.HTMLURL,
				Owner:       repo.Owner.Login,
				GitHubID:    repo.ID,
				Private:     repo.Private,
				Status:      "active",
				UserID:      userID,
				Languages:   languages,
				LastFetched: now,
				CreatedAt:   existingRepo.CreatedAt,
				UpdatedAt:   now,
			}
			if err == nil {
				modelRepo.ID = existingRepo.ID
				if existingRepo.CreatedAt.IsZero() {
					modelRepo.CreatedAt = now
				}
				log.Printf("%s: Updating existing repository record (ID: %s)", repoLog, existingRepo.ID.Hex())
			} else {
				modelRepo.ID = primitive.NewObjectID()
				modelRepo.CreatedAt = now
				log.Printf("%s: Creating new repository record", repoLog)
			}
			if err := saveRepositoryToDB(userID, modelRepo, languages); err != nil {
				mu.Lock()
				errorCount++
				mu.Unlock()
				log.Printf("%s: Failed to save repository: %v", repoLog, err)
			} else {
				mu.Lock()
				successCount++
				mu.Unlock()
				log.Printf("%s: Successfully saved repository to database", repoLog)
			}
			mu.Lock()
			reposWithLang = append(reposWithLang, RepoWithLang{
				Repository: modelRepo,
				Languages:  languages,
			})
			mu.Unlock()
		}(idx, repo)
	}
	wg.Wait()
	log.Printf("Finished processing repositories for user %s - Success: %d, Error: %d", userID.Hex(), successCount, errorCount)
	sort.Slice(reposWithLang, func(i, j int) bool {
		return strings.ToLower(reposWithLang[i].Name) < strings.ToLower(reposWithLang[j].Name)
	})
	totalCount := len(reposWithLang)
	end := skip + limit
	if end > totalCount {
		end = totalCount
	}
	var paginatedRepos []RepoWithLang
	if skip < totalCount {
		paginatedRepos = reposWithLang[skip:end]
	} else {
		paginatedRepos = []RepoWithLang{}
	}
	c.JSON(http.StatusOK, gin.H{
		"repositories": paginatedRepos,
		"totalCount":   totalCount,
		"skip":         skip,
		"limit":        limit,
		"source":       "github",
	})
}

func isLanguageDataStale(lastFetched time.Time) bool {
	return lastFetched.IsZero() || time.Since(lastFetched) > 7*24*time.Hour
}

func saveRepositoryToDB(userID primitive.ObjectID, repo models.Repository, languages map[string]float64) error {
	ctx := context.Background()
	collection := config.GetCollection("repositories")
	filter := bson.M{"github_id": repo.GitHubID, "user_id": userID}
	update := bson.M{
		"$set": bson.M{
			"name":         repo.Name,
			"full_name":    repo.FullName,
			"description":  repo.Description,
			"url":          repo.URL,
			"html_url":     repo.HTMLURL,
			"owner":        repo.Owner,
			"private":      repo.Private,
			"status":       repo.Status,
			"user_id":      userID,
			"languages":    languages,
			"last_fetched": time.Now(),
			"updated_at":   time.Now(),
		},
	}
	if repo.CreatedAt.IsZero() {
		update["$set"].(bson.M)["created_at"] = time.Now()
	} else {
		update["$setOnInsert"] = bson.M{"created_at": repo.CreatedAt}
	}
	opts := options.Update().SetUpsert(true)
	result, err := collection.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		log.Printf("Error saving repository %s (ID: %d) to DB: %v", repo.Name, repo.GitHubID, err)
		return err
	}
	if result.MatchedCount > 0 {
		log.Printf("Updated existing repository in DB: %s (ID: %d)", repo.Name, repo.GitHubID)
	} else if result.UpsertedCount > 0 {
		log.Printf("Inserted new repository in DB: %s (ID: %d, MongoDB ID: %v)",
			repo.Name, repo.GitHubID, result.UpsertedID)
	} else {
		log.Printf("Warning: Repository save operation reported no effect: %s (ID: %d)", repo.Name, repo.GitHubID)
	}
	return nil
}

func GetRepositoryByID(c *gin.Context) {
	repoID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(repoID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid repository ID"})
		return
	}
	collection := config.GetCollection("repositories")
	var repo models.Repository
	err = collection.FindOne(context.Background(), bson.M{"_id": objID}).Decode(&repo)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Repository not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error: " + err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"repository": repo})
}

func RefreshUserRepositories(c *gin.Context) {
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
	skip := 0
	limit := 10
	skipParam := c.Query("skip")
	limitParam := c.Query("limit")
	searchParam := c.Query("search")
	if skipParam != "" {
		if skipInt, err := strconv.Atoi(skipParam); err == nil {
			skip = skipInt
		}
	}
	if limitParam != "" {
		if limitInt, err := strconv.Atoi(limitParam); err == nil && limitInt > 0 && limitInt <= 50 {
			limit = limitInt
		}
	}
	fetchRepositoriesFromGitHub(c, userID, skip, limit, searchParam, true)
}

func RefreshAllRepositories(c *gin.Context) {
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
	skip := 0
	limit := 100
	searchParam := c.Query("search")
	c.JSON(http.StatusOK, gin.H{
		"message": "Repository refresh started. This may take a moment for large collections.",
		"status":  "processing",
	})
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		collection := config.GetCollection("repositories")
		_, err := collection.DeleteMany(ctx, bson.M{"user_id": userID})
		if err != nil {
			log.Printf("Error clearing existing repositories for user %s: %v", userID.Hex(), err)
		} else {
			log.Printf("Cleared existing repositories for user %s before refresh", userID.Hex())
		}
		fetchRepositoriesFromGitHubBackground(ctx, userID, skip, limit, searchParam, true)
		log.Printf("Completed repository refresh for user %s", userID.Hex())
	}()
}

func fetchRepositoriesFromGitHubBackground(ctx context.Context, userID primitive.ObjectID, skip, limit int, searchParam string, forceRefresh bool) {
	log.Printf("Fetching repositories from GitHub (background) - User: %s, Skip: %d, Limit: %d, Search: %s, ForceRefresh: %v",
		userID.Hex(), skip, limit, searchParam, forceRefresh)
	collection := config.GetCollection("users")
	var user models.User
	if err := collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user); err != nil {
		log.Printf("Error: Failed to get user information for ID %s: %v", userID.Hex(), err)
		return
	}
	if user.AccessToken == "" {
		log.Printf("Error: GitHub token not available for user %s", userID.Hex())
		return
	}
	var allRepos []models.GitHubRepository
	page := 1
	perPage := 100
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	for {
		url := fmt.Sprintf("https://api.github.com/user/repos?per_page=%d&page=%d&type=all", perPage, page)
		log.Printf("Making GitHub API request to %s", url)
		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			log.Printf("Error creating request: %v", err)
			return
		}
		req.Header.Set("Authorization", "token "+user.AccessToken)
		req.Header.Set("Accept", "application/vnd.github.v3+json")
		req.Header.Set("User-Agent", "YourAppName")
		if forceRefresh {
			req.Header.Set("Cache-Control", "no-cache")
			req.URL.RawQuery = req.URL.RawQuery + "&_=" + strconv.FormatInt(time.Now().Unix(), 10)
		}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Error: Failed to fetch repositories from GitHub: %v", err)
			return
		}
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			log.Printf("GitHub API error - Status: %d, Body: %s", resp.StatusCode, string(body))
			return
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		var pageRepos []models.GitHubRepository
		if err := json.Unmarshal(body, &pageRepos); err != nil {
			log.Printf("Error: Failed to parse GitHub response: %v", err)
			return
		}
		log.Printf("Successfully fetched %d repositories from GitHub (page %d) for user %s", len(pageRepos), page, userID.Hex())
		allRepos = append(allRepos, pageRepos...)
		if len(pageRepos) < perPage {
			break
		}
		page++
		time.Sleep(100 * time.Millisecond)
	}
	log.Printf("Total repositories fetched from GitHub: %d", len(allRepos))
	if searchParam != "" {
		searchLower := strings.ToLower(searchParam)
		var filtered []models.GitHubRepository
		for _, repo := range allRepos {
			if strings.Contains(strings.ToLower(repo.Name), searchLower) ||
				(strings.TrimSpace(repo.Description) != "" && strings.Contains(strings.ToLower(repo.Description), searchLower)) {
				filtered = append(filtered, repo)
			}
		}
		log.Printf("Applied search filter '%s': filtered from %d to %d repositories", searchParam, len(allRepos), len(filtered))
		allRepos = filtered
	}
	processAndSaveRepositoriesBackground(ctx, userID, allRepos, skip, limit, user.AccessToken, forceRefresh)
}

func processAndSaveRepositoriesBackground(ctx context.Context, userID primitive.ObjectID, githubRepos []models.GitHubRepository,
	skip, limit int, accessToken string, forceRefresh bool) {
	log.Printf("Processing %d repositories for user %s (forceRefresh: %v)", len(githubRepos), userID.Hex(), forceRefresh)
	const maxConcurrent = 5
	sem := make(chan struct{}, maxConcurrent)
	var (
		reposWithLang []RepoWithLang
		wg            sync.WaitGroup
		mu            sync.Mutex
		now           = time.Now()
		errorCount    = 0
		successCount  = 0
	)
	for idx, repo := range githubRepos {
		wg.Add(1)
		go func(idx int, repo models.GitHubRepository) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			repoCollection := config.GetCollection("repositories")
			var existingRepo models.Repository
			err := repoCollection.FindOne(
				ctx,
				bson.M{
					"github_id": repo.ID,
					"user_id":   userID,
				},
			).Decode(&existingRepo)
			var languages map[string]float64
			repoLog := fmt.Sprintf("[Repo %d/%d] %s/%s (ID: %d)", idx+1, len(githubRepos), repo.Owner.Login, repo.Name, repo.ID)
			if err == nil && len(existingRepo.Languages) > 0 && !isLanguageDataStale(existingRepo.LastFetched) && !forceRefresh {
				log.Printf("%s: Using cached language data (last fetched: %s)", repoLog, existingRepo.LastFetched.Format(time.RFC3339))
				languages = existingRepo.Languages
			} else {
				langURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/languages", repo.Owner.Login, repo.Name)
				log.Printf("%s: Fetching languages from %s", repoLog, langURL)
				langReq, err := http.NewRequestWithContext(ctx, "GET", langURL, nil)
				if err != nil {
					log.Printf("%s: Error creating language request: %v", repoLog, err)
					languages = make(map[string]float64)
					if len(existingRepo.Languages) > 0 {
						languages = existingRepo.Languages
					}
					return
				}
				langReq.Header.Set("Authorization", "token "+accessToken)
				langReq.Header.Set("Accept", "application/vnd.github.v3+json")
				langReq.Header.Set("User-Agent", "YourAppName")
				langClient := &http.Client{
					Timeout: 10 * time.Second,
				}
				langResp, err := langClient.Do(langReq)
				if err != nil || langResp == nil || langResp.StatusCode != http.StatusOK {
					if err != nil {
						log.Printf("%s: Error fetching languages: %v", repoLog, err)
					} else if langResp == nil {
						log.Printf("%s: Null response when fetching languages", repoLog)
					} else {
						langBody, _ := io.ReadAll(langResp.Body)
						log.Printf("%s: Language API error - Status: %d, Body: %s", repoLog, langResp.StatusCode, string(langBody))
						langResp.Body.Close()
					}
					languages = make(map[string]float64)
					if err == nil && len(existingRepo.Languages) > 0 {
						log.Printf("%s: Using existing language data due to API error", repoLog)
						languages = existingRepo.Languages
					}
				} else {
					defer langResp.Body.Close()
					var langBytes map[string]int
					if err := json.NewDecoder(langResp.Body).Decode(&langBytes); err != nil {
						log.Printf("%s: Error decoding language data: %v", repoLog, err)
						languages = make(map[string]float64)
						if len(existingRepo.Languages) > 0 {
							languages = existingRepo.Languages
						}
					} else {
						total := 0
						for _, b := range langBytes {
							total += b
						}
						languages = make(map[string]float64)
						if total > 0 {
							for lang, b := range langBytes {
								languages[lang] = float64(b) * 100 / float64(total)
							}
						}
						log.Printf("%s: Successfully fetched language data: %v", repoLog, languages)
					}
				}
			}
			modelRepo := models.Repository{
				Name:        repo.Name,
				FullName:    repo.FullName,
				Description: repo.Description,
				URL:         repo.URL,
				HTMLURL:     repo.HTMLURL,
				Owner:       repo.Owner.Login,
				GitHubID:    repo.ID,
				Private:     repo.Private,
				Status:      "active",
				UserID:      userID,
				Languages:   languages,
				LastFetched: now,
				CreatedAt:   existingRepo.CreatedAt,
				UpdatedAt:   now,
			}
			if err == nil {
				modelRepo.ID = existingRepo.ID
				if existingRepo.CreatedAt.IsZero() {
					modelRepo.CreatedAt = now
				}
				log.Printf("%s: Updating existing repository record (ID: %s)", repoLog, existingRepo.ID.Hex())
			} else {
				modelRepo.ID = primitive.NewObjectID()
				modelRepo.CreatedAt = now
				log.Printf("%s: Creating new repository record", repoLog)
			}
			if err := saveRepositoryToDB(userID, modelRepo, languages); err != nil {
				mu.Lock()
				errorCount++
				mu.Unlock()
				log.Printf("%s: Failed to save repository: %v", repoLog, err)
			} else {
				mu.Lock()
				successCount++
				mu.Unlock()
				log.Printf("%s: Successfully saved repository to database", repoLog)
			}
			mu.Lock()
			reposWithLang = append(reposWithLang, RepoWithLang{
				Repository: modelRepo,
				Languages:  languages,
			})
			mu.Unlock()
		}(idx, repo)
	}
	wg.Wait()
	log.Printf("Finished processing repositories for user %s - Success: %d, Error: %d", userID.Hex(), successCount, errorCount)
}

// Helper Functions for Repository Branches

// parseGitHubURL extracts owner and repository name from GitHub URL
func parseGitHubURL(repoURL string) (owner, repo string, err error) {
	// Handle both https://github.com/owner/repo and git@github.com:owner/repo.git formats
	repoURL = strings.TrimSuffix(repoURL, ".git")

	if strings.Contains(repoURL, "github.com/") {
		parts := strings.Split(repoURL, "github.com/")
		if len(parts) != 2 {
			return "", "", fmt.Errorf("invalid GitHub URL format")
		}

		pathParts := strings.Split(parts[1], "/")
		if len(pathParts) < 2 {
			return "", "", fmt.Errorf("invalid GitHub URL format")
		}

		return pathParts[0], pathParts[1], nil
	}

	return "", "", fmt.Errorf("not a GitHub URL")
}

// extractGitHubToken gets the GitHub token from user context
func extractGitHubToken(c *gin.Context) (string, error) {
	userIDStr, exists := c.Get("userID")
	if !exists {
		return "", fmt.Errorf("user not authenticated")
	}

	userID, err := primitive.ObjectIDFromHex(userIDStr.(string))
	if err != nil {
		return "", fmt.Errorf("invalid user ID format")
	}

	// Get user from database to retrieve GitHub token
	collection := config.GetCollection("users")
	var user models.User
	if err := collection.FindOne(context.Background(), bson.M{"_id": userID}).Decode(&user); err != nil {
		return "", fmt.Errorf("failed to get user information")
	}

	if user.AccessToken == "" {
		return "", fmt.Errorf("GitHub token not found")
	}

	return user.AccessToken, nil
}

// getRepositoryInfo fetches repository information from GitHub API
func getRepositoryInfo(owner, repo, token string) (*GitHubRepository, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s", owner, repo)

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "YourAppName")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("repository not found or access denied")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var repoInfo GitHubRepository
	if err := json.NewDecoder(resp.Body).Decode(&repoInfo); err != nil {
		return nil, err
	}

	return &repoInfo, nil
}

// getRepositoryBranches fetches all branches from GitHub API
func getRepositoryBranches(owner, repo, token string) ([]GitHubBranch, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/branches", owner, repo)

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "YourAppName")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("repository not found or access denied")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var branches []GitHubBranch
	if err := json.NewDecoder(resp.Body).Decode(&branches); err != nil {
		return nil, err
	}

	return branches, nil

}
