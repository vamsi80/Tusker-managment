import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

// Validate required environment variables
const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    // Do not fail on invalid certs
    rejectUnauthorized: false
  }
});

transporter.verify(function(error, success) {
  if (error) {
    console.error('SMTP Connection Error:', error);
  } else {
    console.log('SMTP Server is ready to take our messages');
  }
});

export async function sendEmail({ to, subject, html }: EmailOptions) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    throw new Error('SMTP credentials are not properly configured');
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
    });
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
} 
