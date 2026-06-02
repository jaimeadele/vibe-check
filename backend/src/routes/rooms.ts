import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { optionalAuth } from '../middleware/auth';

const router = Router();

// GET /api/rooms/:roomCode/setlist — public lookup by room code; returns room + event + songs + isPrivileged
router.get('/:roomCode/setlist', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { roomCode } = req.params;

    const room = await prisma.room.findUnique({
      where: { roomCode },
      include: {
        songs: {
          orderBy: { identifiedAt: 'desc' },
          include: { reactions: { select: { emoji: true } } },
        },
        event: {
          select: {
            id: true,
            name: true,
            startTime: true,
            operatorId: true,
            venue: { select: { id: true, name: true, address: true } },
          },
        },
        djs: { select: { user: { select: { id: true, name: true } }, userId: true } },
      },
    });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const userId = req.user?.userId;
    const isPrivileged = !!(userId && (
      req.user?.role === 'ADMIN' ||
      room.event.operatorId === userId ||
      room.djs.some(dj => dj.userId === userId)
    ));

    const songs = room.songs.map(({ reactions, ...song }) => {
      const breakdown: Record<string, number> = { '🔥': 0, '❤️': 0, '🥱': 0, '🤮': 0 };
      for (const r of reactions) {
        if (r.emoji in breakdown) breakdown[r.emoji]++;
      }
      return { ...song, breakdown };
    });

    res.json({
      room: {
        id: room.id,
        name: room.name,
        roomCode: room.roomCode,
        status: room.status,
        djs: room.djs.map(d => d.user),
      },
      event: room.event,
      isPrivileged,
      songs,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch setlist' });
  }
});

export default router;
