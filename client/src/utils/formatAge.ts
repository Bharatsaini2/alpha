import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

export const formatAge = (age: Date | string | null | undefined): string => {
  // Handle null, undefined, or invalid dates
  if (age === null || age === undefined || age === "Unknown") return "NA"

  let ageDate: Date

  // Convert string to Date if needed
  if (typeof age === "string") {
    ageDate = new Date(age)
  } else {
    ageDate = age
  }

  // Check if date is valid
  if (isNaN(ageDate.getTime())) {
    return "NA"
  }

  // Use IST timezone for consistent time calculation
  const now = dayjs().tz("Asia/Kolkata")
  const ageDayjs = dayjs(ageDate).tz("Asia/Kolkata")
  const diffInMs = now.diff(ageDayjs, "ms")

  // If the date is in the future (shouldn't happen for token creation), return "Unknown"
  if (diffInMs < 0) {
    return "NA"
  }

  // Convert milliseconds to different time units
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
  const diffInMonths = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 30))
  const diffInYears = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 365))

  // Format based on the largest unit
  if (diffInYears > 0) {
    return `${diffInYears}y`
  } else if (diffInMonths > 0) {
    return `${diffInMonths}mo`
  } else if (diffInDays > 0) {
    return `${diffInDays}d`
  } else if (diffInHours > 0) {
    return `${diffInHours}h`
  } else if (diffInMinutes > 0) {
    return `${diffInMinutes}m`
  } else {
    return "<1m"
  }
}

/**
 * Formats age with more precision for very recent tokens
 * @param age - Date object representing when the token was created
 * @returns Formatted age string with seconds for very recent tokens
 */
export const formatAgeDetailed = (
  age: Date | string | null | undefined
): string => {
  // Handle null, undefined, or invalid dates
  if (!age) return "NA"

  let ageDate: Date

  // Convert string to Date if needed
  if (typeof age === "string") {
    ageDate = new Date(age)
  } else {
    ageDate = age
  }

  // Check if date is valid
  if (isNaN(ageDate.getTime())) {
    return "NA"
  }

  // Use IST timezone for consistent time calculation
  const now = dayjs().tz("Asia/Kolkata")
  const ageDayjs = dayjs(ageDate).tz("Asia/Kolkata")
  const diffInMs = now.diff(ageDayjs, "ms")

  // If the date is in the future (shouldn't happen for token creation), return "Unknown"
  if (diffInMs < 0) {
    return "NA"
  }

  // Convert milliseconds to different time units
  const diffInSeconds = Math.floor(diffInMs / 1000)
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
  const diffInMonths = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 30))
  const diffInYears = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 365))

  // Format based on the largest unit
  if (diffInYears > 0) {
    return `${diffInYears}y`
  } else if (diffInMonths > 0) {
    return `${diffInMonths}mo`
  } else if (diffInDays > 0) {
    return `${diffInDays}d`
  } else if (diffInHours > 0) {
    return `${diffInHours}h`
  } else if (diffInMinutes > 0) {
    return `${diffInMinutes}m`
  } else if (diffInSeconds > 0) {
    return `${diffInSeconds}s`
  } else {
    return "<1s"
  }
}

/**
 * Formats age with full descriptive text
 * @param age - Date object representing when the token was created
 * @returns Full descriptive age string (e.g., "1 minute ago", "5 hours ago", "1 day ago")
 */
export const formatAgeFull = (
  age: Date | string | null | undefined
): string => {
  // Handle null, undefined, or invalid dates
  if (!age) return "NA"

  let ageDate: Date

  // Convert string to Date if needed
  if (typeof age === "string") {
    ageDate = new Date(age)
  } else {
    ageDate = age
  }

  // Check if date is valid
  if (isNaN(ageDate.getTime())) {
    return "NA"
  }

  // Use IST timezone for consistent time calculation
  const now = dayjs().tz("Asia/Kolkata")
  const ageDayjs = dayjs(ageDate).tz("Asia/Kolkata")
  const diffInMs = now.diff(ageDayjs, "ms")

  // If the date is in the future (shouldn't happen for token creation), return "Unknown"
  if (diffInMs < 0) {
    return "NA"
  }

  // Convert milliseconds to different time units
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
  const diffInMonths = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 30))
  const diffInYears = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 365))

  // Format based on the largest unit
  if (diffInYears > 0) {
    return `${diffInYears} year${diffInYears > 1 ? "s" : ""} ago`
  } else if (diffInMonths > 0) {
    return `${diffInMonths} month${diffInMonths > 1 ? "s" : ""} ago`
  } else if (diffInDays > 0) {
    return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`
  } else if (diffInHours > 0) {
    return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`
  } else if (diffInMinutes > 0) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? "s" : ""} ago`
  } else {
    return "Just now"
  }
}
