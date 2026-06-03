import nodemailer from 'nodemailer'

export async function sendMail(to: string, subject: string, text: string, html: string) {
  const smtpUser = process.env.SMTP_EMAIL
  const smtpPass = process.env.SMTP_PASSWORD

  if (!smtpUser || !smtpPass) {
    console.error('Missing SMTP_EMAIL or SMTP_PASSWORD. Email was not sent.')
    return false
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  })

  try {
    const info = await transporter.sendMail({
      from: `"QuickSolve" <${smtpUser}>`,
      to,
      subject,
      text,
      html
    })
    
    console.log(`\n==== EMAIL SENT ====`)
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    if (info.messageId) {
      console.log(`Message ID: ${info.messageId}`)
    }
    // Ethereal specific URL for logging
    if (process.env.SMTP_HOST === 'smtp.ethereal.email') {
      const url = nodemailer.getTestMessageUrl(info)
      if (url) {
        console.log(`Preview URL: ${url}`)
      }
    }
    console.log(`====================\n`)
    
    return true
  } catch (error) {
    console.error("Failed to send email:", error)
    return false
  }
}