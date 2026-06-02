import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { getIO } from '../lib/socket';

const router = Router();

const EMOJI_VALUES: Record<string, number> = {
  '🔥': 10,
  '❤️': 5,
  '🥱': -5,
  '🤮': -10,
};

const VALID_EMOJIS = Object.keys(EMOJI_VALUES);
const VOTING_WINDOW_MS = 15 * 60 * 1000;

function getOrCreateVoterId(req: Request, res: Response): string {
  let voterId = req.cookies.voter_id;
  if (!voterId) {
    voterId = randomUUID();
    res.cookie('voter_id', voterId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return voterId;
}

// POST /api/songs/:id/react
router.post('/:id/react', async (req: Request, res: Response) => {
  const { id: songId } = req.params;
  const { emoji } = req.body;

  if (!VALID_EMOJIS.includes(emoji)) {
    return res.status(400).json({ error: 'Invalid emoji' });
  }

  const voterId = getOrCreateVoterId(req, res);

  // Rate limiting: max 10 reaction calls per voterId per 60 seconds
  const rateLimitKey = `rate_limit:react:${voterId}`;
  const count = await redis.incr(rateLimitKey);
  if (count === 1) {
    await redis.expire(rateLimitKey, 60);
  }
  if (count > 10) {
    return res.status(429).json({ error: 'Too many reactions — slow down' });
  }

  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { room: { select: { roomCode: true } } },
  });

  if (!song) {
    return res.status(404).json({ error: 'Song not found' });
  }

  // 15-minute voting window enforced server-side
  const ageMs = Date.now() - new Date(song.identifiedAt).getTime();
  if (ageMs > VOTING_WINDOW_MS) {
    return res.status(403).json({ error: 'Voting window closed' });
  }

  const value = EMOJI_VALUES[emoji];

  // One reaction per (songId, voterId) — upsert replaces if the user changes their emoji
  await prisma.reaction.upsert({
    where: { songId_voterId: { songId, voterId } },
    update: { emoji, value },
    create: { songId, voterId, emoji, value },
  });

  // Recompute from all reactions rather than doing arithmetic on the cached value
  const allReactions = await prisma.reaction.findMany({ where: { songId } });
  const vibeScore = allReactions.reduce((sum, r) => sum + r.value, 0);
  const reactionCount = allReactions.length;

  const breakdown: Record<string, number> = { '🔥': 0, '❤️': 0, '🥱': 0, '🤮': 0 };
  for (const r of allReactions) {
    if (r.emoji in breakdown) breakdown[r.emoji]++;
  }

  await prisma.song.update({
    where: { id: songId },
    data: { vibeScore, reactionCount },
  });

  // Partial update — only broadcast what changed, not the whole song
  getIO().to(song.room.roomCode).emit('song:reaction_updated', {
    songId,
    vibeScore,
    reactionCount,
    breakdown,
  });

  res.json({ vibeScore, reactionCount, breakdown });
});

export default router;
