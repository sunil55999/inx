# Quick Start Guide

This guide will help you get the Telegram Signals Marketplace up and running in minutes.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (optional, for local development)
- Git

## Option 1: Automated Setup (Recommended)

Run the setup script:

```bash
chmod +x setup.sh
./setup.sh
```

This will:
1. Check prerequisites
2. Create environment files
3. Start PostgreSQL and Redis
4. Install dependencies
5. Run database migrations

Then start the application:

```bash
make start
```

## Option 2: Manual Setup

### 1. Clone and Configure

```bash
# Clone the repository
git clone <repository-url>
cd telegram-signals-marketplace

# Create environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Edit the .env files with your configuration
```

### 2. Start Services

```bash
# Start all services with Docker Compose
docker-compose up -d

# Wait for services to be ready (about 10 seconds)
```

### 3. Run Migrations

```bash
cd backend
npm install
npm run migrate:latest
```

### 4. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

## Verify Installation

1. **Check Backend Health**
   ```bash
   curl http://localhost:3000/health
   ```
   
   Expected response:
   ```json
   {
     "status": "ok",
     "timestamp": "2024-01-15T10:00:00.000Z",
     "uptime": 5.123
   }
   ```

2. **Access Frontend**
   
   Open http://localhost:3001 in your browser

3. **Check Database**
   ```bash
   make db-shell
   # Then run: \dt
   # You should see all the tables listed
   ```

## Common Commands

```bash
# Start all services
make start

# Stop all services
make stop

# View logs
make logs

# Run tests
make test

# Run migrations
make migrate-up

# Access database shell
make db-shell

# Access Redis CLI
make redis-cli
```

## Development Workflow

### Backend Development

```bash
# Start backend in development mode (with hot reload)
cd backend
npm run dev
```

### Frontend Development

```bash
# Start frontend in development mode (with hot reload)
cd frontend
npm start
```

### Running Tests

```bash
# Run all tests
make test

# Run backend tests only
make test-backend

# Run frontend tests only
make test-frontend

# Run tests with coverage
cd backend && npm run test:coverage
```

## Troubleshooting

### Port Already in Use

If you get port conflicts:

```bash
# Check what's using the port
lsof -i :3000  # Backend
lsof -i :3001  # Frontend
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Kill the process or change ports in .env files
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View PostgreSQL logs
make logs-db

# Restart PostgreSQL
docker-compose restart postgres
```

### Redis Connection Issues

```bash
# Check if Redis is running
docker-compose ps redis

# Test Redis connection
docker-compose exec redis redis-cli ping

# Restart Redis
docker-compose restart redis
```

### Migration Issues

```bash
# Check migration status
cd backend
npx knex migrate:status

# Rollback last migration
npm run migrate:rollback

# Run migrations again
npm run migrate:latest
```

### Clean Start

If you want to start fresh:

```bash
# Stop and remove all containers and volumes
make clean

# Run setup again
./setup.sh
```

## Next Steps

1. **Configure Telegram Bot**
   - Create a bot via @BotFather on Telegram
   - Add the bot token to `backend/.env`

2. **Configure Blockchain Connections**
   - Add RPC URLs for BNB Chain, Bitcoin, and TRON
   - Add API keys for blockchain explorers

3. **Set up AWS Services** (for production)
   - Configure AWS KMS for key management
   - Set up SQS queues
   - Configure SES for emails

4. **Implement Features**
   - Follow the task list in `.kiro/specs/telegram-signals-marketplace/tasks.md`
   - Start with Task 2: Data models and validation

## Getting Help

- Check the main [README.md](README.md) for detailed documentation
- Review the [design document](.kiro/specs/telegram-signals-marketplace/design.md)
- Check the [requirements](.kiro/specs/telegram-signals-marketplace/requirements.md)

## Useful Resources

- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [Material-UI Documentation](https://mui.com/)
- [Knex.js Documentation](https://knexjs.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/docs/)
