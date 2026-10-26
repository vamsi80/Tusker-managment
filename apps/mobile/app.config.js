// Extends app.json. google-services.json (Firebase, needed for Android push)
// is only wired in when it exists, so the app still builds without it.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, "google-services.json");
  const projectId = process.env.EAS_PROJECT_ID ?? config.extra?.eas?.projectId;

  return {
    ...config,
    android: {
      ...config.android,
      ...(fs.existsSync(googleServices) ? { googleServicesFile: "./google-services.json" } : {}),
    },
    extra: {
      ...config.extra,
      eas: { ...config.extra?.eas, ...(projectId ? { projectId } : {}) },
    },
  };
};
