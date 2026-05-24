import { useState, useEffect, useRef } from 'react'
import { useWebSocket } from './useWebSocket'

export function useChat(roomId) {
  const token = localStorage.getItem('token')
  const url = `${import.meta.env.VITE_BACKEND_URL.replace('http', 'ws')}?token=${token}`

  const [messages, setMessages] = useState([])
  const [users, setUsers] = useState([])
  const [typingUser, setTypingUser] = useState('')
  const [joinError, setJoinError] = useState('')

  const typingTimeoutRef = useRef(null)
  const bottomRef = useRef(null)
  const isLoadingMoreRef = useRef(false)
  const hasMoreMessages = useRef(true)

  const { status, send } = useWebSocket(url, {
    onOpen: () => {
      send({ type: 'join', roomId })
    },
    onMessage: (event) => {
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
  })

  useEffect(() => {
    if (isLoadingMoreRef.current === false) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    isLoadingMoreRef.current = false
  }, [messages])

  function sendMessage(text) {
    send({ type: 'message', roomId, text })
    send({ type: 'typing', roomId, isTyping: false })
    clearTimeout(typingTimeoutRef.current)
  }

  function sendReaction(msgId, emoji) {
    send({ type: 'reaction', messageId: msgId, emoji, roomId })
  }

  function sendTyping() {
    send({ type: 'typing', roomId, isTyping: true })
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      send({ type: 'typing', roomId, isTyping: false })
    }, 1000)
  }

  function handleScroll(e) {
    if (e.target.scrollTop === 0 && messages.length > 0 && hasMoreMessages.current === true) {
      send({
        type: 'load-more-messages',
        roomId,
        before: messages[0].id
      })
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
