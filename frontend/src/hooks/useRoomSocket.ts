import { useEffect } from 'react';
import socket from '../lib/socket';

interface Song {
  id: string;
  title: string;
  artist: string;
  identifiedAt: string;
}

export function useRoomSocket(
  roomCode: string,
  onSongAdded: (song: Song) => void
) {
  useEffect(() => {
    socket.emit('join:room', roomCode);

    socket.on('song:added', onSongAdded);

    return () => {
      socket.off('song:added', onSongAdded);
    };
  }, [roomCode]);
}
