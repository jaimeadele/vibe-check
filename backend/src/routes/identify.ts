import { Router, Request, Response } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { getIO } from '../lib/socket';
import { identifyAudio } from '../services/acr';
import { searchTrack } from '../services/spotify';

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

// POST /lock — acquires the identification lock and notifies the room
router.post('/lock', async (req: Request<{ id: string }>, res: Response) => {
  const { id: eventId } = req.params;

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const lockKey = `identify:lock:${eventId}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');

  if (!acquired) {
    res.status(409).json({ error: 'Identification already in progress' });
    return;
  }

  getIO().to(event.roomCode).emit('identify:start');
  res.status(200).json({ ok: true });
});

// DELETE /lock — releases the lock when the user cancels
router.delete('/lock', async (req: Request<{ id: string }>, res: Response) => {
  const { id: eventId } = req.params;

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const lockKey = `identify:lock:${eventId}`;
  await redis.del(lockKey);
  getIO().to(event.roomCode).emit('identify:end');
  res.status(200).json({ ok: true });
});

// POST / — receives the recorded audio and runs identification
router.post('/', upload.single('audio'), async (req: Request<{ id: string }>, res: Response) => {
  const { id: eventId } = req.params;

  if (!req.file) {
    res.status(400).json({ error: 'Audio file required' });
    return;
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const lockKey = `identify:lock:${eventId}`;

  try {
    const result = await identifyAudio(req.file.buffer);

    if (!result || result.confidence < 70) {
      res.status(422).json({ error: 'Could not identify song' });
      return;
    }

    const mostRecent = await prisma.song.findFirst({
      where: { eventId },
      orderBy: { identifiedAt: 'desc' },
    });

    const isDuplicate =
      mostRecent &&
      mostRecent.title.toLowerCase() === result.title.toLowerCase() &&
      mostRecent.artist.toLowerCase() === result.artist.toLowerCase();

    const spotify = await searchTrack(result.title, result.artist).catch(() => null);

    if (isDuplicate) {
      res.status(200).json({
        title: result.title,
        artist: result.artist,
        albumArt: spotify?.albumArt ?? null,
        spotifyId: spotify?.spotifyId ?? null,
        duplicate: true,
      });
      return;
    }

    const song = await prisma.song.create({
      data: {
        title: result.title,
        artist: result.artist,
        eventId,
        albumArt: spotify?.albumArt ?? null,
        previewUrl: spotify?.previewUrl ?? null,
        spotifyId: spotify?.spotifyId ?? null,
      },
    });

    getIO().to(event.roomCode).emit('song:added', song);
    res.status(201).json(song);
  } finally {
    await redis.del(lockKey);
    getIO().to(event.roomCode).emit('identify:end');
  }
});

export default router;
