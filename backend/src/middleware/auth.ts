import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

interface JwtPayload {
  userId: string;
  role: string;
}

declare global {
  namespace Express {
    interface User extends JwtPayload {}
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies.token;

  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Master admin only — manages operator accounts
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// Operator only — runs events and venues
export function requireOperator(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'OPERATOR') {
    res.status(403).json({ error: 'Operator access required' });
    return;
  }
  next();
}

// Operator or master Admin
export function requirePrivileged(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'OPERATOR' && req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Operator or admin access required' });
    return;
  }
  next();
}

// Populates req.user if a valid JWT cookie is present — does not block unauthenticated requests
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
      req.user = payload;
    } catch { /* invalid token — leave req.user undefined */ }
  }
  next();
}
