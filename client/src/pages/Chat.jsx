import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ArrowLeft, Send, Hash } from 'lucide-react'
import { jwtDecode } from 'jwt-decode'
import { useChat } from '../hooks/useChat'

export default function Chat() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const username = jwtDecode(token).username

  const {
    status,
    messages,
    users,
    typingUser,
    joinError,
    bottomRef,
    sendMessage,
    sendReaction,
    sendTyping,
    handleScroll
  } = useChat(roomId)

  // UI-only state
  const [input, setInput] = useState('')
  const [openPickerId, setOpenPickerId] = useState(null)

  const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎃']
  const MAX_CHARS = 200
  const charCount = input.length

  function handleSend(e) {
    e.preventDefault()
    if (input.trim() === '') return
    if (charCount > MAX_CHARS) return
    sendMessage(input)
    setInput('')
  }

  function formatTime(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (joinError) {
    return (
      <div className="page">
        <div className="card">
          <h1>
            oops<span>.</span>
          </h1>
          <p style={{ marginBottom: '1.5rem' }}>{joinError}</p>
          <button className="btn btn-primary" onClick={() => navigate('/rooms')}>
            Back to rooms
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-page">
      <div className="chat-main">
        <div className="chat-header">
          <div className="chat-header-left">
            <button className="btn btn-ghost" onClick={() => navigate('/rooms')}>
              <ArrowLeft size={14} /> back
            </button>
            <span className={`status-${status}`}>{status}</span>
            <span className="chat-room-name">
              <Hash size={13} style={{ marginRight: '2px', opacity: 0.5 }} />
              {roomId}
            </span>
          </div>
          <span className="chat-user">{username}</span>
        </div>

        <div className="chat-messages" onScroll={handleScroll}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`message ${msg.username === username ? 'message-own' : ''}`}
            >
              <span className="message-username">{msg.username}</span>
              <span className="message-text">{msg.text}</span>
              <span className="message-ts">{formatTime(msg.ts)}</span>

              <div className="message-reactions">
                {Object.entries(msg.reactions || {}).map(([emoji, reactedUsers]) => (
                  <button
                    key={emoji}
                    className={`reaction-btn ${reactedUsers.includes(username) ? 'reacted' : ''}`}
                    onClick={() => sendReaction(msg.id, emoji)}
                  >
                    {emoji} {reactedUsers.length}
                  </button>
                ))}

                <div className="emoji-picker-wrapper">
                  <button
                    className="reaction-add"
                    onClick={() => setOpenPickerId(openPickerId === msg.id ? null : msg.id)}
                  >
                    +
                  </button>

                  {openPickerId === msg.id && (
                    <div className="emoji-picker">
                      {EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          className="emoji-option"
                          onClick={() => {
                            sendReaction(msg.id, emoji)
                            setOpenPickerId(null)
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="typing-indicator">{typingUser ? `${typingUser} is typing...` : ''}</div>

        <div className="chat-input-area">
          <form className="chat-input-form" onSubmit={handleSend}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={sendTyping}
              placeholder={`message # ${roomId}`}
              autoFocus
            />
            <button type="submit" className="btn" disabled={charCount > MAX_CHARS}>
              <Send size={15} />
            </button>
          </form>

          {charCount > 0 && (
            <div
              className={`char-count ${charCount > MAX_CHARS ? 'char-count-over' : charCount > 160 ? 'char-count-warn' : ''}`}
            >
              {charCount}/{MAX_CHARS}
            </div>
          )}
        </div>
      </div>

      <div className="chat-sidebar">
        <h2>Online — {users.length}</h2>
        {users.map((user) => (
          <div key={user} className="user-item">
            <span className="user-dot" />
            {user}
          </div>
        ))}
      </div>
    </div>
  )
}
