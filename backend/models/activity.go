package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// UserActivity represents a single activity record
type UserActivity struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id,omitempty"`
	UserID    primitive.ObjectID `bson:"user_id" json:"user_id"`
	Type      string             `bson:"type" json:"type"`           // e.g., "commit", "test", "pull_request"
	Count     int                `bson:"count" json:"count"`         // Number of actions for that day
	RepoName  string             `bson:"repo_name" json:"repo_name"` // Related repository name
	Date      time.Time          `bson:"date" json:"date"`           // The date of activity
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
}

// ActivitySummary represents aggregated activity data for the UI
type ActivitySummary struct {
	DailyActivities []DailyActivity `json:"dailyActivities"`
	TotalCount      int             `json:"totalCount"`
	MaxCount        int             `json:"maxCount"`
	RepoBreakdown   []RepoActivity  `json:"repoBreakdown"`
	RecentActivity  []Activity      `json:"recentActivity"`
}

// GitHubContributionResponse represents the response from GitHub Contributions API
type GitHubContributionResponse struct {
	Total         TotalContributions `json:"total"`
	Contributions []DailyActivity    `json:"contributions"`
}

// TotalContributions represents the total count of contributions
type TotalContributions struct {
	LastYear int `json:"lastYear"`
}

type DailyActivity struct {
	Date  string `json:"date"`  // Format: "YYYY-MM-DD"
	Count int    `json:"count"` // Activity count for the day
	Level int    `json:"level"` 
}

// RepoActivity represents activity breakdown by repository
type RepoActivity struct {
	RepoName string `json:"repoName"`
	Count    int    `json:"count"`
}

// Activity represents a single activity item for display
type Activity struct {
	ID        string             `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"user_id" json:"user_id,omitempty"`
	Type      string             `bson:"type" json:"type"`
	RepoName  string             `bson:"repo_name" json:"repoName"`
	Message   string             `bson:"message" json:"message"`
	Timestamp time.Time          `bson:"timestamp" json:"timestamp"`
}
