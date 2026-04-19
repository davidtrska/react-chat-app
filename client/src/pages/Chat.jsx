import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Hash } from "lucide-react";
import { jwtDecode } from 'jwt-decode'


export default function Chat() {
  const { roomId } = useParams();
  const token = localStorage.getItem('token')
  const username = jwtDecode(token).username
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typingUser, setTypingUser] = useState("");
  const [users, setUsers] = useState([]);
  const [joinError, setJoinError] = useState("");

  // NEW — tracks which message's picker is open, by message ID
  // null = all pickers closed. storing an ID (not just true/false) lets us
  // know exactly WHICH message to show the picker on.
  const [openPickerId, setOpenPickerId] = useState(null);

  // NEW — the emoji options shown in the picker
  const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥','🎃'];

  // NEW — maximum allowed characters in a single message
  const MAX_CHARS = 200;

  // NEW — derived value, no new state needed
  // we already have 'input' in state, so input.length gives us the count for free
  // every time 'input' changes (every keystroke), this recalculates automatically
  const charCount = input.length;

  const wsRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_BACKEND_URL.replace('http', 'ws');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", username, roomId }));
    };

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);

      if (event.type === "joined") {
        setMessages(event.history);
        setUsers(event.users);
      }
      if (event.type === "message") {
        setMessages((prev) => [...prev, event]);
      }
      if (event.type === "typing") {
        setTypingUser(event.isTyping ? event.username : "");
      }
      if (event.type === "presence") {
        setUsers(event.users);
      }
      if (event.type === 'reaction') {
        setMessages(prev => prev.map(msg =>
          msg.id === event.messageId
            ? { ...msg, reactions: event.reactions }
            : msg
        ))
      }
      if (event.type === "error") {
        setJoinError(event.message);
      }
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(e) {
    e.preventDefault();
    if (input.trim() === "") return;
    // NEW — safety net: block sending if over the limit
    // the button is already disabled in JSX, but this covers edge cases
    if (charCount > MAX_CHARS) return;
    wsRef.current.send(JSON.stringify({ type: "message", roomId, text: input }));
    wsRef.current.send(JSON.stringify({ type: "typing", roomId, isTyping: false }));
    clearTimeout(typingTimeoutRef.current);
    setInput("");
  }

  function handleReaction(msgId, emoji) {
    wsRef.current.send(JSON.stringify({ type: 'reaction', messageId: msgId, emoji, roomId }))
  }

  function handleTyping() {
    wsRef.current.send(JSON.stringify({ type: "typing", roomId, isTyping: true }));
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      wsRef.current.send(JSON.stringify({ type: "typing", roomId, isTyping: false }));
    }, 1000);
  }

  function formatTime(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (joinError) {
    return (
      <div className="page">
        <div className="card">
          <h1>oops<span>.</span></h1>
          <p style={{ marginBottom: '1.5rem' }}>{joinError}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Pick a different name
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
            <button className="btn btn-ghost" onClick={() => navigate("/rooms")}>
              <ArrowLeft size={14} /> back
            </button>
            <span className="chat-room-name">
              <Hash size={13} style={{ marginRight: "2px", opacity: 0.5 }} />
              {roomId}
            </span>
          </div>
          <span className="chat-user">{username}</span>
        </div>

        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.username === username ? 'message-own' : ''}`}>
              <span className="message-username">{msg.username}</span>
              <span className="message-text">{msg.text}</span>
              <span className="message-ts">{formatTime(msg.ts)}</span>

              <div className="message-reactions">
                {Object.entries(msg.reactions || {}).map(([emoji, users]) => (
                  <button
                    key={emoji}
                    className={`reaction-btn ${users.includes(username) ? 'reacted' : ''}`}
                    onClick={() => handleReaction(msg.id, emoji)}
                  >
                    {emoji} {users.length}
                  </button>
                ))}

                {/* NEW — wrapper needed so the picker can be positioned relative to the + button */}
                <div className="emoji-picker-wrapper">

                  {/* CHANGED — was: onClick sends 👍 directly
                               now: toggles the picker open/closed
                      toggle logic: if this message's picker is open → close it (null)
                                    if it's closed → open it (store this message's id) */}
                  <button
                    className="reaction-add"
                    onClick={() => setOpenPickerId(openPickerId === msg.id ? null : msg.id)}
                  >
                    +
                  </button>

                  {/* NEW — only renders when openPickerId matches this message's id
                      all other messages render nothing here */}
                  {openPickerId === msg.id && (
                    <div className="emoji-picker">
                      {/* NEW — loop the EMOJIS array, one button per emoji */}
                      {EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          className="emoji-option"
                          onClick={() => {
                            handleReaction(msg.id, emoji); // send the chosen reaction
                            setOpenPickerId(null);          // close the picker
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

        <div className="typing-indicator">
          {typingUser ? `${typingUser} is typing...` : ""}
        </div>

        <div className="chat-input-area">
          <form className="chat-input-form" onSubmit={handleSend}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleTyping}
              placeholder={`message # ${roomId}`}
              autoFocus
            />
            {/* CHANGED — disabled when over the limit so the user can't submit */}
            <button type="submit" className="btn" disabled={charCount > MAX_CHARS}>
              <Send size={15} />
            </button>
          </form>

          {/* NEW — only show the counter when the user has started typing
              charCount > 0 → show it,  charCount === 0 → show nothing

              dynamic className controls the color:
                default              → muted grey  (just started typing)
                charCount > 160      → orange       (getting close)
                charCount > MAX_CHARS → red         (over the limit)

              note: the conditions are checked left to right.
              the last matching one wins, so over-limit (red) overrides warn (orange) */}
          {charCount > 0 && (
            <div className={`char-count ${charCount > MAX_CHARS ? 'char-count-over' : charCount > 160 ? 'char-count-warn' : ''}`}>
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
  );
}
