import React from 'react';
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
} from '@mui/material';
import { AccessTime, CheckCircle } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { subscriptionService } from '../services/subscriptionService';
import { Layout } from '../components/Layout/Layout';
import { formatDistanceToNow } from 'date-fns';

export const SubscriptionsPage: React.FC = () => {
  const navigate = useNavigate();

  const { data: subscriptions, isLoading, error } = useQuery(
    'subscriptions',
    subscriptionService.getSubscriptions
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'expired': return 'error';
      case 'cancelled': return 'default';
      case 'refunded': return 'warning';
      default: return 'default';
    }
  };

  const canRenew = (subscription: any) => {
    if (subscription.status !== 'active') return false;
    const daysUntilExpiry = Math.ceil(
      (new Date(subscription.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 7;
  };

  return (
    <Layout>
      <Typography variant="h4" gutterBottom>
        My Subscriptions
      </Typography>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load subscriptions
        </Alert>
      )}

      {subscriptions && subscriptions.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No subscriptions yet
          </Typography>
          <Button variant="contained" onClick={() => navigate('/')}>
            Browse Listings
          </Button>
        </Box>
      )}

      <Grid container spacing={3}>
        {subscriptions?.map((subscription) => (
          <Grid item xs={12} md={6} key={subscription.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                  <Typography variant="h6">
                    {subscription.listing?.title || 'Unknown Listing'}
                  </Typography>
                  <Chip
                    label={subscription.status}
                    color={getStatusColor(subscription.status)}
                    size="small"
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <CheckCircle sx={{ fontSize: 16, mr: 0.5, color: 'success.main' }} />
                  <Typography variant="body2" color="text.secondary">
                    Started {formatDistanceToNow(new Date(subscription.startDate), { addSuffix: true })}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <AccessTime sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {subscription.status === 'active'
                      ? `Expires ${formatDistanceToNow(new Date(subscription.endDate), { addSuffix: true })}`
                      : `Ended ${formatDistanceToNow(new Date(subscription.endDate), { addSuffix: true })}`
                    }
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => navigate(`/subscriptions/${subscription.id}`)}
                  >
                    View Details
                  </Button>
                  {canRenew(subscription) && (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => navigate(`/subscriptions/${subscription.id}/renew`)}
                    >
                      Renew
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Layout>
  );
};
