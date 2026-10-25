import { createContext, useContext } from 'react'
import type { ChatImage, ChatMessage } from '../../types/chat.ts'

export type ChatContextValue = {
  messages: ChatMessage[]
  isResponding: boolean
  isRestoring: boolean
  // `hiddenNote` reaches the assistant but is not shown in the conversation.
  sendMessage: (text: string, images?: ChatImage[], hiddenNote?: string) => void
  confirmSuggestion: (messageId: string, suggestionId: string) => void
  dismissSuggestion: (messageId: string, suggestionId: string) => void
  resetChat: () => void
}

type AssistantChatMessage = Extract<ChatMessage, { role: 'assistant' }>

export const ChatContext = createContext<ChatContextValue | null>(null)

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within ChatProvider')
  }
  return context
}

export function useLatestReply() {
  const { messages } = useChat()
  return messages.findLast((message): message is AssistantChatMessage => message.role === 'assistant')
}
