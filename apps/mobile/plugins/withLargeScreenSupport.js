const { withAndroidManifest } = require("expo/config-plugins");

// Library activities that hard-code a portrait lock. Android 16 ignores these
// locks on large screens and Play Console flags them, so strip the attribute.
const LOCKED_ACTIVITIES = [
    "com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity",
];

// Hardware Play implies as required from our permissions (CAMERA, location).
// Declaring them optional keeps tablets, TVs and Chromebooks without them
// eligible; the app already handles the hardware being absent at runtime.
const OPTIONAL_FEATURES = [
    "android.hardware.camera",
    "android.hardware.camera.autofocus",
    "android.hardware.camera.any",
    "android.hardware.microphone",
    "android.hardware.location",
    "android.hardware.location.gps",
    "android.hardware.location.network",
];

module.exports = function withLargeScreenSupport(config) {
    return withAndroidManifest(config, (config) => {
        const manifest = config.modResults.manifest;
        manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

        manifest["uses-feature"] = manifest["uses-feature"] || [];
        for (const name of OPTIONAL_FEATURES) {
            let feature = manifest["uses-feature"].find((f) => f.$["android:name"] === name);
            if (!feature) {
                feature = { $: { "android:name": name } };
                manifest["uses-feature"].push(feature);
            }
            feature.$["android:required"] = "false";
        }

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
