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
  const { id: roomCode } = req.params;

  const room = await prisma.room.findUnique({ where: { roomCode } });
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const lockKey = `identify:lock:${room.id}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');

  if (!acquired) {
    res.status(409).json({ error: 'Identification already in progress' });
    return;
  }

  getIO().to(room.roomCode).emit('identify:start');
  res.status(200).json({ ok: true });
});

// DELETE /lock — releases the lock when the user cancels
router.delete('/lock', async (req: Request<{ id: string }>, res: Response) => {
  const { id: roomCode } = req.params;

  const room = await prisma.room.findUnique({ where: { roomCode } });
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const lockKey = `identify:lock:${room.id}`;
  await redis.del(lockKey);
  getIO().to(room.roomCode).emit('identify:end');
  res.status(200).json({ ok: true });
});

// POST / — receives the recorded audio and runs identification
router.post('/', upload.single('audio'), async (req: Request<{ id: string }>, res: Response) => {
  const { id: roomCode } = req.params;

  if (!req.file) {
    res.status(400).json({ error: 'Audio file required' });
    return;
  }

  const room = await prisma.room.findUnique({ where: { roomCode } });
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const lockKey = `identify:lock:${room.id}`;

  try {
    const result = await identifyAudio(req.file.buffer);

    if (!result || result.confidence < 70) {
      res.status(422).json({ error: 'Could not identify song' });
      return;
    }

    const mostRecent = await prisma.song.findFirst({
      where: { roomId: room.id },
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
        roomId: room.id,
        albumArt: spotify?.albumArt ?? null,
        previewUrl: spotify?.previewUrl ?? null,
        spotifyId: spotify?.spotifyId ?? null,
      },
    });

    getIO().to(room.roomCode).emit('song:added', song);
    res.status(201).json(song);
  } finally {
    await redis.del(lockKey);
    getIO().to(room.roomCode).emit('identify:end');
  }
});

export default router;
