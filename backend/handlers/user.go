package handlers


import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/backend/config"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)


func GetUserProfile(c *gin.Context) {
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
	collection := config.GetCollection("users")
	var user map[string]interface{}

	err = collection.FindOne(context.Background(), bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user profile"})
		return
	}
	delete(user, "access_token")
	delete(user, "refresh_token")

	c.JSON(http.StatusOK, gin.H{"user": user})
}

func MarkUserWelcomed(c *gin.Context) {
	userIDStr, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID, err := primitive.ObjectIDFromHex(userIDStr.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID format"})
		return
	}

	collection := config.GetCollection("users")
	filter := bson.M{
		"_id":          userID,
		"is_welcomed": bson.M{"$ne": true},
	}
	update := bson.M{
		"$set": bson.M{
			"is_welcomed": true,
			"updated_at":  time.Now(),
		},
	}

	opts := options.FindOneAndUpdate().
		SetReturnDocument(options.After) // return the updated doc

	var updated map[string]interface{}
	err = collection.FindOneAndUpdate(context.Background(), filter, update, opts).Decode(&updated)
	if err != nil {
		var current map[string]interface{}
		if err2 := collection.FindOne(context.Background(), bson.M{"_id": userID}).Decode(&current); err2 != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user welcome status"})
			return
		}
		delete(current, "access_token")
		delete(current, "refresh_token")
		c.JSON(http.StatusOK, gin.H{
			"message": "Already welcomed",
			"user":    current,
		})
		return
	}

	delete(updated, "access_token")
	delete(updated, "refresh_token")

	c.JSON(http.StatusOK, gin.H{
		"message": "Welcome status updated",
		"user":    updated,
	})
}