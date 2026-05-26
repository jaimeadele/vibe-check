import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from './lib/passport';
import eventsRouter from './routes/events';
import authRouter from './routes/auth';
import identifyRouter from './routes/identify';
import spotifyRouter from './routes/spotify';
import venuesRouter from './routes/venues';

const app = express();

// Parse incoming JSON request bodies
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Allow requests from the frontend dev server and ngrok tunnels (for mobile testing)
const allowedOrigins = [
  'http://localhost:5173',
  /https:\/\/.*\.ngrok-free\.app$/,  // ngrok free tier domains
  /https:\/\/.*\.ngrok-free\.dev$/,  // ngrok free tier .dev domains
  /https:\/\/.*\.ngrok\.io$/,        // ngrok paid/legacy domains
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, Postman, same-origin server-to-server)
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(
      (pattern) => typeof pattern === 'string' ? pattern === origin : pattern.test(origin)
    );
    callback(allowed ? null : new Error(`CORS: origin ${origin} not allowed`), allowed);
  },
  credentials: true,
}));

// Health check — used to verify the server is running
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Mount the events router at /api/events
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);
app.use('/api/events/:id/identify', identifyRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/venues', venuesRouter);

export default app;
