import 'server-only';
import arcjet, {
  detectBot,
  fixedWindow,
  protectSignup,
  sensitiveInfo,
  shield,
  slidingWindow,
} from "@arcjet/next"
import { env } from "./env";

export {
  detectBot,
  fixedWindow,
  protectSignup,
  sensitiveInfo,
  shield,
  slidingWindow,
}

const ARCJET_KEY = env.ARCJET_KEY;

if (!ARCJET_KEY) {
  throw new Error(
    "Missing environment variable ARCJET_KEY. Set ARCJET_KEY in your .env or host environment."
  );
}

export default arcjet({

  key: ARCJET_KEY ?? "not_set",

  characteristics: ["fingerprint"],

  rules: [
    shield({
      mode: "DRY_RUN",
    }),
  ],
})
