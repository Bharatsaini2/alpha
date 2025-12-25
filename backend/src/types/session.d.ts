// Extend Express Session interface
declare module 'express-session' {
  interface SessionData {
    oauthState?: string
  }
}
