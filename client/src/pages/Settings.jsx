import { useNavigate } from 'react-router-dom'
import { User, Save, LogOut } from 'lucide-react'
import { jwtDecode } from 'jwt-decode'

export default function Settings() {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const username = jwtDecode(token).username

  function handleSave(e) {
    e.preventDefault()
    if (username.trim() === '') return
    navigate('/rooms')
  }

  function handleLogout() {
    localStorage.clear()
    navigate('/login')
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
              type="text"
              placeholder="your name..."
              readOnly
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