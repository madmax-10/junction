import { CloudLightning, FileX, Tag, Wrench } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { ExampleQuestion } from '../../types/chat.ts'

export const exampleQuestions: (ExampleQuestion & { icon: ReactNode })[] = [
  {
    id: 'repair-estimate',
    text: 'I was rear-ended and the repair estimate is $4,800. Is it worth fixing?',
    icon: <Wrench size={18} />,
  },
  {
    id: 'total-loss-offer',
    text: 'My insurer says my car is a total loss. Is their offer fair?',
    icon: <FileX size={18} />,
  },
  {
    id: 'sell-frame-damage',
    text: 'Has anyone sold a car with frame damage? What did they get?',
    icon: <Tag size={18} />,
  },
  {
    id: 'hail-damage',
    text: 'Hail dented my whole roof. Did people repair it or move on?',
    icon: <CloudLightning size={18} />,
  },
]
