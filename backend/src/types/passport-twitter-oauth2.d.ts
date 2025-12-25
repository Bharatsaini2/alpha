declare module 'passport-twitter-oauth2' {
  import { Strategy } from 'passport'

  interface TwitterOAuth2StrategyOptions {
    clientID: string
    clientSecret: string
    callbackURL: string
    scope?: string[]
  }

  interface TwitterProfile {
    id: string
    username?: string
    displayName?: string
    photos?: Array<{ value: string }>
  }

  export class Strategy extends Strategy {
    constructor(
      options: TwitterOAuth2StrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: TwitterProfile,
        done: (error: any, user?: any) => void,
      ) => void,
    )

    authenticate(req: any, options?: any): any
  }
}
