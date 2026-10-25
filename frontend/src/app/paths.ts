import { generatePath } from 'react-router'

export const paths = {
  home: '/',
  intake: '/describe',
  intakeVehicle: '/describe/vehicle',
  intakeInterests: '/describe/interests',
  signIn: '/sign-in',
  chat: '/chat',
  stories: '/stories',
  story: '/stories/:storyId?',
  marketplace: '/marketplace',
  myStory: '/my-story',
} as const

export function getStoryPath(storyId: string) {
  return generatePath(paths.story, { storyId })
}
