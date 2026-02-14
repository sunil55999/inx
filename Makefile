.PHONY: help install start stop restart logs clean test migrate-up migrate-down migrate-create

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies for backend and frontend
	@echo "Installing backend dependencies..."
	cd backend && npm install
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "✓ Dependencies installed"

start: ## Start all services with Docker Compose
	@echo "Starting services..."
	docker-compose up -d
	@echo "✓ Services started"
	@echo "Backend: http://localhost:3000"
	@echo "Frontend: http://localhost:3001"
	@echo "PostgreSQL: localhost:5432"
	@echo "Redis: localhost:6379"

stop: ## Stop all services
	@echo "Stopping services..."
	docker-compose down
	@echo "✓ Services stopped"

restart: stop start ## Restart all services

logs: ## Show logs from all services
	docker-compose logs -f

logs-backend: ## Show backend logs
	docker-compose logs -f backend

logs-frontend: ## Show frontend logs
	docker-compose logs -f frontend

logs-db: ## Show database logs
	docker-compose logs -f postgres

clean: ## Remove all containers, volumes, and build artifacts
	@echo "Cleaning up..."
	docker-compose down -v
	rm -rf backend/node_modules backend/dist
	rm -rf frontend/node_modules frontend/build
	@echo "✓ Cleanup complete"

test: ## Run tests
	@echo "Running backend tests..."
	cd backend && npm test
	@echo "Running frontend tests..."
	cd frontend && npm test

test-backend: ## Run backend tests only
	cd backend && npm test

test-frontend: ## Run frontend tests only
	cd frontend && npm test

migrate-up: ## Run database migrations
	@echo "Running migrations..."
	cd backend && npm run migrate:latest
	@echo "✓ Migrations complete"

migrate-down: ## Rollback last migration
	@echo "Rolling back migration..."
	cd backend && npm run migrate:rollback
	@echo "✓ Rollback complete"

migrate-create: ## Create a new migration (usage: make migrate-create name=migration_name)
	@if [ -z "$(name)" ]; then \
		echo "Error: Please provide a migration name"; \
		echo "Usage: make migrate-create name=migration_name"; \
		exit 1; \
	fi
	cd backend && npm run migrate:make $(name)

dev-backend: ## Start backend in development mode
	cd backend && npm run dev

dev-frontend: ## Start frontend in development mode
	cd frontend && npm start

build-backend: ## Build backend for production
	cd backend && npm run build

build-frontend: ## Build frontend for production
	cd frontend && npm run build

db-shell: ## Open PostgreSQL shell
	docker-compose exec postgres psql -U postgres -d telegram_signals_marketplace

redis-cli: ## Open Redis CLI
	docker-compose exec redis redis-cli

pgadmin: ## Start pgAdmin for database management
	docker-compose --profile tools up -d pgadmin
	@echo "✓ pgAdmin started at http://localhost:5050"
	@echo "Email: admin@admin.com"
	@echo "Password: admin"
