import type { IntakeDraft, LearningInterest } from '../../types/intake.ts'

const interestPhrases: Record<LearningInterest, string | null> = {
  repair: 'people who repaired their cars',
  sell: 'people who sold their cars',
  buy: 'people who bought another car',
  'not-sure': null,
}

function interestList(interests: LearningInterest[]) {
  const phrases = interests.flatMap((interest) => {
    const phrase = interestPhrases[interest]
    return phrase ? [phrase] : []
  })
  if (phrases.length === 0) return null
  if (phrases.length === 1) return phrases[0]
  return `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`
}

export function openingMessage(draft: IntakeDraft) {
  const question = draft.question.trim()
  if (question) return question

  const focus = interestList(draft.interests)
  if (!focus) {
    return 'Find people who went through something similar, and show me what they decided.'
  }
  return `Find people who went through something similar. I want to hear from ${focus}.`
}
