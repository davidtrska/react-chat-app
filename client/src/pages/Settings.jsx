import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { User, Save, LogOut } from 'lucide-react'

export default function Settings() {
  const navigate = useNavigate()
  const [username, setUsername] = useState(sessionStorage.getItem('username') || '')

  function handleSave(e) {
    e.preventDefault()
    if (username.trim() === '') return
    sessionStorage.setItem('username', username)
    navigate('/rooms')
  }

  function handleLogout() {
    sessionStorage.clear()
    navigate('/')
  }

  return (
    <div className="page">
      <div className="card">
        <div className="login-logo">
          <User size={28} color="var(--accent)" />
        </div>
        <h1>settings<span> / profile</span></h1>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Display Name</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              placeholder="your name..."
            />
          </div>
          <button type="submit" className="btn btn-primary">
            <Save size={15} /> Save changes
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-danger" onClick={handleLogout}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      </div>
    </div>
  )
}