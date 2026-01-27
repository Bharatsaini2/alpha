/**
 * Avatar utility functions for backend
 */

const AVAILABLE_AVATARS = [
  '/avatars/1.JPG',
  '/avatars/2.JPG',
  '/avatars/3.JPG',
  '/avatars/4.JPG',
  '/avatars/5.JPG',
]

/**
 * Get a random avatar from the available avatars
 */
export const getRandomAvatar = (): string => {
  const randomIndex = Math.floor(Math.random() * AVAILABLE_AVATARS.length)
  return AVAILABLE_AVATARS[randomIndex]
}

/**
 * Get all available avatars
 */
export const getAvailableAvatars = (): string[] => {
  return AVAILABLE_AVATARS
}
