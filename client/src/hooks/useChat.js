import { useState, useEffect, useRef } from 'react'

export function useChat(roomId) {
  const token = localStorage.getItem('token')

  const [status, setStatus] = useState('connecting')
  const [messages, setMessages] = useState([])
  const [typingUser, setTypingUser] = useState('')
  const [users, setUsers] = useState([])
  const [joinError, setJoinError] = useState('')

  const wsRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const bottomRef = useRef(null)
  const isLoadingMoreRef = useRef(false)
  const hasMoreMessages = useRef(true)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)
  const shouldReconnectRef = useRef(true)

  useEffect(() => {
    function connect() {
      setStatus('connecting')
      const ws = new WebSocket(
        `${import.meta.env.VITE_BACKEND_URL.replace('http', 'ws')}?token=${token}`
      )
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
        ws.send(JSON.stringify({ type: 'join', roomId }))
        setStatus('connected')
      }

      ws.onclose = () => {
        if (!shouldReconnectRef.current) return
        const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000)
        reconnectAttemptsRef.current++
        reconnectTimeoutRef.current = setTimeout(connect, delay)
        setStatus('reconnecting')
      }

      ws.onmessage = (e) => {
        const event = JSON.parse(e.data)

        if (event.type === 'joined') {
          setMessages(event.history)
          setUsers(event.users)
        }
        if (event.type === 'message') {
          setMessages((prev) => [...prev, event])
        }
        if (event.type === 'typing') {
          setTypingUser(event.isTyping ? event.username : '')
        }
        if (event.type === 'presence') {
          setUsers(event.users)
        }
        if (event.type === 'reaction') {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === event.messageId ? { ...msg, reactions: event.reactions } : msg
            )
          )
        }
        if (event.type === 'more-messages') {
          isLoadingMoreRef.current = true
          setMessages((prev) => [...event.messages, ...prev])
          if (event.messages.length === 0) {
            hasMoreMessages.current = false
          }
        }
        if (event.type === 'error') {
          setJoinError(event.message)
        }
      }
    }

    connect()

    return () => {
      shouldReconnectRef.current = false
      clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close()
    }
  }, [])

  useEffect(() => {
    if (isLoadingMoreRef.current === false) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    isLoadingMoreRef.current = false
  }, [messages])

  function sendMessage(text) {
    wsRef.current.send(JSON.stringify({ type: 'message', roomId, text }))
    wsRef.current.send(JSON.stringify({ type: 'typing', roomId, isTyping: false }))
    clearTimeout(typingTimeoutRef.current)
  }

  function sendReaction(msgId, emoji) {
    wsRef.current.send(JSON.stringify({ type: 'reaction', messageId: msgId, emoji, roomId }))
  }

  function sendTyping() {
    wsRef.current.send(JSON.stringify({ type: 'typing', roomId, isTyping: true }))
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      wsRef.current.send(JSON.stringify({ type: 'typing', roomId, isTyping: false }))
    }, 1000)
  }

  function handleScroll(e) {
    if (e.target.scrollTop === 0 && messages.length > 0 && hasMoreMessages.current === true) {
      wsRef.current.send(
        JSON.stringify({
          type: 'load-more-messages',
          roomId,
          before: messages[0].id
        })
      )
    }
  }

  return {
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
  }
}
