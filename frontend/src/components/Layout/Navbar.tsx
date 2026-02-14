import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Box,
  Badge,
  Menu,
  MenuItem,
  Avatar,
  Divider,
} from '@mui/material';
import {
  Brightness4,
  Brightness7,
  Notifications as NotificationsIcon,
  AccountCircle,
  Dashboard,
  Store,
  ShoppingCart,
  ExitToApp,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useQuery } from 'react-query';
import { notificationService } from '../../services/notificationService';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, clearAuth } = useAuthStore();
  const { mode, toggleTheme } = useThemeStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { data: unreadCount } = useQuery(
    'unreadNotifications',
    () => notificationService.getUnreadCount(),
    {
      enabled: isAuthenticated,
      refetchInterval: 30000, // Refetch every 30 seconds
    }
  );

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    clearAuth();
    handleClose();
    navigate('/login');
  };

  return (
    <AppBar position="sticky" elevation={1}>
      <Toolbar>
        <Typography
          variant="h6"
          component="div"
          sx={{ cursor: 'pointer', fontWeight: 600 }}
          onClick={() => navigate('/')}
        >
          Signals Marketplace
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        {/* Theme toggle */}
        <IconButton onClick={toggleTheme} color="inherit" aria-label="toggle theme">
          {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
        </IconButton>

        {isAuthenticated ? (
          <>
            {/* Notifications */}
            <IconButton
              color="inherit"
              onClick={() => navigate('/notifications')}
              aria-label="notifications"
            >
              <Badge badgeContent={unreadCount?.count || 0} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>

            {/* User menu */}
            <IconButton
              onClick={handleMenu}
              color="inherit"
              aria-label="account menu"
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {user?.username.charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
            >
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  {user?.username}
                </Typography>
              </MenuItem>
              <Divider />

              <MenuItem onClick={() => { navigate('/orders'); handleClose(); }}>
                <ShoppingCart sx={{ mr: 1 }} fontSize="small" />
                My Orders
              </MenuItem>

              <MenuItem onClick={() => { navigate('/subscriptions'); handleClose(); }}>
                <Dashboard sx={{ mr: 1 }} fontSize="small" />
                My Subscriptions
              </MenuItem>

              {user?.isMerchant && (
                <MenuItem onClick={() => { navigate('/merchant/dashboard'); handleClose(); }}>
                  <Store sx={{ mr: 1 }} fontSize="small" />
                  Merchant Dashboard
                </MenuItem>
              )}

              {user?.role === 'admin' && (
                <MenuItem onClick={() => { navigate('/admin'); handleClose(); }}>
                  <AccountCircle sx={{ mr: 1 }} fontSize="small" />
                  Admin Panel
                </MenuItem>
              )}

              <Divider />

              <MenuItem onClick={handleLogout}>
                <ExitToApp sx={{ mr: 1 }} fontSize="small" />
                Logout
              </MenuItem>
            </Menu>
          </>
        ) : (
          <>
            <Button color="inherit" onClick={() => navigate('/login')}>
              Login
            </Button>
            <Button
              variant="contained"
              color="secondary"
              onClick={() => navigate('/register')}
              sx={{ ml: 1 }}
            >
              Sign Up
            </Button>
          </>
        )}
      </Toolbar>
    </AppBar>
  );
};
