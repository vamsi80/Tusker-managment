import { useState } from "react";
import { Pressable } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Mail } from "lucide-react-native";
import { requestPasswordResetOtp } from "../../api/auth";
import { toast } from "../../lib/toast";
import { Button, Input, Text } from "../../components/ui";
import type { RootStackParamList } from "../../navigation/types";
import { AuthLayout } from "./AuthLayout";

/** (auth)/forgot-password — sends a reset code (the web sends a link; codes work natively). */
export function ForgotPasswordScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "ForgotPassword">) {
    const [email, setEmail] = useState(route.params?.email ?? "");
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (!email.trim()) return toast.error("Enter your email address.");
        setLoading(true);
        try {
            await requestPasswordResetOtp(email);
            toast.success("Reset code sent!");
            navigation.navigate("ResetPassword", { email: email.trim() });
        } catch (error) {
            toast.fromError(error, "Failed to send the reset code");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Forgot password?"
            description="Enter your email and we'll send you a code to reset it."
            footer={
                <Pressable onPress={() => navigation.navigate("SignIn")}>
                    <Text tone="muted">
                        Back to <Text weight="semibold">Sign in</Text>
                    </Text>
                </Pressable>
            }
        >
            <Input label="Email" icon={Mail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} onSubmitEditing={submit} />
            <Button title="Send reset code" size="lg" loading={loading} onPress={submit} />
        </AuthLayout>
    );
}
