import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import passport from './lib/passport';
import eventsRouter from './routes/events';
import authRouter from './routes/auth';
import identifyRouter from './routes/identify';
import roomsRouter from './routes/rooms';
import spotifyRouter from './routes/spotify';
import venuesRouter from './routes/venues';
import songsRouter from './routes/songs';
import operatorsRouter from './routes/operators';

const app = express();

// Parse incoming JSON request bodies
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

const allowedOrigins: (string | RegExp)[] = [
  'http://localhost:5173',
  /https:\/\/.*\.ngrok-free\.app$/,  // ngrok free tier domains
  /https:\/\/.*\.ngrok-free\.dev$/,  // ngrok free tier .dev domains
  /https:\/\/.*\.ngrok\.io$/,        // ngrok paid/legacy domains
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

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
app.use('/api/rooms', roomsRouter);
app.use('/api/rooms/:id/identify', identifyRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/venues', venuesRouter);
app.use('/api/songs', songsRouter);
app.use('/api/operators', operatorsRouter);

app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

export default app;
