import { Router } from 'express';
import prisma from '../lib/prisma';
import { getIO } from '../lib/socket';

const router = Router();

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// GET /api/events - list all rooms
router.get('/', async (_req, res) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ rooms: events });
  } catch {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/events - create a new room
router.post('/', async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  try {
    const event = await prisma.event.create({
      data: {
        name,
        roomCode: generateRoomCode(),
      },
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
      include: { songs: true },
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
router.post('/:id/songs', async (req, res) => {
  const { title, artist } = req.body;

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

    const song = await prisma.song.create({
      data: { title, artist, eventId: req.params.id },
    });

    getIO().to(event.roomCode).emit('song:added', song);

    res.status(201).json(song);
  } catch {
    res.status(500).json({ error: 'Failed to add song' });
  }
});

export default router;
