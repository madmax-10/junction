import { createContext, useContext } from 'react'
import type { ChatImage, ChatMessage } from '../../types/chat.ts'

export type ChatContextValue = {
  messages: ChatMessage[]
  isResponding: boolean
  sendMessage: (text: string, images?: ChatImage[]) => void
  resetChat: () => void
}

export const ChatContext = createContext<ChatContextValue | null>(null)

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within ChatProvider')
  }
  return context
}
