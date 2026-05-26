import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

// Returns the straight-line distance in metres between two lat/lng points.
// Flat-plane approximation — accurate to well within 1m at the distances we care about (~200m).
function flatDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((lat1 * Math.PI) / 180);
  const dy = (lat2 - lat1) * metersPerDegLat;
  const dx = (lng2 - lng1) * metersPerDegLng;
  return Math.sqrt(dx * dx + dy * dy);
}

// GET /api/venues - list all venues
router.get('/', async (_req, res) => {
  try {
    const venues = await prisma.venue.findMany({ orderBy: { name: 'asc' } });
    res.json({ venues });
  } catch {
    res.status(500).json({ error: 'Failed to fetch venues' });
  }
});

// POST /api/venues - create a venue (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
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
      },
    });
    res.status(201).json(venue);
  } catch {
    res.status(500).json({ error: 'Failed to create venue' });
  }
});

// POST /api/venues/validate-location/:eventId
// Receives the user's coordinates and returns whether they are within the venue's geofence
router.post('/validate-location/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const { lat, lng } = req.body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ error: 'lat and lng must be numbers' });
    return;
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true },
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // If the event has no venue attached, we can't geofence — allow access
    if (!event.venue) {
      res.json({ withinFence: true });
      return;
    }

    const distance = flatDistance(lat, lng, event.venue.lat, event.venue.lng);
    const withinFence = distance <= event.venue.geoFenceRadius;

    res.json({ withinFence, distance: Math.round(distance) });
  } catch {
    res.status(500).json({ error: 'Failed to validate location' });
  }
});

export default router;
