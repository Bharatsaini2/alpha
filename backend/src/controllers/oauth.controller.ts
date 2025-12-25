import { Request, Response } from 'express'
import passport from 'passport'
import { generateTokenPair, hashRefreshToken } from '../utils/jwt'
import { UserSession } from '../models/userSession.model'
import { User } from '../models/user.model'
import { UserAuthMethod } from '../models/userAuthMethod.model'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import crypto from 'crypto'
import dotenv from 'dotenv'
dotenv.config()

// Extend Request interface to include session
interface RequestWithSession extends Request {
  session: any
}

// Google OAuth routes
export const googleAuth = catchAsyncErrors(
  async (req: RequestWithSession, res: Response) => {
    // Generate state parameter for CSRF protection
    const state = Math.random().toString(36).substring(2, 15)

    // Store state in session or memory for verification
    req.session = req.session || {}
    req.session.oauthState = state

    // Redirect to Google OAuth
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(process.env.GOOGLE_CALLBACK_URL || `${process.env.SERVER_URL || 'https://app.alpha-block.ai'}/api/v1/auth/google/callback`)}&` +
      `scope=openid%20email%20profile&` +
      `response_type=code&` +
      `state=${state}`

    res.redirect(authUrl)
  },
)

export const googleCallback = catchAsyncErrors(
  async (req: RequestWithSession, res: Response) => {
    try {
      // Verify state parameter
      if (req.query.state !== req.session?.oauthState) {
        return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0;
              background: #f0f0f0;
            }
            .error { 
              background: white; 
              padding: 20px; 
              border-radius: 8px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
              color: #d32f2f;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ Authentication Failed</h2>
            <p>Invalid state parameter</p>
          </div>
            <script>
              try {
                console.log('Sending OAuth error message to parent window');
                window.opener.postMessage({ 
                  success: false, 
                  error: 'Invalid state parameter' 
                }, '*');
              } catch (error) {
                console.error('Failed to send message to parent:', error);
              }
              setTimeout(() => window.close(), 2000);
            </script>
        </body>
        </html>
      `)
      }

      // Use passport to handle OAuth callback
      passport.authenticate('google', async (err: any, result: any) => {
        if (err) {
          console.error('❌ Google OAuth error:', err)
          return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                margin: 0;
                background: #f0f0f0;
              }
              .error { 
                background: white; 
                padding: 20px; 
                border-radius: 8px; 
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                text-align: center;
                color: #d32f2f;
              }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>❌ Authentication Failed</h2>
              <p>Authentication failed</p>
            </div>
            <script>
              try {
                console.log('Sending OAuth error message to parent window');
                window.opener.postMessage({ 
                  success: false, 
                  error: 'Authentication failed' 
                }, '*');
              } catch (error) {
                console.error('Failed to send message to parent:', error);
              }
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
          </html>
        `)
        }

        if (!result || !result.user) {
          return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                margin: 0;
                background: #f0f0f0;
              }
              .error { 
                background: white; 
                padding: 20px; 
                border-radius: 8px; 
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                text-align: center;
                color: #d32f2f;
              }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>❌ Authentication Failed</h2>
              <p>No user data received</p>
            </div>
            <script>
              try {
                console.log('Sending OAuth error message to parent window');
                window.opener.postMessage({ 
                  success: false, 
                  error: 'No user data received' 
                }, '*');
              } catch (error) {
                console.error('Failed to send message to parent:', error);
              }
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
          </html>
        `)
        }

        const { user, authMethod } = result

        // Generate tokens
        const tokenPayload = {
          userId: user._id.toString(),
          email: user.email,
          authType: 'google' as const,
        }

        const { accessToken, refreshToken } = generateTokenPair(tokenPayload)

        // Hash and store refresh token
        const refreshTokenHash = await hashRefreshToken(refreshToken)
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

        await UserSession.create({
          userId: user._id,
          refreshTokenHash,
          deviceInfo: {
            userAgent: req.get('User-Agent'),
          },
          ipAddress: req.ip,
          expiresAt,
        })

        // Check if this is a mobile redirect (no window.opener)
        const userAgent = req.get('User-Agent') || ''
        const isMobile =
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            userAgent,
          )

        // For mobile, redirect back to frontend with tokens in URL params
        if (isMobile) {
          // Set refresh token as httpOnly cookie for mobile
          res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          })

          const frontendUrl =
            process.env.FRONTEND_URL || 'http://localhost:5173'
          const redirectUrl = `${frontendUrl}/auth/callback?success=true&token=${accessToken}&refresh=${refreshToken}&userId=${user._id}`
          return res.redirect(redirectUrl)
        }

        // Desktop: Send success response to popup
        res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Success</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0;
              background: #f0f0f0;
            }
            .success { 
              background: white; 
              padding: 20px; 
              border-radius: 8px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="success">
            <h2>✅ Authentication Successful!</h2>
            <p>You can now close this window.</p>
          </div>
          <script>
            try {
              console.log('Sending OAuth success message to parent window');
              window.opener.postMessage({ 
                success: true, 
                data: {
                  user: {
                    id: '${user._id}',
                    email: '${user.email || ''}',
                    emailVerified: ${user.emailVerified || false},
                    walletAddress: '${user.walletAddress || ''}',
                    displayName: '${user.displayName || ''}',
                    avatar: '${user.avatar || ''}',
                  },
                  accessToken: '${accessToken}',
                  refreshToken: '${refreshToken}'
                }
              }, '*');
            } catch (error) {
              console.error('Failed to send message to parent:', error);
            }
            
            // Close window after a short delay
            setTimeout(() => {
              window.close();
            }, 1000);
          </script>
        </body>
        </html>
      `)
      })(req, res)
    } catch (error) {
      console.error('❌ Google callback error:', error)
      res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Error</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            margin: 0;
            background: #f0f0f0;
          }
          .error { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
            color: #d32f2f;
          }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>❌ Authentication Error</h2>
          <p>Internal server error</p>
        </div>
            <script>
              try {
                console.log('Sending OAuth error message to parent window');
                window.opener.postMessage({ 
                  success: false, 
                  error: 'Internal server error' 
                }, '*');
              } catch (error) {
                console.error('Failed to send message to parent:', error);
              }
              setTimeout(() => window.close(), 2000);
            </script>
      </body>
      </html>
    `)
    }
  },
)

// Twitter OAuth routes with PKCE
export const twitterAuth = catchAsyncErrors(
  async (req: RequestWithSession, res: Response) => {
    // Generate PKCE parameters
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')

    // Generate state parameter for CSRF protection
    const state = Math.random().toString(36).substring(2, 15)

    // Store state and code verifier in session
    req.session = req.session || {}
    req.session.oauthState = state
    req.session.codeVerifier = codeVerifier

    // Redirect to Twitter OAuth 2.0 with PKCE
    const authUrl =
      `https://twitter.com/i/oauth2/authorize?` +
      `response_type=code&` +
      `client_id=${process.env.TWITTER_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(process.env.TWITTER_CALLBACK_URL || `${process.env.SERVER_URL || 'https://app.alpha-block.ai'}/api/v1/auth/twitter/callback`)}&` +
      `scope=users.read%20tweet.read%20offline.access&` +
      `state=${state}&` +
      `code_challenge=${codeChallenge}&` +
      `code_challenge_method=S256`

    res.redirect(authUrl)
  },
)

export const twitterCallback = catchAsyncErrors(
  async (req: RequestWithSession, res: Response) => {
    try {
      console.log('🔍 Twitter OAuth callback received:', {
        query: req.query,
        state: req.session?.oauthState,
        codeVerifier: req.session?.codeVerifier ? 'present' : 'missing',
      })

      // Verify state parameter
      if (req.query.state !== req.session?.oauthState) {
        console.error('❌ State parameter mismatch')
        return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0;
              background: #f0f0f0;
            }
            .error { 
              background: white; 
              padding: 20px; 
              border-radius: 8px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
              color: #d32f2f;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ Authentication Failed</h2>
            <p>Invalid state parameter</p>
          </div>
            <script>
              try {
                console.log('Sending OAuth error message to parent window');
                window.opener.postMessage({ 
                  success: false, 
                  error: 'Invalid state parameter' 
                }, '*');
              } catch (error) {
                console.error('Failed to send message to parent:', error);
              }
              setTimeout(() => window.close(), 2000);
            </script>
        </body>
        </html>
      `)
      }

      const { code } = req.query
      if (!code) {
        console.error('❌ No authorization code received')
        return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0;
              background: #f0f0f0;
            }
            .error { 
              background: white; 
              padding: 20px; 
              border-radius: 8px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
              color: #d32f2f;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ Authentication Failed</h2>
            <p>No authorization code received</p>
          </div>
            <script>
              try {
                console.log('Sending OAuth error message to parent window');
                window.opener.postMessage({ 
                  success: false, 
                  error: 'No authorization code received' 
                }, '*');
              } catch (error) {
                console.error('Failed to send message to parent:', error);
              }
              setTimeout(() => window.close(), 2000);
            </script>
        </body>
        </html>
      `)
      }

      // Exchange authorization code for access token using PKCE
      // Twitter OAuth 2.0 requires Basic Authentication with client credentials
      const clientCredentials = Buffer.from(
        `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`,
      ).toString('base64')

      const tokenResponse = await fetch(
        'https://api.twitter.com/2/oauth2/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: `Basic ${clientCredentials}`,
          },
          body: new URLSearchParams({
            code: code as string,
            grant_type: 'authorization_code',
            redirect_uri:
              process.env.TWITTER_CALLBACK_URL ||
              `${process.env.SERVER_URL || 'https://app.alpha-block.ai'}/api/v1/auth/twitter/callback`,
            code_verifier: req.session?.codeVerifier || '',
          }),
        },
      )

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        console.error('❌ Token exchange failed:', {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorData,
          clientId: process.env.TWITTER_CLIENT_ID ? 'present' : 'missing',
          clientSecret: process.env.TWITTER_CLIENT_SECRET
            ? 'present'
            : 'missing',
          redirectUri:
            process.env.TWITTER_CALLBACK_URL ||
            `${process.env.SERVER_URL || 'https://app.alpha-block.ai'}/api/v1/auth/twitter/callback`,
          codeVerifier: req.session?.codeVerifier ? 'present' : 'missing',
        })
        return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0;
              background: #f0f0f0;
            }
            .error { 
              background: white; 
              padding: 20px; 
              border-radius: 8px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
              color: #d32f2f;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ Authentication Failed</h2>
            <p>Token exchange failed</p>
          </div>
            <script>
              try {
                console.log('Sending OAuth error message to parent window');
                window.opener.postMessage({ 
                  success: false, 
                  error: 'Token exchange failed' 
                }, '*');
              } catch (error) {
                console.error('Failed to send message to parent:', error);
              }
              setTimeout(() => window.close(), 2000);
            </script>
        </body>
        </html>
      `)
      }

      const tokenData = await tokenResponse.json()
      console.log('✅ Token exchange successful:', {
        token_type: tokenData.token_type,
        scope: tokenData.scope,
        expires_in: tokenData.expires_in,
        has_access_token: !!tokenData.access_token,
        has_refresh_token: !!tokenData.refresh_token,
      })

      // Get user profile using access token
      const userResponse = await fetch(
        'https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url',
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/json',
          },
        },
      )

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        console.error('❌ User profile fetch failed:', errorData)
        return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0;
              background: #f0f0f0;
            }
            .error { 
              background: white; 
              padding: 20px; 
              border-radius: 8px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
              color: #d32f2f;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ Authentication Failed</h2>
            <p>Failed to fetch user profile</p>
          </div>
            <script>
              try {
                console.log('Sending OAuth error message to parent window');
                window.opener.postMessage({ 
                  success: false, 
                  error: 'Failed to fetch user profile' 
                }, '*');
              } catch (error) {
                console.error('Failed to send message to parent:', error);
              }
              setTimeout(() => window.close(), 2000);
            </script>
        </body>
        </html>
      `)
      }

      const userData = await userResponse.json()
      console.log('✅ User profile fetched:', userData)

      const twitterId = userData.data.id
      const username = userData.data.username
      const displayName = userData.data.name
      const profilePicture = userData.data.profile_image_url

      // Check if user already exists with this Twitter account
      let existingAuthMethod = await UserAuthMethod.findOne({
        authType: 'twitter',
        providerId: twitterId,
      })

      let user
      if (existingAuthMethod) {
        // User exists, update last login
        user = await User.findById(existingAuthMethod.userId)
        if (user) {
          user.lastLogin = new Date()
          await user.save()

          // Update auth method data
          existingAuthMethod.providerData = {
            ...existingAuthMethod.providerData,
            providerUserId: twitterId,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            profilePicture,
          }
          await existingAuthMethod.save()
        }
      } else {
        // Create new user
        user = new User({
          displayName: displayName || username,
          avatar: profilePicture,
        })
        await user.save()

        // Create auth method
        const authMethod = new UserAuthMethod({
          userId: user._id,
          authType: 'twitter',
          providerId: twitterId,
          providerData: {
            providerUserId: twitterId,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            profilePicture,
          },
          isPrimary: true,
        })
        await authMethod.save()
      }

      if (!user) {
        console.error('❌ Failed to create or find user')
        return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0;
              background: #f0f0f0;
            }
            .error { 
              background: white; 
              padding: 20px; 
              border-radius: 8px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              text-align: center;
              color: #d32f2f;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ Authentication Failed</h2>
            <p>Failed to create user account</p>
          </div>
            <script>
              try {
                console.log('Sending OAuth error message to parent window');
                window.opener.postMessage({ 
                  success: false, 
                  error: 'Failed to create user account' 
                }, '*');
              } catch (error) {
                console.error('Failed to send message to parent:', error);
              }
              setTimeout(() => window.close(), 2000);
            </script>
        </body>
        </html>
      `)
      }

      // Generate tokens
      const tokenPayload = {
        userId: user._id.toString(),
        authType: 'twitter' as const,
      }

      const { accessToken, refreshToken } = generateTokenPair(tokenPayload)
      const hashedRefreshToken = await hashRefreshToken(refreshToken)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      // Store session
      await UserSession.create({
        userId: user._id,
        refreshTokenHash: hashedRefreshToken,
        deviceInfo: {
          userAgent: req.get('User-Agent'),
        },
        ipAddress: req.ip,
        expiresAt,
      })

      console.log('✅ Twitter OAuth successful for user:', user._id)

      // Check if this is a mobile redirect (no window.opener)
      const userAgent = req.get('User-Agent') || ''
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          userAgent,
        )

      // For mobile, redirect back to frontend with tokens in URL params
      if (isMobile) {
        // Set refresh token as httpOnly cookie for mobile
        res.cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        })

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
        const redirectUrl = `${frontendUrl}/auth/callback?success=true&token=${accessToken}&refresh=${refreshToken}&userId=${user._id}`
        return res.redirect(redirectUrl)
      }

      // Desktop: Send success response to frontend via postMessage
      res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Success</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            margin: 0;
            background: #f0f0f0;
          }
          .success { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
            color: #2e7d32;
          }
        </style>
      </head>
      <body>
        <div class="success">
          <h2>✅ Authentication Successful</h2>
          <p>You can close this window and return to the app.</p>
        </div>
        <script>
          try {
            console.log('Sending OAuth success message to parent window');
            window.opener.postMessage({ 
              success: true, 
              data: {
                user: {
                  id: '${user._id}',
                  email: '${user.email || ''}',
                  emailVerified: ${user.emailVerified || false},
                  walletAddress: '${user.walletAddress || ''}',
                  displayName: '${user.displayName || ''}',
                  avatar: '${user.avatar || ''}',
                },
                accessToken: '${accessToken}',
                refreshToken: '${refreshToken}'
              }
            }, '*');
          } catch (error) {
            console.error('Failed to send message to parent:', error);
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `)
    } catch (error) {
      console.error('❌ Twitter OAuth callback error:', error)
      res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Error</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            margin: 0;
            background: #f0f0f0;
          }
          .error { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
            color: #d32f2f;
          }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>❌ Authentication Failed</h2>
          <p>Server error occurred</p>
        </div>
        <script>
          try {
            console.log('Sending OAuth error message to parent window');
            window.opener.postMessage({ 
              success: false, 
              error: 'Server error occurred' 
            }, '*');
          } catch (error) {
            console.error('Failed to send message to parent:', error);
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `)
    }
  },
)
