export const truncateMiddle = (
  text: string,
  maxLength: number = 20,
  startLength: number = 8,
  endLength: number = 6
): string => {
  if (!text) return ""
  if (text.length <= maxLength) return text

  return `${text.slice(0, startLength)}...${text.slice(-endLength)}`
}
