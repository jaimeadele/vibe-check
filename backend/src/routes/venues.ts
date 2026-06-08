import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requirePrivileged } from '../middleware/auth';

const router = Router();

function flatDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((lat1 * Math.PI) / 180);
  const dy = (lat2 - lat1) * metersPerDegLat;
  const dx = (lng2 - lng1) * metersPerDegLng;
  return Math.sqrt(dx * dx + dy * dy);
}

// GET /api/venues — active venues (used by event-creation dropdown)
router.get('/', async (_req, res) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ venues });
  } catch {
    res.status(500).json({ error: 'Failed to fetch venues' });
  }
});

// GET /api/venues/all — all venues including inactive (management view)
router.get('/all', requireAuth, requirePrivileged, async (_req, res) => {
  try {
    const venues = await prisma.venue.findMany({ orderBy: { name: 'asc' } });
    res.json({ venues });
  } catch {
    res.status(500).json({ error: 'Failed to fetch venues' });
  }
});

// POST /api/venues — create a venue (any operator or admin)
router.post('/', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  const { name, address, lat, lng, geoFenceRadius } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ error: 'lat and lng must be numbers' });
    return;
  }

  try {
    const venue = await prisma.venue.create({
      data: {
        name,
        address: address ?? null,
        lat,
        lng,
        geoFenceRadius: geoFenceRadius ?? 150,
        createdById: req.user!.userId,
      },
    });
    res.status(201).json(venue);
  } catch {
    res.status(500).json({ error: 'Failed to create venue' });
  }
});

// POST /api/venues/validate-location/:roomCode
// Checks whether the user's coordinates are within the room's event venue geofence
router.post('/validate-location/:roomCode', async (req: Request, res: Response) => {
  const { roomCode } = req.params;
  const { lat, lng } = req.body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ error: 'lat and lng must be numbers' });
    return;
  }

  try {
    const room = await prisma.room.findUnique({
      where: { roomCode },
      include: { event: { include: { venue: true } } },
    });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (!room.event.venue) {
      res.json({ withinFence: true });
      return;
    }

    const distance = flatDistance(lat, lng, room.event.venue.lat, room.event.venue.lng);
    const withinFence = distance <= room.event.venue.geoFenceRadius;
    res.json({ withinFence, distance: Math.round(distance) });
  } catch {
    res.status(500).json({ error: 'Failed to validate location' });
  }
});

// PATCH /api/venues/:id — edit venue fields (creator or admin only)
router.patch('/:id', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, address, lat, lng, geoFenceRadius } = req.body;

  if (name !== undefined && typeof name !== 'string') {
    res.status(400).json({ error: 'name must be a string' });
    return;
  }
  if (lat !== undefined && typeof lat !== 'number') {
    res.status(400).json({ error: 'lat must be a number' });
    return;
  }
  if (lng !== undefined && typeof lng !== 'number') {
    res.status(400).json({ error: 'lng must be a number' });
    return;
  }

  try {
    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) { res.status(404).json({ error: 'Venue not found' }); return; }
    if (req.user!.role !== 'ADMIN' && venue.createdById !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const updated = await prisma.venue.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address: address || null }),
        ...(lat !== undefined && { lat }),
        ...(lng !== undefined && { lng }),
        ...(geoFenceRadius !== undefined && { geoFenceRadius }),
      },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update venue' });
  }
});

// PATCH /api/venues/:id/restore — undo a soft delete (creator or admin only)
router.patch('/:id/restore', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) { res.status(404).json({ error: 'Venue not found' }); return; }
    if (req.user!.role !== 'ADMIN' && venue.createdById !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const updated = await prisma.venue.update({ where: { id }, data: { isActive: true } });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to restore venue' });
  }
});

// DELETE /api/venues/:id — hard delete if no events, soft delete otherwise
router.delete('/:id', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const venue = await prisma.venue.findUnique({ where: { id }, include: { _count: { select: { events: true } } } });
    if (!venue) { res.status(404).json({ error: 'Venue not found' }); return; }
    if (req.user!.role !== 'ADMIN' && venue.createdById !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    if (venue._count.events === 0) {
      await prisma.venue.delete({ where: { id } });
      res.json({ deleted: true, id });
    } else {
      const updated = await prisma.venue.update({ where: { id }, data: { isActive: false } });
      res.json({ deleted: false, venue: updated });
    }
  } catch {
    res.status(500).json({ error: 'Failed to remove venue' });
  }
});

export default router;
