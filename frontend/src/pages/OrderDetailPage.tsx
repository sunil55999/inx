import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Chip,
  Grid,
  Paper,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { useQuery } from 'react-query';
import { QRCodeSVG } from 'qrcode.react';
import { orderService } from '../services/orderService';
import { Layout } from '../components/Layout/Layout';
import { formatDistanceToNow } from 'date-fns';

export const OrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data: order, isLoading } = useQuery(
    ['order', id],
    () => orderService.getOrder(id!),
    {
      enabled: !!id,
      refetchInterval: 10000, // Refetch every 10 seconds
    }
  );

  if (isLoading) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <Alert severity="error">Order not found</Alert>
      </Layout>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'success';
      case 'payment_received': return 'info';
      case 'expired': return 'error';
      case 'cancelled': return 'default';
      default: return 'warning';
    }
  };

  const isExpired = new Date(order.expiresAt) < new Date();

  return (
    <Layout maxWidth="md">
      <Typography variant="h4" gutterBottom>
        Order Details
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">Order #{order.id.slice(0, 8)}</Typography>
            <Chip label={order.status} color={getStatusColor(order.status)} />
          </Box>

          {order.status === 'pending_payment' && !isExpired && (
            <Alert severity="info" sx={{ mb: 3 }}>
              Send exactly <strong>{order.cryptoAmount} {order.cryptoCurrency}</strong> to the address below.
              Order expires {formatDistanceToNow(new Date(order.expiresAt), { addSuffix: true })}.
            </Alert>
          )}

          {isExpired && order.status === 'pending_payment' && (
            <Alert severity="error" sx={{ mb: 3 }}>
              This order has expired. Please create a new order.
            </Alert>
          )}

          {order.status === 'confirmed' && (
            <Alert severity="success" sx={{ mb: 3 }}>
              Payment confirmed! Your subscription is now active.
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Scan QR Code
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                  <QRCodeSVG value={order.depositAddress} size={200} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Scan with your wallet app
                </Typography>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Payment Details
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Amount</Typography>
                  <Typography variant="h6">{order.cryptoAmount} {order.cryptoCurrency}</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">Deposit Address</Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      wordBreak: 'break-all',
                      fontFamily: 'monospace',
                      bgcolor: 'background.default',
                      p: 1,
                      borderRadius: 1,
                    }}
                  >
                    {order.depositAddress}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Price (USD)</Typography>
                  <Typography variant="body1">${order.priceUsd}</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {order.listing && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Listing Information
            </Typography>
            <Typography variant="body1">{order.listing.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {order.listing.description}
            </Typography>
          </CardContent>
        </Card>
      )}
    </Layout>
  );
};
