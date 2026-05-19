import 'dotenv/config';
import { createServer } from 'http';
import app from './app';
import { initIO } from './lib/socket';

const PORT = process.env.PORT || 3000;

const httpServer = createServer(app);
const io = initIO(httpServer);

io.on('connection', (socket) => {
  socket.on('join:room', (roomCode: string) => {
    socket.join(roomCode);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
