import React from 'react'
import { createRoot } from 'react-dom/client'
import ChatPage from './pages/chat'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChatPage />
  </React.StrictMode>
)


