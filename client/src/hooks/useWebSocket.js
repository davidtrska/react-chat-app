import { useState, useEffect, useRef } from 'react'

export function useWebSocket(url, { onOpen, onMessage } = {}) {
  // logic will go here
  const [status, setStatus] = useState('connecting')
  const wsRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)
  const shouldReconnectRef = useRef(true)
  const onOpenRef = useRef(onOpen)
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onOpenRef.current = onOpen
    onMessageRef.current = onMessage
  })

  useEffect(() => {
    function connect() {
      setStatus('connecting')
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
        setStatus('connected')
        onOpenRef.current?.(ws)
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
        onMessageRef.current?.(event)
      }
    }

    connect()

    return () => {
      shouldReconnectRef.current = false
      clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close()
    }
  }, [url])

  function send(data) {
    wsRef.current?.send(JSON.stringify(data))
  }
  return { status, send }
}
