import { useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { Hash, Plus, Settings, ArrowRight } from 'lucide-react'
import { jwtDecode } from 'jwt-decode'

export default function Rooms() {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const username = jwtDecode(token).username
  const [newRoom, setNewRoom] = useState("")
  const [rooms, setRooms] =  useState([])

    useEffect(() => {
      async function loadRooms() {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/rooms`, {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
        });
        const data = await res.json();
        setRooms(data.rooms);
      }
      loadRooms();
    }, []);

  function handleSubmit(e) {
    e.preventDefault()
    if (newRoom.trim() === "") return
    setRooms([...rooms, newRoom])
    setNewRoom("")
  }

  return (
    <div className="rooms-page">
      <div className="rooms-header">
        <h1>rooms<span> / {username}</span></h1>
        <button className="btn btn-ghost" onClick={() => navigate('/settings')}>
          <Settings size={14} /> settings
        </button>
      </div>

      <div className="rooms-list">
        {rooms.map((room) => (
          <button
            key={room}
            className="room-item"
            onClick={() => navigate(`/chat/${room}`)}
          >
            <span className="room-name">
              <Hash size={13} style={{ marginRight: '0.4rem', opacity: 0.5 }} />
              {room}
            </span>
            <ArrowRight size={15} className="room-arrow" />
          </button>
        ))}
      </div>

      <div className="create-room">
        <h2><Plus size={11} style={{ marginRight: '0.3rem' }} />New Room</h2>
        <form className="create-room-form" onSubmit={handleSubmit}>
          <input
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            type="text"
            placeholder="room name..."
          />
          <button type="submit" className="btn">
            <Plus size={15} /> Create
          </button>
        </form>
      </div>
    </div>
  )
}