import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';

// Pages
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { MerchantDashboard } from './pages/merchant/MerchantDashboard';

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/listings/:id" element={<ListingDetailPage />} />

      {/* Protected routes */}
      <Route
        path="/orders/:id"
        element={
          <ProtectedRoute>
            <OrderDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subscriptions"
        element={
          <ProtectedRoute>
            <SubscriptionsPage />
          </ProtectedRoute>
        }
      />

      {/* Merchant routes */}
      <Route
        path="/merchant/dashboard"
        element={
          <ProtectedRoute requireMerchant>
            <MerchantDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
