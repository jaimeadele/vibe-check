import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import passport from '../lib/passport';
import prisma from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;

// POST /api/auth/register - create an admin account
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, name, passwordHash, role: 'ADMIN' },
    });
    res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } catch {
    res.status(409).json({ error: 'Email already in use' });
  }
});

// POST /api/auth/login - log in and receive a JWT cookie
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ id: user.id, email: user.email, role: user.role });
});

// GET /api/auth/me - return current user's identity and role
router.get('/me', requireAuth, (req, res) => {
  res.json({ userId: req.user!.userId, role: req.user!.role });
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// GET /api/auth/google - redirect to Google's login page
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// GET /api/auth/google/callback - Google redirects here after login
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const user = req.user!;
    const token = jwt.sign(
      { userId: user.userId, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect('http://localhost:5173');
  }
);

// POST /api/auth/register-operator — Admin only, creates an Operator account
const SLUG_BLOCKLIST = ['admin', 'api', 'auth', 'login'];
const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;

router.post('/register-operator', requireAuth, requireAdmin, async (req, res) => {
  const { email, password, name, slug } = req.body;

  if (!email || !password || !name || !slug) {
    res.status(400).json({ error: 'email, password, name, and slug are required' });
    return;
  }

  if (!SLUG_PATTERN.test(slug)) {
    res.status(400).json({ error: 'Slug must be 3–40 characters: lowercase letters, digits, and hyphens only' });
    return;
  }

  if (SLUG_BLOCKLIST.includes(slug)) {
    res.status(400).json({ error: `'${slug}' is a reserved slug and cannot be used` });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, name, slug, passwordHash, role: 'OPERATOR' },
    });
    res.status(201).json({ id: user.id, email: user.email, name: user.name, slug: user.slug, role: user.role });
  } catch {
    res.status(409).json({ error: 'Email or slug already in use' });
  }
});

export default router;