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

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requirePrivileged(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'DJ') {
    res.status(403).json({ error: 'DJ or admin access required' });
    return;
  }
  next();
}
