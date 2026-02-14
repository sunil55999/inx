import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Add, TrendingUp, AccountBalance } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { listingService } from '../../services/listingService';
import { merchantService } from '../../services/merchantService';
import { Layout } from '../../components/Layout/Layout';

export const MerchantDashboard: React.FC = () => {
  const navigate = useNavigate();

  const { data: listings, isLoading: listingsLoading } = useQuery(
    'merchantListings',
    listingService.getMerchantListings
  );

  const { data: balances, isLoading: balancesLoading } = useQuery(
    'merchantBalance',
    merchantService.getBalance
  );

  const totalAvailable = balances?.reduce((sum, b) => sum + b.availableBalance, 0) || 0;
  const totalPending = balances?.reduce((sum, b) => sum + b.pendingBalance, 0) || 0;

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4">Merchant Dashboard</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/merchant/listings/create')}
        >
          Create Listing
        </Button>
      </Box>

      {/* Balance Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <AccountBalance sx={{ mr: 1, color: 'success.main' }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Available Balance
                </Typography>
              </Box>
              {balancesLoading ? (
                <CircularProgress size={24} />
              ) : (
                <Typography variant="h4" color="success.main">
                  ${totalAvailable.toFixed(2)}
                </Typography>
              )}
              <Button
                variant="outlined"
                size="small"
                sx={{ mt: 2 }}
                onClick={() => navigate('/merchant/payouts')}
              >
                Request Payout
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TrendingUp sx={{ mr: 1, color: 'warning.main' }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Pending Balance
                </Typography>
              </Box>
              {balancesLoading ? (
                <CircularProgress size={24} />
              ) : (
                <Typography variant="h4" color="warning.main">
                  ${totalPending.toFixed(2)}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Released when subscriptions complete
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Listings */}
      <Typography variant="h5" gutterBottom>
        My Listings
      </Typography>

      {listingsLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {listings && listings.length === 0 && (
        <Alert severity="info">
          You haven't created any listings yet. Click "Create Listing" to get started.
        </Alert>
      )}

      <Grid container spacing={3}>
        {listings?.map((listing) => (
          <Grid item xs={12} md={6} key={listing.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                  <Typography variant="h6">{listing.title}</Typography>
                  <Chip
                    label={listing.isActive ? 'Active' : 'Inactive'}
                    color={listing.isActive ? 'success' : 'default'}
                    size="small"
                  />
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {listing.description.substring(0, 100)}...
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <Chip label={listing.signalType} size="small" variant="outlined" />
                  <Chip label={`$${listing.priceUsd}`} size="small" color="primary" />
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => navigate(`/merchant/listings/${listing.id}/edit`)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => navigate(`/listings/${listing.id}`)}
                  >
                    View
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Layout>
  );
};
