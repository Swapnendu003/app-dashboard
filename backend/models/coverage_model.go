package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type FileCoverage struct {
	File     string  `json:"file" bson:"file"`
	Coverage float64 `json:"coverage" bson:"coverage"`
	Error    string  `json:"error,omitempty" bson:"error,omitempty"` 
}

type CoverageHistory struct {
	ID            primitive.ObjectID `json:"id" bson:"_id"`
	Repository    string             `json:"repository" bson:"repository"`
	Branch        string             `json:"branch" bson:"branch"`
	TotalCoverage float64            `json:"total_coverage" bson:"total_coverage"`
	Files         []FileCoverage     `json:"files" bson:"files"`
	Timestamp     time.Time          `json:"timestamp" bson:"timestamp"`
	CommitHash    string             `json:"commit_hash,omitempty" bson:"commit_hash,omitempty"`
}

