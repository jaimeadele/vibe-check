import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getIO } from '../lib/socket';
import { requireAuth, requireOperator, requirePrivileged } from '../middleware/auth';

const router = Router();

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// POST /api/events — create an event (operator only)
// Accepts optional `rooms: string[]`; defaults to one room named after the event.
router.post('/', requireAuth, requireOperator, async (req: Request, res: Response) => {
  const { name, startTime, venueId, rooms: roomNames, recurrenceFrequency, recurrenceDayOfWeek, recurrenceDayPosition } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!startTime) {
    res.status(400).json({ error: 'startTime is required' });
    return;
  }

  try {
    const ev = await prisma.event.create({
      data: {
        name,
        startTime: new Date(startTime),
        operatorId: req.user!.userId,
        venueId: venueId ?? null,
        recurrenceFrequency: recurrenceFrequency ?? null,
        recurrenceDayOfWeek: recurrenceDayOfWeek ?? null,
        recurrenceDayPosition: recurrenceDayPosition ?? null,
      },
    });

    const namesToCreate: string[] =
      Array.isArray(roomNames) && roomNames.length > 0
        ? (roomNames as string[]).filter(r => typeof r === 'string' && r.trim())
        : [name];

    for (const roomName of namesToCreate) {
      await prisma.room.create({
        data: { eventId: ev.id, name: roomName.trim(), roomCode: generateRoomCode() },
      });
    }

    const event = await prisma.event.findUnique({
      where: { id: ev.id },
      include: {
        venue: { select: { id: true, name: true, address: true } },
        rooms: {
          select: {
            id: true, name: true, roomCode: true, status: true,
            djs: { select: { user: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    res.status(201).json(event);
  } catch {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PATCH /api/events/:id/startTime
router.patch('/:id/startTime', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  const { startTime } = req.body;
  if (!startTime) {
    res.status(400).json({ error: 'startTime is required' });
    return;
  }

  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (req.user!.role !== 'ADMIN' && event.operatorId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const updated = await prisma.event.update({
      where: { id: req.params.id },
      data: { startTime: new Date(startTime) },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update start time' });
  }
});

// PATCH /api/events/:id/venue
router.patch('/:id/venue', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  const { venueId } = req.body;

  if (venueId !== null && venueId !== undefined && typeof venueId !== 'string') {
    res.status(400).json({ error: 'venueId must be a string or null' });
    return;
  }

  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (req.user!.role !== 'ADMIN' && event.operatorId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const updated = await prisma.event.update({
      where: { id: req.params.id },
      data: { venueId: venueId || null },
      include: { venue: { select: { id: true, name: true, address: true } } },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update venue' });
  }
});

// DELETE /api/events/:id
router.delete('/:id', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (req.user!.role !== 'ADMIN' && event.operatorId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    await prisma.event.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// POST /api/events/:id/rooms — create a room within an event
router.post('/:id/rooms', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (req.user!.role !== 'ADMIN' && event.operatorId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const room = await prisma.room.create({
      data: { eventId: req.params.id, name, roomCode: generateRoomCode() },
    });
    res.status(201).json(room);
  } catch {
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// PATCH /api/events/:id/rooms/:roomId/status
router.patch('/:id/rooms/:roomId/status', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  const { status } = req.body;

  if (!['UPCOMING', 'ACTIVE', 'CLOSED'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.roomId },
      include: { event: { select: { operatorId: true } } },
    });
    if (!room || room.eventId !== req.params.id) {
      res.status(404).json({ error: 'Room not found' }); return;
    }
    if (req.user!.role !== 'ADMIN' && room.event.operatorId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const updated = await prisma.room.update({
      where: { id: req.params.roomId },
      data: { status },
    });
    getIO().to(room.roomCode).emit('room:status', { status: updated.status });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PATCH /api/events/:id/rooms/:roomId — rename a room
router.patch('/:id/rooms/:roomId', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.roomId },
      include: { event: { select: { operatorId: true } } },
    });
    if (!room || room.eventId !== req.params.id) {
      res.status(404).json({ error: 'Room not found' }); return;
    }
    if (req.user!.role !== 'ADMIN' && room.event.operatorId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    const updated = await prisma.room.update({
      where: { id: req.params.roomId },
      data: { name: name.trim() },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to rename room' });
  }
});

// DELETE /api/events/:id/rooms/:roomId
router.delete('/:id/rooms/:roomId', requireAuth, requirePrivileged, async (req: Request, res: Response) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.roomId },
      include: { event: { select: { operatorId: true } } },
    });
    if (!room || room.eventId !== req.params.id) {
      res.status(404).json({ error: 'Room not found' }); return;
    }
    if (req.user!.role !== 'ADMIN' && room.event.operatorId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }

    await prisma.room.delete({ where: { id: req.params.roomId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// POST /api/events/:id/rooms/:roomId/songs
router.post('/:id/rooms/:roomId/songs', requireAuth, async (req: Request, res: Response) => {
  const { title, artist, albumArt, previewUrl, spotifyId } = req.body;

  if (!title || !artist) {
    res.status(400).json({ error: 'title and artist are required' });
    return;
  }

  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.roomId },
      include: {
        event: { select: { operatorId: true } },
        djs: { select: { userId: true } },
      },
    });
    if (!room || room.eventId !== req.params.id) {
      res.status(404).json({ error: 'Room not found' }); return;
    }

    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const canAdd =
      userRole === 'ADMIN' ||
      room.event.operatorId === userId ||
      room.djs.some(dj => dj.userId === userId);

    if (!canAdd) { res.status(403).json({ error: 'Not authorized' }); return; }
    if (room.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Room is not active' }); return;
    }

    const song = await prisma.song.create({
      data: {
        title,
        artist,
        roomId: req.params.roomId,
        albumArt: albumArt ?? null,
        previewUrl: previewUrl ?? null,
        spotifyId: spotifyId ?? null,
      },
    });

    getIO().to(room.roomCode).emit('song:added', song);
    res.status(201).json(song);
  } catch {
    res.status(500).json({ error: 'Failed to add song' });
  }
});

// DELETE /api/events/:id/rooms/:roomId/songs/:songId
router.delete('/:id/rooms/:roomId/songs/:songId', requireAuth, async (req: Request, res: Response) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.roomId },
      include: {
        event: { select: { operatorId: true } },
        djs: { select: { userId: true } },
      },
    });
    if (!room || room.eventId !== req.params.id) {
      res.status(404).json({ error: 'Room not found' }); return;
    }

    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const canDelete =
      userRole === 'ADMIN' ||
      room.event.operatorId === userId ||
      room.djs.some(dj => dj.userId === userId);

    if (!canDelete) { res.status(403).json({ error: 'Not authorized' }); return; }

    await prisma.song.delete({ where: { id: req.params.songId } });
    getIO().to(room.roomCode).emit('song:removed', { songId: req.params.songId });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove song' });
  }
});

export default router;
