import { sendOTPEmail } from './src/config/email'
import dotenv from 'dotenv'

dotenv.config()

async function testEmail() {
    const email = process.argv[2]
    if (!email) {
        console.error('Please provide an email address as an argument')
        process.exit(1)
    }

    console.log(`Attempting to send OTP email to ${email}...`)
    try {
        const success = await sendOTPEmail(email, '123456')
        if (success) {
            console.log('✅ OTP email sent successfully!')
        } else {
            console.log('❌ Failed to send OTP email.')
            console.log('Check your Mailgun credentials in .env:')
            console.log('- MAILGUN_API_KEY')
            console.log('- MAILGUN_DOMAIN')
            console.log('- MAILGUN_FROM_EMAIL')
        }
    } catch (error) {
        console.error('💥 Unexpected error:', error)
    }
}

testEmail()
