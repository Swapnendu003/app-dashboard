# Build stage
FROM golang:1.24.4-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o backend main.go

# Final stage
FROM alpine:latest

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/backend .

# Copy .env if needed (optional, comment out if not using)
COPY .env .env

# Expose port (default 8080, change if your app uses a different port)
EXPOSE 8080

# Set environment variable for production
ENV GIN_MODE=release

CMD ["./backend"]
