import { useState, useEffect } from 'react';
import CreateRoomForm from './components/CreateRoomForm';
import RoomView from './components/RoomView';

interface Room {
  id: string;
  name: string;
  roomCode: string;
}

function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);

  useEffect(() => {
    fetch('/api/events')
      .then(res => res.json())
      .then(data => setRooms(data.rooms));
  }, []);

  function handleRoomCreated(room: Room) {
    setRooms(prev => [...prev, room]);
  }

  if (activeRoom) {
    return <RoomView room={activeRoom} onBack={() => setActiveRoom(null)} />;
  }

  return (
    <div>
      <h1>Vibe Check - Admin</h1>
      <CreateRoomForm onRoomCreated={handleRoomCreated} />
      <ul>
        {rooms.map((room) => (
          <li key={room.id}>
            <button onClick={() => setActiveRoom(room)}>
              {room.name} — code: <strong>{room.roomCode}</strong>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;