import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { KeyRound, Lock } from "lucide-react-native";
import { resetPasswordWithOtp } from "../../api/auth";
import { toast } from "../../lib/toast";
import { Button, Input } from "../../components/ui";
import type { RootStackParamList } from "../../navigation/types";
import { AuthLayout } from "./AuthLayout";

/** (auth)/reset-password: code + new password (min 8, matching confirmation). */
export function ResetPasswordScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "ResetPassword">) {
    const { email } = route.params;
    const [otp, setOtp] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (otp.length !== 6) return toast.error("Enter the 6-digit code from your email.");
        if (password.length < 8) return toast.error("Password must be at least 8 characters");
        if (password !== confirmPassword) return toast.error("Passwords do not match");
        setLoading(true);
        try {
            await resetPasswordWithOtp(email, otp, password);
            toast.success("Password reset successfully! You can now sign in.");
            navigation.navigate("SignIn");
        } catch (error) {
            toast.fromError(error, "Failed to reset password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout title="Set a new password" description={`Enter the code we sent to ${email}.`}>
            <Input label="Reset code" icon={KeyRound} keyboardType="number-pad" maxLength={6} value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, ""))} />
            <Input label="New password" icon={Lock} secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
            <Input label="Confirm password" icon={Lock} secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} onSubmitEditing={submit} />
            <Button title="Reset password" size="lg" loading={loading} onPress={submit} />
        </AuthLayout>
    );
}
