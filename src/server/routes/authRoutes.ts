import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { serverStore } from '../storage/serverStore';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { Branch } from '../../types';

export const authRouter = Router();

// Login
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { branchId, username, password } = req.body;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!branchId || !username || !password) {
      res.status(400).json({
        success: false,
        message: 'Branch selection, username, and password are all required.',
      });
      return;
    }

    const result = await AuthService.login({
      branchId,
      username,
      password,
      ipAddress,
      userAgent,
    });

    if (!result.success) {
      res.status(401).json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Internal server error during authentication.' });
  }
});

// Verify token
authRouter.post('/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.json({ valid: false });
    return;
  }

  const token = authHeader.split(' ')[1];
  const result = AuthService.verifyToken(token);
  res.json(result);
});

// Query user branch configuration (for branch dropdown UX)
authRouter.get('/user-branches', (req: Request, res: Response) => {
  const username = req.query.username as string;
  if (!username) {
    res.status(400).json({ error: 'Username parameter required' });
    return;
  }

  const cleanUsername = username.trim().toLowerCase();
  const user = serverStore.getUserByUsername(cleanUsername);

  if (!user) {
    // Return empty without revealing too much, but allow normal branch selection
    res.json({ found: false, hasMultiBranchAccess: false });
    return;
  }

  const branches = serverStore.getBranches();
  const primaryBranch = branches.find(b => b.id === user.primaryBranchId);

  let allowedBranches: Branch[] = [];
  if (user.hasMultiBranchAccess) {
    const allowedIds = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
    allowedBranches = branches.filter(b => allowedIds.has(b.id));
  } else if (primaryBranch) {
    allowedBranches = [primaryBranch];
  }

  res.json({
    found: true,
    hasMultiBranchAccess: user.hasMultiBranchAccess,
    primaryBranchId: user.primaryBranchId,
    primaryBranchName: primaryBranch?.name,
    allowedBranches,
  });
});

// Switch working branch
authRouter.post('/switch-branch', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { newBranchId } = req.body;
  if (!newBranchId) {
    res.status(400).json({ success: false, message: 'Target branch is required.' });
    return;
  }

  const result = AuthService.switchBranch({
    userId: req.user!.id,
    newBranchId,
    ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
  });

  if (!result.success) {
    res.status(403).json(result);
    return;
  }

  res.json(result);
});

// Initial administrator setup mechanism
authRouter.post('/setup-admin', async (req: Request, res: Response) => {
  try {
    const users = serverStore.getUsers();
    // Allow setup if no users exist or specifically requested
    const { username, fullName, password, primaryBranchId, email, phone } = req.body;

    if (!username || !fullName || !password || !primaryBranchId) {
      res.status(400).json({
        success: false,
        message: 'Username, full name, password, and primary branch are mandatory.',
      });
      return;
    }

    const result = await AuthService.setupInitialAdmin({
      username,
      fullName,
      password,
      primaryBranchId,
      email,
      phone,
    });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    console.error('Setup admin error:', err);
    res.status(500).json({ success: false, message: 'Failed to configure initial administrator.' });
  }
});

// Check if initial admin setup is required
authRouter.get('/setup-status', (_req: Request, res: Response) => {
  const users = serverStore.getUsers();
  res.json({
    hasUsers: users.length > 0,
    userCount: users.length,
  });
});

// Logout
authRouter.post('/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1] || '';
  if (token) {
    AuthService.invalidateSession(token, {
      userId: req.user?.id,
      username: req.user?.username,
      userFullName: req.user?.fullName,
      branchId: req.workingBranch?.id,
      branchName: req.workingBranch?.name,
      reason: `Logged out from ${req.workingBranch?.name || 'system'}`,
    });
  }

  res.json({ success: true, message: 'Logged out successfully.' });
});
