import { useNavigate } from 'react-router-dom'
import { User, Save, LogOut } from 'lucide-react'
import { jwtDecode } from 'jwt-decode'
import { useState } from 'react'

export default function Settings() {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const username = jwtDecode(token).username
  const [name, setName] = useState(username)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (name.trim() === '') {
      setError('Name cannot be empty')
      return
    }

    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ username: name.trim() })
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      return
    }

    localStorage.setItem('token', data.token)
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
        <h1>
          settings<span> / profile</span>
        </h1>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Display Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              placeholder="your name..."
            />
          </div>

          {error && (
            <p style={{ color: 'var(--accent)', fontSize: '0.85rem', marginBottom: '0.8rem' }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary">
            <Save size={15} /> Save changes
          </button>
        </form>

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid var(--border)'
          }}
        >
          <button className="btn btn-danger" onClick={handleLogout}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      </div>
    </div>
  )
}
