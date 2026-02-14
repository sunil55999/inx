import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Grid,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { TrendingUp, Store as StoreIcon, AccessTime } from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'react-query';
import { listingService } from '../services/listingService';
import { orderService } from '../services/orderService';
import { Layout } from '../components/Layout/Layout';
import { useAuthStore } from '../store/authStore';
import { CryptoCurrency } from '../types';

export const ListingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<CryptoCurrency>('USDT_BEP20');

  const { data: listing, isLoading, error } = useQuery(
    ['listing', id],
    () => listingService.getListing(id!),
    { enabled: !!id }
  );

  const createOrderMutation = useMutation(
    () => orderService.createOrder({
      listingId: id!,
      cryptoCurrency: selectedCurrency,
    }),
    {
      onSuccess: (order) => {
        navigate(`/orders/${order.id}`);
      },
    }
  );

  const handleSubscribe = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setOrderDialogOpen(true);
  };

  const handleConfirmOrder = () => {
    createOrderMutation.mutate();
  };

  if (isLoading) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  if (error || !listing) {
    return (
      <Layout>
        <Alert severity="error">Failed to load listing</Alert>
      </Layout>
    );
  }

  return (
    <Layout maxWidth="md">
      <Card>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <TrendingUp sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
            <Box>
              <Typography variant="h4" component="h1" gutterBottom>
                {listing.title}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={listing.signalType} color="primary" size="small" />
                <Chip
                  label={listing.isActive ? 'Active' : 'Inactive'}
                  color={listing.isActive ? 'success' : 'default'}
                  size="small"
                />
              </Box>
            </Box>
          </Box>

          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Typography variant="h3" color="primary.main" fontWeight={600}>
                ${listing.priceUsd}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                One-time payment
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <AccessTime sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="h6">{listing.durationDays} Days</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Subscription duration
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Description
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            {listing.description}
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Channel Information
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Channel:</strong> {listing.channelName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Username:</strong> @{listing.channelUsername}
          </Typography>

          {listing.merchant && (
            <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => navigate(`/store/${listing.merchant?.username}`)}
              >
                <StoreIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Box>
                  <Typography variant="subtitle1">
                    {listing.merchant.displayName || listing.merchant.username}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    View merchant storefront
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}

          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleSubscribe}
            disabled={!listing.isActive}
            sx={{ mt: 4 }}
          >
            {listing.isActive ? 'Subscribe Now' : 'Not Available'}
          </Button>
        </CardContent>
      </Card>

      {/* Order Dialog */}
      <Dialog open={orderDialogOpen} onClose={() => setOrderDialogOpen(false)}>
        <DialogTitle>Select Payment Currency</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Cryptocurrency</InputLabel>
            <Select
              value={selectedCurrency}
              label="Cryptocurrency"
              onChange={(e) => setSelectedCurrency(e.target.value as CryptoCurrency)}
            >
              <MenuItem value="BNB">BNB (BNB Chain)</MenuItem>
              <MenuItem value="BTC">Bitcoin (BTC)</MenuItem>
              <MenuItem value="USDT_BEP20">USDT (BEP20)</MenuItem>
              <MenuItem value="USDC_BEP20">USDC (BEP20)</MenuItem>
              <MenuItem value="USDT_TRC20">USDT (TRC20)</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOrderDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleConfirmOrder}
            disabled={createOrderMutation.isLoading}
          >
            {createOrderMutation.isLoading ? 'Creating...' : 'Create Order'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};
