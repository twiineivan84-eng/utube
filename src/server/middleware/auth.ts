import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { PermissionCode, User, Branch } from '../../types';

export interface AuthenticatedRequest extends Request {
  user?: User;
  workingBranch?: Branch;
  effectivePermissions?: PermissionCode[];
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const verified = AuthService.verifyToken(token);

  if (!verified.valid || !verified.session) {
    res.status(401).json({ error: 'Session expired or invalid credentials' });
    return;
  }

  req.user = verified.session.user;
  req.workingBranch = verified.session.workingBranch;
  req.effectivePermissions = verified.session.effectivePermissions;
  next();
}

export function requirePermission(...permissions: PermissionCode[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.effectivePermissions) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const hasAll = permissions.every(perm => req.effectivePermissions?.includes(perm));
    if (!hasAll) {
      res.status(403).json({
        error: 'Forbidden: Insufficient privileges for this institutional operation',
        requiredPermissions: permissions,
      });
      return;
    }

    next();
  };
}

export function requireAnyPermission(...permissions: PermissionCode[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.effectivePermissions) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const hasAny = permissions.some(perm => req.effectivePermissions?.includes(perm));
    if (!hasAny) {
      res.status(403).json({
        error: 'Forbidden: Insufficient privileges for this institutional operation',
        requiredPermissions: permissions,
      });
      return;
    }

    next();
  };
}
