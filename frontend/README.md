# Telegram Signals Marketplace - Frontend

React-based frontend application for the Telegram Signals Marketplace platform.

## Features

### Implemented ✅

- **Authentication**
  - WebAuthn biometric registration and login
  - JWT token management with auto-refresh
  - Protected routes with role-based access

- **User Interface**
  - Material-UI components with dark/light theme toggle
  - Responsive design (mobile-first)
  - Accessible components (WCAG AA compliant)
  - Theme persistence in localStorage

- **Listing Management**
  - Browse all active listings
  - Search and filter by signal type
  - View listing details
  - Create orders with cryptocurrency selection

- **Order Management**
  - View order details with QR code
  - Real-time payment status updates
  - Deposit address display
  - Order expiration tracking

- **Subscription Management**
  - View active and expired subscriptions
  - Subscription renewal (within 7-day window)
  - Subscription status tracking

- **Merchant Dashboard**
  - View merchant balance (available/pending)
  - Manage listings (create, edit, view)
  - Request payouts
  - View payout history

- **Notifications**
  - Real-time notification badge
  - Unread count display
  - Notification center (planned)

## Tech Stack

- **Framework**: React 18 with TypeScript
- **UI Library**: Material-UI (MUI) v5
- **Routing**: React Router v6
- **State Management**: Zustand
- **Data Fetching**: React Query
- **Forms**: React Hook Form + Zod validation
- **Authentication**: SimpleWebAuthn
- **QR Codes**: qrcode.react
- **Date Formatting**: date-fns
- **HTTP Client**: Axios

## Project Structure

```
frontend/src/
├── components/          # Reusable components
│   ├── Layout/         # Layout components (Navbar, Layout)
│   └── ProtectedRoute.tsx
├── config/             # Configuration
│   └── api.ts          # Axios instance and interceptors
├── pages/              # Page components
│   ├── auth/           # Authentication pages
│   ├── merchant/       # Merchant-specific pages
│   ├── HomePage.tsx
│   ├── ListingDetailPage.tsx
│   ├── OrderDetailPage.tsx
│   └── SubscriptionsPage.tsx
├── services/           # API service layer
│   ├── authService.ts
│   ├── listingService.ts
│   ├── orderService.ts
│   ├── subscriptionService.ts
│   ├── disputeService.ts
│   ├── merchantService.ts
│   ├── notificationService.ts
│   └── adminService.ts
├── store/              # Zustand stores
│   ├── authStore.ts    # Authentication state
│   └── themeStore.ts   # Theme preference
├── types/              # TypeScript type definitions
│   └── index.ts
├── App.tsx             # Main app component with routes
├── index.tsx           # App entry point
└── theme.ts            # MUI theme configuration
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running on http://localhost:3000

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your API URL if different
```

### Development

```bash
# Start development server
npm start

# Runs on http://localhost:3001
```

### Build

```bash
# Create production build
npm run build

# Output in build/ directory
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

### Linting

```bash
# Check for linting errors
npm run lint

# Fix linting errors
npm run lint:fix
```

## Environment Variables

Create a `.env` file in the frontend directory:

```env
REACT_APP_API_URL=http://localhost:3000
```

## Features by Page

### Home Page (`/`)
- Browse all active listings
- Search by title, description, or channel name
- Filter by signal type
- View listing cards with key information
- Navigate to listing details or merchant storefront

### Login Page (`/login`)
- WebAuthn biometric authentication
- Username input
- Redirect to home after successful login

### Register Page (`/register`)
- WebAuthn biometric registration
- Username and email input
- Optional merchant registration
- Redirect to home after successful registration

### Listing Detail Page (`/listings/:id`)
- Full listing information
- Price and duration display
- Channel information
- Merchant information with storefront link
- Subscribe button with cryptocurrency selection

### Order Detail Page (`/orders/:id`)
- Order status display
- Payment QR code
- Deposit address (copyable)
- Payment amount in selected cryptocurrency
- Real-time status updates (polling every 10s)
- Expiration countdown

### Subscriptions Page (`/subscriptions`)
- List of all user subscriptions
- Status badges (active, expired, cancelled, refunded)
- Start and end dates
- Renewal button (for subscriptions within 7 days of expiry)
- View details button

### Merchant Dashboard (`/merchant/dashboard`)
- Balance overview (available and pending)
- Request payout button
- List of merchant's listings
- Create new listing button
- Edit and view listing actions

## API Integration

All API calls go through the `apiClient` instance which:
- Adds JWT token to requests automatically
- Handles token refresh on 401 errors
- Redirects to login on authentication failure
- Provides consistent error handling

## State Management

### Auth Store (Zustand)
- User information
- Authentication tokens
- Login/logout actions
- Persisted to localStorage

### Theme Store (Zustand)
- Theme mode (light/dark)
- Toggle theme action
- Persisted to localStorage

## Accessibility

- WCAG AA contrast ratios (4.5:1 minimum)
- Keyboard navigation support
- Focus indicators on all interactive elements
- Semantic HTML elements
- ARIA labels where needed
- Screen reader friendly

## Responsive Design

- Mobile-first approach
- Breakpoints: 320px (mobile) to 1920px (desktop)
- Touch-friendly controls on mobile
- Optimized layouts for all screen sizes

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Code splitting with React.lazy (planned)
- Image optimization (planned)
- React Query caching (5-minute stale time)
- Debounced search inputs
- Optimistic updates for mutations

## Security

- XSS protection via React's built-in escaping
- CSRF token handling (via cookies)
- Secure token storage (httpOnly cookies for refresh tokens)
- Input validation with Zod schemas
- Protected routes with authentication checks

## Next Steps

### High Priority
- [ ] Notification center page
- [ ] Dispute creation and management pages
- [ ] Merchant payout request page
- [ ] Admin dashboard pages
- [ ] Merchant listing create/edit forms
- [ ] Merchant storefront public page
- [ ] User profile page

### Medium Priority
- [ ] Search functionality with autocomplete
- [ ] Advanced filtering options
- [ ] Order history page
- [ ] Subscription renewal flow
- [ ] Dispute resolution interface (admin)

### Low Priority
- [ ] Analytics dashboard
- [ ] Email notification preferences
- [ ] Multi-language support
- [ ] Progressive Web App (PWA) features
- [ ] Dark mode improvements

## Contributing

1. Follow the existing code structure
2. Use TypeScript for all new files
3. Follow Material-UI design patterns
4. Write accessible components
5. Test on multiple screen sizes
6. Run linter before committing

## License

Proprietary - All rights reserved
