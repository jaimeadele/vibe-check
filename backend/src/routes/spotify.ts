import { Router } from 'express';
import { searchTracks } from '../services/spotify';
import { requireAuth, requirePrivileged } from '../middleware/auth';

const router = Router();

// GET /api/spotify/search?q=... - search Spotify for tracks (DJ/admin only)
router.get('/search', requireAuth, requirePrivileged, async (req, res) => {
  const q = req.query.q;

  if (!q || typeof q !== 'string' || q.trim() === '') {
    res.status(400).json({ error: 'q is required' });
    return;
  }

  try {
    const results = await searchTracks(q.trim());
    res.json({ results });
  } catch {
    res.status(500).json({ error: 'Spotify search failed' });
  }
});

export default router;
