package config

import (
	"context"
	"log"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	DB     *mongo.Database
	client *mongo.Client
)

func ConnectDB() (*mongo.Database, error) {
	// Return the existing DB if already connected
	if DB != nil {
		return DB, nil
	}

	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://localhost:27017"
		log.Println("Using default MongoDB URI:", mongoURI)
	}

	clientOptions := options.Client().ApplyURI(mongoURI)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	client, err = mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, err
	}

	err = client.Ping(ctx, nil)
	if err != nil {
		return nil, err
	}

	log.Println("Connected to MongoDB")

	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "authDB"
	}
	DB = client.Database(dbName)

	return DB, nil
}

func GetCollection(collectionName string) *mongo.Collection {
	return DB.Collection(collectionName)
}
