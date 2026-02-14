# Frontend Installation Guide

## Quick Fix for Installation Issues

If you're experiencing installation issues, follow these steps:

### Step 1: Clean Install

```bash
# Navigate to frontend directory
cd frontend

# Remove existing node_modules and lock file
rm -rf node_modules package-lock.json

# Install dependencies with legacy peer deps flag
npm install --legacy-peer-deps
```

### Step 2: Create .env File

```bash
# Copy the example environment file
cp .env.example .env
```

Make sure `.env` contains:
```env
REACT_APP_API_URL=http://localhost:3000
```

### Step 3: Start the Development Server

```bash
npm start
```

The app should open at http://localhost:3001

## Common Issues and Solutions

### Issue 1: TypeScript Version Conflict

**Error**: `ERESOLVE could not resolve` with TypeScript versions

**Solution**: The package.json has been updated to use TypeScript 4.9.5 which is compatible with react-scripts 5.0.1. Run:
```bash
npm install --legacy-peer-deps
```

### Issue 2: Missing Dependencies

**Error**: `'react-scripts' is not recognized`

**Solution**: Dependencies aren't installed. Run:
```bash
npm install --legacy-peer-deps
```

### Issue 3: Port Already in Use

**Error**: `Port 3001 is already in use`

**Solution**: Kill the process using the port:
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3001 | xargs kill -9
```

### Issue 4: Module Not Found Errors

**Error**: `Module not found: Can't resolve 'X'`

**Solution**: Make sure all source files are created. Check that these directories exist:
- `src/components/`
- `src/pages/`
- `src/services/`
- `src/store/`
- `src/types/`
- `src/config/`

### Issue 5: WebAuthn Not Working

**Error**: WebAuthn registration/login fails

**Solution**: WebAuthn requires:
- HTTPS or localhost (not 127.0.0.1)
- Modern browser (Chrome, Firefox, Safari, Edge)
- Access via http://localhost:3001 (not http://127.0.0.1:3001)

## Verification Steps

After installation, verify everything works:

### 1. Check Dependencies
```bash
npm list --depth=0
```

Should show all packages installed without errors.

### 2. Check TypeScript Compilation
```bash
npx tsc --noEmit
```

Should complete without errors.

### 3. Start Development Server
```bash
npm start
```

Should open browser to http://localhost:3001

### 4. Check Console
Open browser DevTools (F12) and check for errors in the Console tab.

## Manual Installation (If Automated Fails)

If `npm install` keeps failing, try installing packages in groups:

### Group 1: Core React
```bash
npm install --legacy-peer-deps react react-dom react-router-dom
```

### Group 2: Material-UI
```bash
npm install --legacy-peer-deps @mui/material @mui/icons-material @emotion/react @emotion/styled
```

### Group 3: State & Data
```bash
npm install --legacy-peer-deps zustand react-query axios
```

### Group 4: Forms & Validation
```bash
npm install --legacy-peer-deps react-hook-form zod @hookform/resolvers
```

### Group 5: Utilities
```bash
npm install --legacy-peer-deps @simplewebauthn/browser qrcode.react date-fns
```

### Group 6: Dev Dependencies
```bash
npm install --save-dev --legacy-peer-deps typescript@4.9.5 react-scripts@5.0.1 @types/react @types/react-dom @types/node
```

## Alternative: Use Yarn

If npm continues to have issues, try using Yarn:

```bash
# Install Yarn globally (if not installed)
npm install -g yarn

# Install dependencies
yarn install

# Start development server
yarn start
```

## Docker Alternative

If local installation is problematic, use Docker:

```bash
# From project root
docker-compose up frontend
```

## Environment Variables

Make sure your `.env` file has:

```env
# Required
REACT_APP_API_URL=http://localhost:3000

# Optional
REACT_APP_NAME=Telegram Signals Marketplace
REACT_APP_VERSION=1.0.0
```

## Backend Connection

The frontend expects the backend to be running at http://localhost:3000

Make sure the backend is started before using the frontend:

```bash
# In another terminal
cd backend
npm run dev
```

## Browser Requirements

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

WebAuthn requires modern browser support.

## Getting Help

If issues persist:

1. Check the browser console for specific errors
2. Check the terminal output for build errors
3. Verify all source files are present
4. Try deleting `node_modules` and reinstalling
5. Check that backend is running and accessible

## Success Indicators

You'll know it's working when:

1. ✅ `npm start` completes without errors
2. ✅ Browser opens to http://localhost:3001
3. ✅ You see the home page with "Signals Marketplace" header
4. ✅ No errors in browser console
5. ✅ Theme toggle works (sun/moon icon in navbar)
6. ✅ Login/Register buttons are visible

## Next Steps

Once the frontend is running:

1. Click "Sign Up" to create an account
2. Test WebAuthn registration
3. Browse the home page
4. Check that API calls work (open Network tab in DevTools)

## Troubleshooting Checklist

- [ ] Node.js 18+ installed
- [ ] npm or yarn available
- [ ] Backend running on port 3000
- [ ] Port 3001 available
- [ ] .env file created
- [ ] All source files present
- [ ] node_modules installed
- [ ] No TypeScript errors
- [ ] Modern browser being used
- [ ] Accessing via localhost (not 127.0.0.1)
