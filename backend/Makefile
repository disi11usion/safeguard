.PHONY: all build run up down

# Default target: build and run the backend container
all: up

# Build the Docker image for the backend
build:
	docker build -t backend-app .

# Run the backend container
run:
	docker run -d --name backend-app -p 8000:8000 backend-app

# Build and run (default)
up: build run

# Stop and remove the backend container
# (ignore errors if container does not exist)
down:
	-docker stop backend-app || true
	-docker rm backend-app || true
