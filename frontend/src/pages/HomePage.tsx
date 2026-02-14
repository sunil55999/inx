import React, { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  TextField,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Search, TrendingUp, Store as StoreIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { listingService } from '../services/listingService';
import { Layout } from '../components/Layout/Layout';
import { SignalType } from '../types';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [signalTypeFilter, setSignalTypeFilter] = useState<SignalType | ''>('');

  const { data: listings, isLoading, error } = useQuery(
    ['listings', signalTypeFilter],
    () => listingService.getListings({
      isActive: true,
      signalType: signalTypeFilter || undefined,
    })
  );

  const filteredListings = listings?.filter((listing) =>
    listing.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.channelName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      {/* Hero Section */}
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <Typography variant="h2" component="h1" gutterBottom fontWeight={600}>
          Discover Premium Trading Signals
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
          Subscribe to verified Telegram channels with cryptocurrency payments
        </Typography>

        {/* Search Bar */}
        <Box sx={{ maxWidth: 600, mx: 'auto', mb: 3 }}>
          <TextField
            fullWidth
            placeholder="Search channels, signals, or merchants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {/* Filter */}
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Signal Type</InputLabel>
          <Select
            value={signalTypeFilter}
            label="Signal Type"
            onChange={(e) => setSignalTypeFilter(e.target.value as SignalType | '')}
          >
            <MenuItem value="">All Types</MenuItem>
            <MenuItem value="crypto">Crypto</MenuItem>
            <MenuItem value="forex">Forex</MenuItem>
            <MenuItem value="stocks">Stocks</MenuItem>
            <MenuItem value="options">Options</MenuItem>
            <MenuItem value="futures">Futures</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Listings Grid */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load listings. Please try again.
        </Alert>
      )}

      {filteredListings && filteredListings.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            No listings found
          </Typography>
        </Box>
      )}

      <Grid container spacing={3}>
        {filteredListings?.map((listing) => (
          <Grid item xs={12} sm={6} md={4} key={listing.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <TrendingUp sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6" component="h2" noWrap>
                    {listing.title}
                  </Typography>
                </Box>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mb: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {listing.description}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                  <Chip
                    label={listing.signalType}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    label={`${listing.durationDays} days`}
                    size="small"
                    variant="outlined"
                  />
                </Box>

                <Typography variant="h5" color="primary.main" fontWeight={600}>
                  ${listing.priceUsd}
                </Typography>

                {listing.merchant && (
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', mt: 2, cursor: 'pointer' }}
                    onClick={() => navigate(`/store/${listing.merchant?.username}`)}
                  >
                    <StoreIcon sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      by {listing.merchant.displayName || listing.merchant.username}
                    </Typography>
                  </Box>
                )}
              </CardContent>

              <CardActions sx={{ p: 2, pt: 0 }}>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => navigate(`/listings/${listing.id}`)}
                >
                  View Details
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Layout>
  );
};
