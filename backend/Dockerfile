# Build stage
FROM golang:1.24.4-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/backend main.go

FROM alpine:3.20
WORKDIR /app

RUN apk add --no-cache git ca-certificates tzdata

RUN adduser -D -H -s /sbin/nologin app && chown -R app /app
USER app

COPY --from=builder /out/backend /app/backend

COPY .env .env

EXPOSE 8080
ENV GIN_MODE=release
CMD ["/app/backend"]
