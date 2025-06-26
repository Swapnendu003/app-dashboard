package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// CoverageHistory represents a historical record of coverage scans
type CoverageHistory struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Repository    string             `bson:"repository" json:"repository"`
	Branch        string             `bson:"branch" json:"branch"`
	TotalCoverage float64            `bson:"total_coverage" json:"total_coverage"`
	Files         []FileCoverage     `bson:"files" json:"files"`
	Timestamp     time.Time          `bson:"timestamp" json:"timestamp"`
	CommitHash    string             `bson:"commit_hash,omitempty" json:"commit_hash,omitempty"`
}

// FileCoverage represents coverage data for a single file
type FileCoverage struct {
	File     string  `bson:"file" json:"file"`
	Coverage float64 `bson:"coverage" json:"coverage"`
}
