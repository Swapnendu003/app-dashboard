package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Repository struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id,omitempty"`
	Name            string             `bson:"name" json:"name"`
	FullName        string             `bson:"full_name" json:"full_name"`
	Description     string             `bson:"description" json:"description"`
	URL             string             `bson:"url" json:"url"`
	HTMLURL         string             `bson:"html_url" json:"html_url"`
	Owner           string             `bson:"owner" json:"owner"`
	GitHubID        int64              `bson:"github_id" json:"github_id"`
	Private         bool               `bson:"private" json:"private"`
	Status          string             `bson:"status" json:"status"`
	UserID          primitive.ObjectID `bson:"user_id,omitempty" json:"user_id,omitempty"`
	Languages       map[string]float64 `bson:"languages" json:"languages"`
	LastFetched     time.Time          `bson:"last_fetched" json:"last_fetched"`
	CreatedAt       time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt       time.Time          `bson:"updated_at" json:"updated_at"`
	// Coverage        float64            `bson:"coverage" json:"coverage"`
	LastCoverageAt  time.Time          `bson:"last_coverage_at" json:"last_coverage_at"`
	BranchCoverage  map[string]float64 `bson:"branch_coverage,omitempty" json:"branch_coverage,omitempty"`
	OverallCoverage float64            `bson:"overall_coverage" json:"overall_coverage"`
	CoverageStatus  bool               `bson:"coverage_status" json:"coverage_status"`
}

type GitHubRepository struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	FullName    string `json:"full_name"`
	Description string `json:"description"`
	URL         string `json:"url"`
	HTMLURL     string `json:"html_url"`
	Private     bool   `json:"private"`
	Owner       struct {
		Login string `json:"login"`
	} `json:"owner"`
}

type RepositoryResponse struct {
	Repositories []Repository `json:"repositories"`
}
