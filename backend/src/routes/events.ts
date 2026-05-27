import { Router } from 'express';
import prisma from '../lib/prisma';
import { EventStatus } from '../generated/prisma/client';
import { getIO } from '../lib/socket';
import { requireAuth, requireAdmin, requirePrivileged } from '../middleware/auth';

const router = Router();

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// GET /api/events - list all rooms (venue name/address included for display)
router.get('/', async (_req, res) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
      include: { venue: { select: { id: true, name: true, address: true } } },
    });
    res.json({ rooms: events });
  } catch {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/events - create a new room
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, startTime, venueId } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!startTime) {
    res.status(400).json({ error: 'startTime is required' });
    return;
  }

  try {
    const event = await prisma.event.create({
      data: {
        name,
        roomCode: generateRoomCode(),
        startTime: new Date(startTime),
        venueId: venueId ?? null,
      },
      include: { venue: { select: { id: true, name: true, address: true } } },
    });
    res.status(201).json(event);
  } catch {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// GET /api/events/:id/setlist - returns songs for a room
router.get('/:id/setlist', async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { songs: { orderBy: { identifiedAt: 'desc' } } },
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    res.json({ songs: event.songs });
  } catch {
    res.status(500).json({ error: 'Failed to fetch setlist' });
  }
});

// POST /api/events/:id/songs - add a song and broadcast to the room
router.post('/:id/songs', requireAuth, requirePrivileged, async (req, res) => {
  const { title, artist, albumArt, previewUrl, spotifyId } = req.body;

  if (!title || !artist) {
    res.status(400).json({ error: 'title and artist are required' });
    return;
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    if (event.status !== EventStatus.ACTIVE) {
      res.status(403).json({ error: 'Event is not active' });
      return;
    }

    const song = await prisma.song.create({
      data: {
        title,
        artist,
        eventId: req.params.id,
        albumArt: albumArt ?? null,
        previewUrl: previewUrl ?? null,
        spotifyId: spotifyId ?? null,
      },
    });

    getIO().to(event.roomCode).emit('song:added', song);

    res.status(201).json(song);
  } catch {
    res.status(500).json({ error: 'Failed to add song' });
  }
});

// PATCH /api/events/:id/status - update event status
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.body;

  if (!['UPCOMING', 'ACTIVE', 'CLOSED'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  try {
    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: { status },
    });
    getIO().to(event.roomCode).emit('event:status', { status: event.status });
    res.json(event);
  } catch {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PATCH /api/events/:id/startTime - update event start time
router.patch('/:id/startTime', requireAuth, requireAdmin, async (req, res) => {
  const { startTime } = req.body;

  if (!startTime) {
    res.status(400).json({ error: 'startTime is required' });
    return;
  }

  try {
    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: { startTime: new Date(startTime) },
    });
    res.json(event);
  } catch {
    res.status(500).json({ error: 'Failed to update start time' });
  }
});

// PATCH /api/events/:id/venue - assign or clear the venue for an event (admin only)
router.patch('/:id/venue', requireAuth, requireAdmin, async (req, res) => {
  const { venueId } = req.body;

  // venueId must be a non-empty string (a venue id) or null/undefined (to clear)
  if (venueId !== null && venueId !== undefined && typeof venueId !== 'string') {
    res.status(400).json({ error: 'venueId must be a string or null' });
    return;
  }

  try {
    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: { venueId: venueId || null },
      include: { venue: { select: { id: true, name: true, address: true } } },
    });
    res.json(event);
  } catch {
    res.status(500).json({ error: 'Failed to update venue' });
  }
});

// DELETE /api/events/:id - remove an event
router.delete('/:id', requireAuth, requirePrivileged, async (req, res) => {
  try {
    await prisma.event.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// DELETE /api/events/:id/songs/:songId - remove a song from the setlist
router.delete('/:id/songs/:songId', requireAuth, requirePrivileged, async (req, res) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }

    await prisma.song.delete({ where: { id: req.params.songId } });
    getIO().to(event.roomCode).emit('song:removed', { songId: req.params.songId });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove song' });
  }
});

export default router;
