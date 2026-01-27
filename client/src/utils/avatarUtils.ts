/**
 * Avatar utility functions for managing user profile avatars
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
 * Get avatar URL for a user
 * If user has an avatar, use it; otherwise return default
 */
export const getUserAvatarUrl = (userAvatar?: string): string => {
  if (userAvatar) {
    return userAvatar
  }
  return '/profile-usr.png' // Fallback to default
}

/**
 * Get all available avatars
 */
export const getAvailableAvatars = (): string[] => {
  return AVAILABLE_AVATARS
}
