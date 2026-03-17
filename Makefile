.PHONY: up down build-all restart clean-all up-dev down-dev
# .PHONY explicitly tells make that the listed targets (up, down, build-all, etc.) are not real files. They are simply names for commands that you want to execute.
# Default target for 'make'
default: up

up:
	@echo "Starting the entire application with Docker Compose in detached mode..."
	docker compose up --build -d

up-dev:
	@echo "Starting the application in development mode with hot reload..."
	docker compose -f docker-compose.dev.yml up --build -d


down-dev:
	@echo "Stopping the development environment..."
	docker compose -f docker-compose.dev.yml down

down:
	@echo "Stopping and removing the entire application..."
	docker compose down

build-all:
	@echo "Building all services with Docker Compose..."
	docker compose build

restart:
	@echo "Restarting the entire application..."
	docker compose restart

# Individual service shortcuts for Docker Compose (optional but convenient)
up-backend:
	@echo "Starting only the backend service via Docker Compose..."
	docker compose up -d backend

up-frontend:
	@echo "Starting only the frontend service via Docker Compose..."
	docker compose up -d frontend