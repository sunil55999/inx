# Telegram Signals Marketplace

A multi-vendor cryptocurrency-based platform that connects signal channel merchants with buyers. The system automates subscription management through Telegram Bot API integration, processes cryptocurrency payments across multiple blockchains, and implements an escrow system to protect both buyers and merchants.

## Features

- **Multi-Vendor Marketplace**: Merchants can list and sell subscriptions to their Telegram signal channels
- **Cryptocurrency Payments**: Support for BNB, USDT (BEP-20), USDC (BEP-20), Bitcoin, and USDT (TRC-20)
- **Automated Access Control**: Telegram bot automatically manages user access to channels
- **Escrow System**: Buyer protection with pro-rated refunds
- **WebAuthn Authentication**: Secure biometric authentication
- **Merchant Storefronts**: Unique URLs for each merchant
- **Search & Discovery**: Full-text search with filters
- **Dispute Resolution**: Admin-managed dispute system

## Tech Stack

### Backend
- **Runtime**: Node.js 20 with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **ORM**: Knex.js
- **Authentication**: WebAuthn (FIDO2) + JWT
- **Testing**: Jest

### Frontend
- **Framework**: React 18 with TypeScript
- **UI Library**: Material-UI (MUI)
- **State Management**: Zustand
- **Data Fetching**: React Query
- **Routing**: React Router v6

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Cloud**: AWS (ECS, Aurora, ElastiCache, KMS, SQS)
- **CI/CD**: GitHub Actions

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (if running locally)
- Redis 7 (if running locally)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd telegram-signals-marketplace
   ```

2. **Set up environment variables**
   ```bash
   # Backend
   cp backend/.env.example backend/.env
   # Edit backend/.env with your configuration
   
   # Frontend
   cp frontend/.env.example frontend/.env
   # Edit frontend/.env with your configuration
   ```

3. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

   This will start:
   - PostgreSQL on port 5432
   - Redis on port 6379
   - Backend API on port 3000
   - Frontend on port 3001

4. **Run database migrations**
   ```bash
   cd backend
   npm run migrate:latest
   ```

5. **Access the application**
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:3000
   - API Health Check: http://localhost:3000/health

### Development Setup (Without Docker)

1. **Install dependencies**
   ```bash
   # Backend
   cd backend
   npm install
   
   # Frontend
   cd ../frontend
   npm install
   ```

2. **Start PostgreSQL and Redis**
   ```bash
   # Using Docker
   docker-compose up -d postgres redis
   
   # Or install locally
   ```

3. **Run migrations**
   ```bash
   cd backend
   npm run migrate:latest
   ```

4. **Start development servers**
   ```bash
   # Backend (in backend directory)
   npm run dev
   
   # Frontend (in frontend directory)
   npm start
   ```

## Project Structure

```
telegram-signals-marketplace/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration files
│   │   ├── database/        # Database migrations and connection
│   │   ├── services/        # Business logic services
│   │   ├── routes/          # API routes
│   │   ├── middleware/      # Express middleware
│   │   ├── models/          # Data models and types
│   │   ├── utils/           # Utility functions
│   │   ├── test/            # Test setup and helpers
│   │   ├── app.ts           # Express app setup
│   │   └── index.ts         # Entry point
│   ├── package.json
│   ├── tsconfig.json
│   ├── knexfile.ts
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # Custom hooks
│   │   ├── services/        # API services
│   │   ├── store/           # State management
│   │   ├── types/           # TypeScript types
│   │   ├── utils/           # Utility functions
│   │   ├── theme.ts         # MUI theme configuration
│   │   ├── App.tsx          # Main app component
│   │   └── index.tsx        # Entry point
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Database Schema

The application uses PostgreSQL with the following main tables:

- **users**: User accounts (buyers, merchants, admins)
- **webauthn_credentials**: WebAuthn credentials for authentication
- **merchants**: Merchant profiles and storefronts
- **channels**: Telegram channels/groups
- **listings**: Channel subscription listings
- **orders**: Purchase orders
- **subscriptions**: Active subscriptions
- **escrow_ledger**: Escrow transactions
- **merchant_balances**: Merchant balance tracking
- **payouts**: Merchant withdrawal requests
- **disputes**: Buyer disputes and refund requests
- **transactions**: Blockchain transaction records
- **notifications**: User notifications
- **audit_logs**: System audit trail

## API Documentation

API documentation will be available at `/api/docs` once implemented.

## Testing

```bash
# Backend tests
cd backend
npm test

# Run tests with coverage
npm run test:coverage

# Frontend tests
cd frontend
npm test
```

## Deployment

### Production Build

```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

### Docker Production Build

```bash
# Build production images
docker build -f backend/Dockerfile.prod -t telegram-signals-backend:latest ./backend
docker build -f frontend/Dockerfile.prod -t telegram-signals-frontend:latest ./frontend
```

## Environment Variables

### Backend

See `backend/.env.example` for all available environment variables.

Key variables:
- `NODE_ENV`: Environment (development/staging/production)
- `DB_*`: Database connection settings
- `REDIS_*`: Redis connection settings
- `JWT_SECRET`: JWT signing secret
- `TELEGRAM_BOT_TOKEN`: Telegram bot API token
- `AWS_*`: AWS service configuration

### Frontend

See `frontend/.env.example` for all available environment variables.

Key variables:
- `REACT_APP_API_URL`: Backend API URL
- `REACT_APP_WEBAUTHN_*`: WebAuthn configuration

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For support, email support@yourdomain.com or open an issue in the repository.
