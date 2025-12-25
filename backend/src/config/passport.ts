import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as TwitterStrategy } from 'passport-twitter-oauth2'
import { User } from '../models/user.model'
import { UserAuthMethod } from '../models/userAuthMethod.model'
import { generateTokenPair, hashRefreshToken } from '../utils/jwt'
import { UserSession } from '../models/userSession.model'
import dotenv from 'dotenv'
dotenv.config()

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL ||
          `${process.env.SERVER_URL || 'http://localhost:9090'}/api/v1/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log('🔍 Google OAuth profile:', profile)

          // Extract user data from Google profile
          const googleId = profile.id
          const email = profile.emails?.[0]?.value
          const displayName = profile.displayName
          const profilePicture = profile.photos?.[0]?.value

          if (!email) {
            return done(
              new Error('No email found in Google profile'),
              undefined,
            )
          }

          // Check if user already exists with this Google account
          let existingAuthMethod = await UserAuthMethod.findOne({
            authType: 'google',
            providerId: googleId,
          })

          if (existingAuthMethod) {
            // User exists, update last login
            const user = await User.findById(existingAuthMethod.userId)
            if (user) {
              user.lastLogin = new Date()
              await user.save()

              // Update auth method data
              existingAuthMethod.providerData = {
                ...existingAuthMethod.providerData,
                accessToken,
                refreshToken,
                profilePicture,
              }
              await existingAuthMethod.save()

              return done(null, { user, authMethod: existingAuthMethod })
            }
          }

          // Check if user exists with same email
          let user = await User.findOne({ email })

          if (user) {
            // User exists with email, link Google account
            const authMethod = await UserAuthMethod.findOneAndUpdate(
              { userId: user._id, authType: 'google', providerId: googleId },
              {
                userId: user._id,
                authType: 'google',
                providerId: googleId,
                providerData: {
                  providerUserId: googleId,
                  accessToken,
                  refreshToken,
                  profilePicture,
                },
                isPrimary: false, // Don't make it primary if user has other auth methods
              },
              { upsert: true, new: true },
            )

            user.lastLogin = new Date()
            await user.save()

            return done(null, { user, authMethod })
          }

          // Create new user
          user = new User({
            email,
            emailVerified: true,
            displayName,
            avatar: profilePicture,
          })
          await user.save()

          // Create auth method
          const authMethod = new UserAuthMethod({
            userId: user._id,
            authType: 'google',
            providerId: googleId,
            providerData: {
              providerUserId: googleId,
              accessToken,
              refreshToken,
              profilePicture,
            },
            isPrimary: true,
          })
          await authMethod.save()

          return done(null, { user, authMethod })
        } catch (error) {
          console.error('❌ Google OAuth error:', error)
          return done(error, undefined)
        }
      },
    ),
  )
} else {
  console.warn(
    '⚠️ Google OAuth credentials not found. Google authentication disabled.',
  )
}

// Twitter OAuth 2.0 Strategy with PKCE
if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
  passport.use(
    new TwitterStrategy(
      {
        clientID: process.env.TWITTER_CLIENT_ID,
        clientSecret: process.env.TWITTER_CLIENT_SECRET,
        callbackURL:
          process.env.TWITTER_CALLBACK_URL ||
          `${process.env.SERVER_URL || 'http://localhost:9090'}/api/v1/auth/twitter/callback`,
        scope: ['users.read', 'tweet.read', 'offline.access'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log('🔍 Twitter OAuth profile:', profile)

          // Extract user data from Twitter profile
          const twitterId = profile.id
          const username = profile.username || profile.displayName
          const displayName = profile.displayName || profile.username
          const profilePicture = profile.photos?.[0]?.value
          // Note: Twitter OAuth 2.0 doesn't provide email by default
          // Email access requires special approval from Twitter
          const email = undefined

          console.log('Twitter profile data:', {
            id: twitterId,
            username,
            displayName,
            email,
            profilePicture,
          })

          if (!twitterId) {
            return done(new Error('No Twitter ID found in profile'), undefined)
          }

          // Check if user already exists with this Twitter account
          let existingAuthMethod = await UserAuthMethod.findOne({
            authType: 'twitter',
            providerId: twitterId,
          })

          if (existingAuthMethod) {
            // User exists, update last login
            const user = await User.findById(existingAuthMethod.userId)
            if (user) {
              user.lastLogin = new Date()
              await user.save()

              // Update auth method data
              existingAuthMethod.providerData = {
                ...existingAuthMethod.providerData,
                providerUserId: twitterId,
                accessToken,
                refreshToken,
                profilePicture,
              }
              await existingAuthMethod.save()

              return done(null, { user, authMethod: existingAuthMethod })
            }
          }

          // Create new user (Twitter may not provide email)
          const user = new User({
            displayName: displayName || username,
            avatar: profilePicture,
            email: email || undefined, // Only set if email is available
          })
          await user.save()

          // Create auth method
          const authMethod = new UserAuthMethod({
            userId: user._id,
            authType: 'twitter',
            providerId: twitterId,
            providerData: {
              providerUserId: twitterId,
              accessToken,
              refreshToken,
              profilePicture,
            },
            isPrimary: true,
          })
          await authMethod.save()

          return done(null, { user, authMethod })
        } catch (error) {
          console.error('❌ Twitter OAuth error:', error)
          return done(error, null)
        }
      },
    ),
  )
} else {
  console.warn(
    '⚠️ Twitter OAuth credentials not found. Twitter authentication disabled.',
  )
}

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user)
})

// Deserialize user from session
passport.deserializeUser((user: any, done) => {
  done(null, user)
})

export default passport
