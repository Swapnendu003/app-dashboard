package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/backend/config"
	"github.com/yourusername/backend/models"
	"github.com/yourusername/backend/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

func GitHubSignUp(c *gin.Context) {
	var authRequest models.GitHubAuthRequest
	if err := c.ShouldBindJSON(&authRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tokenResponse, err := exchangeCodeForToken(authRequest.Code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to exchange code for token: " + err.Error()})
		return
	}

	githubUser, err := getGitHubUser(tokenResponse.AccessToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get GitHub user: " + err.Error()})
		return
	}

	collection := config.GetCollection("users")
	var existingUser models.User

	err = collection.FindOne(context.Background(), bson.M{"github_id": githubUser.ID}).Decode(&existingUser)
	if err != nil && err != mongo.ErrNoDocuments {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error: " + err.Error()})
		return
	}

	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "User already exists. Please sign in instead."})
		return
	}

	now := time.Now()
	newUser := models.User{
		ID:           primitive.NewObjectID(),
		GitHubID:     githubUser.ID,
		Username:     githubUser.Login,
		Email:        githubUser.Email,
		Name:         githubUser.Name,
		AvatarURL:    githubUser.AvatarURL,
		AccessToken:  tokenResponse.AccessToken,
		RefreshToken: tokenResponse.RefreshToken,
		CreatedAt:    now,
		UpdatedAt:    now,
		IsWelcomed:   false,
	}

	_, err = collection.InsertOne(context.Background(), newUser)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user: " + err.Error()})
		return
	}

	token, err := utils.GenerateToken(newUser.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token: " + err.Error()})
		return
	}

	newUser.AccessToken = ""
	newUser.RefreshToken = ""

	c.JSON(http.StatusCreated, models.AuthResponse{
		Token: token,
		User:  newUser,
	})
}

func GitHubSignIn(c *gin.Context) {
	var authRequest models.GitHubAuthRequest
	if err := c.ShouldBindJSON(&authRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tokenResponse, err := exchangeCodeForToken(authRequest.Code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to exchange code for token: " + err.Error()})
		return
	}
	githubUser, err := getGitHubUser(tokenResponse.AccessToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get GitHub user: " + err.Error()})
		return
	}

	collection := config.GetCollection("users")
	var user models.User

	err = collection.FindOne(context.Background(), bson.M{"github_id": githubUser.ID}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found. Please sign up instead."})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error: " + err.Error()})
		}
		return
	}
	_, err = collection.UpdateOne(
		context.Background(),
		bson.M{"_id": user.ID},
		bson.M{
			"$set": bson.M{
				"access_token":  tokenResponse.AccessToken,
				"refresh_token": tokenResponse.RefreshToken,
				"updated_at":    time.Now(),
			},
		},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user: " + err.Error()})
		return
	}

	token, err := utils.GenerateToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token: " + err.Error()})
		return
	}

	user.AccessToken = ""
	user.RefreshToken = ""

	c.JSON(http.StatusOK, models.AuthResponse{
		Token: token,
		User:  user,
	})
}

func exchangeCodeForToken(code string) (*models.GitHubTokenResponse, error) {
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	clientSecret := os.Getenv("GITHUB_CLIENT_SECRET")

	if clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set in environment variables")
	}

	requestBody, err := json.Marshal(map[string]string{
		"client_id":     clientID,
		"client_secret": clientSecret,
		"code":          code,
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub OAuth endpoint returned status code %d: %s", resp.StatusCode, string(body))
	}

	var tokenResponse models.GitHubTokenResponse
	if err := json.Unmarshal(body, &tokenResponse); err != nil {
		return nil, err
	}

	if tokenResponse.AccessToken == "" {
		return nil, fmt.Errorf("GitHub OAuth endpoint did not return an access token")
	}

	return &tokenResponse, nil
}

func getGitHubUser(accessToken string) (*models.GitHubUser, error) {
	req, err := http.NewRequest("GET", "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "token "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("GitHub API returned status code %d: %s", resp.StatusCode, string(body))
		return nil, fmt.Errorf("GitHub API returned status code %d", resp.StatusCode)
	}

	var user models.GitHubUser
	if err := json.Unmarshal(body, &user); err != nil {
		return nil, err
	}

	if user.Email == "" {
		email, err := getGitHubUserEmails(accessToken)
		if err != nil {
			log.Printf("Warning: Could not fetch user email: %v", err)
		} else if email != "" {
			user.Email = email
		}
	}

	return &user, nil
}

func getGitHubUserEmails(accessToken string) (string, error) {
	req, err := http.NewRequest("GET", "https://api.github.com/user/emails", nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "token "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("GitHub API (emails) returned status code %d: %s", resp.StatusCode, string(body))
		return "", fmt.Errorf("GitHub API returned status code %d", resp.StatusCode)
	}

	type GitHubEmail struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}

	var emails []GitHubEmail
	if err := json.Unmarshal(body, &emails); err != nil {
		return "", err
	}

	for _, email := range emails {
		if email.Primary && email.Verified {
			return email.Email, nil
		}
	}

	for _, email := range emails {
		if email.Verified {
			return email.Email, nil
		}
	}

	if len(emails) > 0 {
		return emails[0].Email, nil
	}

	return "", fmt.Errorf("no email found for user")
}
