FROM golang:1.24-alpine AS builder

WORKDIR /app
RUN apk add --no-cache git ca-certificates build-base
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/backend main.go

FROM alpine:3.20
WORKDIR /app

# Add essential packages and ensure Go is properly installed
RUN apk add --no-cache \
    go \
    git \
    ca-certificates \
    tzdata \
    build-base \
    && cp /usr/share/zoneinfo/UTC /etc/localtime \
    && echo "UTC" > /etc/timezone \
    && go version # Verify Go installation

# Update Go environment variables
ENV GOPATH=/home/app/go
ENV PATH=/usr/local/go/bin:$PATH:/usr/lib/go/bin:/home/app/go/bin
ENV GOTOOLCHAIN=auto
ENV GO111MODULE=on
ENV CGO_ENABLED=0

# Create non-root user and set up directories
RUN adduser -D -H -s /sbin/nologin app \
    && mkdir -p /home/app/go /tmp \
    && chown -R app:app /app /home/app /tmp

USER app

COPY --from=builder /out/backend /app/backend
COPY .env .env

# Verify Go installation as user app
RUN go version

EXPOSE 8080
ENV GIN_MODE=release

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["./backend"]
