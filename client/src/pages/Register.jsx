import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, ArrowRight } from 'lucide-react'

export default function Register() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (username.trim() === '') return

    if (password !== repeatPassword) {
      setError('Passwords do not match')
      return
    }

    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json()

    if (data.error) {
      setError(data.error)
      return
    }

    localStorage.setItem('token', data.token)
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
          Create an account to get started
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
            <label>Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="something secret..."
            />
            <label>Repeat Password</label>
            <input
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              type="password"
              placeholder="same thing again..."
            />
            {error && (
              <p style={{ color: 'var(--accent)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                {error}
              </p>
            )}
          </div>
          <button type="submit" className="btn btn-primary">
            Register <ArrowRight size={15} />
          </button>
          <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.8rem' }}>
            Already have an account?{' '}
            <span
              style={{ color: 'var(--accent)', cursor: 'pointer' }}
              onClick={() => navigate('/login')}
            >
              Log in
            </span>
          </p>
        </form>
      </div>
    </div>
  )
}
