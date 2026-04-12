import { useState } from "react"
import { useNavigate } from 'react-router-dom'
import { MessageSquare, ArrowRight } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (username.trim() === '') return

    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/check-username?name=${username}`)
    const data = await res.json()

    if (data.taken) {
      setError(`"${username}" is already taken. Pick a different name.`)
      return
    }

    sessionStorage.setItem('username', username)
    navigate('/rooms')
  }

  return (
    <div className="page">
      <div className="card">
        <div className="login-logo">
          <MessageSquare size={28} color="var(--accent)" />
        </div>
        <h1>chat<span>.app</span></h1>
        <p style={{ marginBottom: '1.8rem', fontSize: '0.85rem' }}>
          Enter a username to get started
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              placeholder="who are you?"
              autoFocus
            />
            {error && (
              <p style={{ color: 'var(--accent)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                {error}
              </p>
            )}
          </div>
          <button type="submit" className="btn btn-primary">
            Enter <ArrowRight size={15} />
          </button>
        </form>
      </div>
    </div>
  )
}