import FormData from 'form-data'
import Mailgun from 'mailgun.js'
import dotenv from 'dotenv'

dotenv.config()

// Mailgun configuration (Primary email service)
const mailgun = new Mailgun(FormData)
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY || '',
})

const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || ''
const FROM_EMAIL =
  process.env.MAILGUN_FROM_EMAIL || 'Alpha Block AI <noreply@alpha-block.ai>'

console.log('✅ Mailgun client initialized (primary email service)')

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    if (!MAILGUN_DOMAIN || !process.env.MAILGUN_API_KEY) {
      throw new Error('Mailgun configuration is missing')
    }

    const data = await mg.messages.create(MAILGUN_DOMAIN, {
      from: FROM_EMAIL,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''),
    })
    console.log('✅ Email sent successfully via Mailgun:', data.id)
    return true
  } catch (error) {
    console.error('❌ Error sending email via Mailgun:', error)
    return false
  }
}

export const sendOTPEmail = async (
  email: string,
  otpCode: string,
): Promise<boolean> => {
  const subject = 'Your Alpha Block AI Verification Code'

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verification Code</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background-color: #000000;
          color: #ffffff;
          margin: 0;
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #111113;
          border-radius: 20px;
          padding: 40px;
          border: 1px solid #858585;
        }
        .logo {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo img {
          height: 60px;
          width: auto;
          margin-bottom: 10px;
        }
        .logo h1 {
          font-size: 28px;
          font-weight: bold;
          margin: 0;
          color: #ffffff;
        }
        .logo .ai {
          color: #3b82f6;
        }
        .main-title {
          font-size: 24px;
          font-weight: 600;
          color: #e5e7eb;
          margin: 0 0 10px 0;
          text-align: center;
        }
        .subtitle {
          font-size: 16px;
          color: #9ca3af;
          margin: 0 0 30px 0;
          text-align: center;
        }
        .otp-code {
          background-color: #1a1a1e;
          border: 2px solid #3b82f6;
          border-radius: 12px;
          padding: 25px;
          text-align: center;
          margin: 30px 0;
        }
        .otp-code .code {
          font-size: 42px;
          font-weight: bold;
          letter-spacing: 8px;
          color: #3b82f6;
          margin: 0;
          font-family: 'Courier New', monospace;
        }
        .warning {
          background-color: #1f2937;
          border-left: 4px solid #f59e0b;
          padding: 20px;
          margin: 30px 0;
          border-radius: 8px;
        }
        .warning strong {
          color: #f59e0b;
          font-size: 16px;
        }
        .warning ul {
          margin: 10px 0 0 0;
          padding-left: 20px;
        }
        .warning li {
          color: #d1d5db;
          margin: 8px 0;
          font-size: 14px;
        }
        .support-text {
          font-size: 16px;
          color: #9ca3af;
          margin: 30px 0;
          text-align: center;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          font-size: 12px;
          color: #6b7280;
          border-top: 1px solid #374151;
          padding-top: 20px;
        }
        .footer p {
          margin: 5px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1>ALPHA<span class="ai">BLOCK</span> AI</h1>
        </div>
        
        <h2 class="main-title">Your Verification Code</h2>
        <p class="subtitle">Use the following code to complete your authentication:</p>
        
        <div class="otp-code">
          <p class="code">${otpCode}</p>
        </div>
        
        <div class="warning">
          <strong>⚠️ Important:</strong>
          <ul>
            <li>This code expires in 5 minutes</li>
            <li>Never share this code with anyone</li>
          </ul>
        </div>
        
        <p class="support-text">If you have any questions, please contact our support team.</p>
        
        <div class="footer">
          <p>© 2024 Alpha Block AI. All rights reserved.</p>
          <p>This is an automated message, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail({
    to: email,
    subject,
    html,
  })
}

export default mg
export { mg as mailgunClient }
