import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';

const SLUG_BLOCKLIST = ['admin', 'api', 'auth', 'login'];
const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;

const router = Router();

// GET /api/operators — public; list all operators with active event count
router.get('/', async (_req, res) => {
  const operators = await prisma.user.findMany({
    where: { role: 'OPERATOR' },
    select: {
      id: true,
      name: true,
      slug: true,
      events: {
        where: { rooms: { some: { status: { in: ['ACTIVE', 'UPCOMING'] } } } },
        select: { id: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const result = operators.map((op) => ({
    id: op.id,
    name: op.name,
    slug: op.slug,
    activeEventCount: op.events.length,
  }));

  res.json({ operators: result });
});

// GET /api/operators/:slug — public; operator info + their events with rooms
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  const operator = await prisma.user.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      events: {
        orderBy: { startTime: 'desc' },
        select: {
          id: true,
          name: true,
          startTime: true,
          venueId: true,
          recurrenceFrequency: true,
          recurrenceDayOfWeek: true,
          recurrenceDayPosition: true,
          venue: { select: { id: true, name: true, address: true } },
          rooms: {
            select: {
              id: true,
              name: true,
              roomCode: true,
              status: true,
              djs: {
                select: { user: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!operator) {
    res.status(404).json({ error: 'Operator not found' });
    return;
  }

  res.json({ operator });
});

// PATCH /api/operators/:id — admin only; edit operator account fields
router.patch('/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, slug, password } = req.body;

  if (slug !== undefined) {
    if (!SLUG_PATTERN.test(slug)) {
      res.status(400).json({ error: 'Slug must be 3–40 characters: lowercase letters, digits, and hyphens only' });
      return;
    }
    if (SLUG_BLOCKLIST.includes(slug)) {
      res.status(400).json({ error: `'${slug}' is a reserved slug and cannot be used` });
      return;
    }
  }

  try {
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (slug !== undefined) data.slug = slug;
    if (password) data.passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, slug: true },
    });
    res.json(user);
  } catch {
    res.status(409).json({ error: 'Email or slug already in use' });
  }
});

export default router;
