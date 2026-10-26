import { useState } from "react";
import { Pressable } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { KeyRound } from "lucide-react-native";
import { sendVerificationOtp, verifyEmailOtp } from "../../api/auth";
import { userApi } from "../../api/comms";
import { useAuth } from "../../providers/AuthProvider";
import { toast } from "../../lib/toast";
import { Button, Input, Text } from "../../components/ui";
import type { RootStackParamList } from "../../navigation/types";
import { AuthLayout } from "./AuthLayout";

/**
 * (auth)/verify-request: 6-digit email OTP. On success the sign-up details
 * (nickname, phone) are saved to the profile, as the web's syncUserProfile does.
 */
export function VerifyRequestScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "VerifyRequest">) {
    const { email, surname, phoneNumber } = route.params;
    const auth = useAuth();
    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);

    const verify = async () => {
        if (otp.length !== 6) return toast.error("Enter the 6-digit code from your email.");
        setLoading(true);
        try {
            await verifyEmailOtp(email, otp);
            if (surname || phoneNumber) {
                await userApi.updateProfile({ surname: surname || undefined, phoneNumber: phoneNumber || undefined }).catch(() => {
                    toast.warning("Account verified, but your profile details couldn't be saved. Update them in Profile.");
                });
            }
            toast.success("Account Verified");
            await auth.refresh();
            if (auth.status !== "signedIn") navigation.navigate("SignIn");
        } catch (error) {
            toast.fromError(error, "Error verifying the code");
        } finally {
            setLoading(false);
        }
    };

    const resend = async () => {
        setResending(true);
        try {
            await sendVerificationOtp(email);
            toast.success("A new code is on its way.");
        } catch (error) {
            toast.fromError(error);
        } finally {
            setResending(false);
        }
    };

    return (
        <AuthLayout title="Check your email" description={`We sent a 6-digit code to ${email}.`}>
            <Input
                label="Verification code"
                icon={KeyRound}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/\D/g, ""))}
                style={{ letterSpacing: 8, fontSize: 20 }}
            />
            <Button title="Verify" size="lg" loading={loading} disabled={otp.length !== 6} onPress={verify} />
            <Pressable onPress={resend} disabled={resending} style={{ alignSelf: "center" }}>
                <Text variant="label" tone="muted">
                    {resending ? "Sending…" : "Didn't get it? Resend code"}
                </Text>
            </Pressable>
        </AuthLayout>
    );
}
