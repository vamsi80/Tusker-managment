import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().url(),

    AUTH_GITHUB_CLIENT_ID: z.string().min(1),
    AUTH_GITHUB_SECRET: z.string().min(1),
    
    RESEND_API_KEY: z.string().min(1),
    ARCJET_KEY: z.string().min(1),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    AWS_ENDPOINT_URL_S3: z.string().min(1),
    AWS_ENDPOINT_URL_IAM: z.string().min(1),
    AWS_REGION: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
  },
  
  client: {
    NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES: z.string().min(1),
  },
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: {
    NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES:
      process.env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
  }
});

// # authentication settings
// BETTER_AUTH_SECRET="DvV4dJ7HoLrOdqnEP0XtHuhc5beTqCRE"
// BETTER_AUTH_URL="http://localhost:3000"

// AUTH_GITHUB_CLIENT_ID = "Ov23liFBGtQqPikxbGTu"
// AUTH_GITHUB_SECRET = "0dde1a3a630cfcac71fbcaefafbb99e85ed679a2"

// # your database connection
// DATABASE_URL="postgresql://neondb_owner:npg_xyp1tJNZ7ilW@ep-spring-shadow-a81iz57s-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require"

// # Resend API Key
// RESEND_API_KEY="re_Dv3xsFUZ_GYt3VqrzjV7w4bnTbDxd7QUe"

// # Arcjet API Key
// ARCJET_KEY="ajkey_01k73nst83f9c8n8j27eczkkwc"

// # SMTP settings
// SMTP_HOST="smtp.gmail.com"
// SMTP_PORT="465"
// SMTP_SECURE="true"
// SMTP_USER="digital@thewhitetusker.com"
// SMTP_PASSWORD="spdq nskr wiml spvh"
// SMTP_FROM="digital@thewhitetusker.com"


// AWS_ACCESS_KEY_ID="tid_brI_tnwQFoolzhYBllOytgurmFxUTWpVshhOzlggqVfnFXgHYJ"
// AWS_SECRET_ACCESS_KEY="tsec_SaILSeykpLMygkNvRbQvNzWR7PY1sGk3oU7KJyiPHod+yVRBS3egrP25wDyzDKenVmwtCD"
// AWS_ENDPOINT_URL_S3="https://t3.storage.dev"
// AWS_ENDPOINT_URL_IAM="https://iam.storage.dev"
// AWS_REGION="auto"

// NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES="lms-vamsi"

// STRIPE_SECRET_KEY = "sk_test_51SLz06C43i62HBPYKxlh0DfbgqSxwXnxKVGze6gBKRtvZ0rfdDtQu07uFwv14ULU8wBxzkrBiXDQMY4qf6RwJBDv00AXGUtubI"
// STRIPE_WEBHOOK_SECRET = "whsec_17de14da79abb374432d9ac3272738b427d0d65ee699800f0c49902185bfb00c"
