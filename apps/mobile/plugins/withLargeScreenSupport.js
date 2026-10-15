const { withAndroidManifest } = require("expo/config-plugins");

// Library activities that hard-code a portrait lock. Android 16 ignores these
// locks on large screens and Play Console flags them, so strip the attribute.
const LOCKED_ACTIVITIES = [
    "com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity",
];

module.exports = function withLargeScreenSupport(config) {
    return withAndroidManifest(config, (config) => {
        const manifest = config.modResults.manifest;
        manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

        const application = manifest.application[0];
        application.activity = application.activity || [];

        for (const name of LOCKED_ACTIVITIES) {
            let activity = application.activity.find((a) => a.$["android:name"] === name);
            if (!activity) {
                activity = { $: { "android:name": name } };
                application.activity.push(activity);
            }
            delete activity.$["android:screenOrientation"];
            activity.$["tools:remove"] = "android:screenOrientation";
        }

        return config;
    });
};
