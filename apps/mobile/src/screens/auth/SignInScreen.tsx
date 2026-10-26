import { useState } from "react";
import { Pressable, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Eye, EyeOff, Lock, Mail } from "lucide-react-native";
import { signInWithEmail } from "../../api/auth";
import { ApiError } from "../../api/client";
import { useAuth } from "../../providers/AuthProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { toast } from "../../lib/toast";
import { Button, Input, Text } from "../../components/ui";
import type { RootStackParamList } from "../../navigation/types";
import { AuthLayout } from "./AuthLayout";

/** (auth)/sign-in/_components/loginForm.tsx — email & password. */
export function SignInScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "SignIn">) {
    const { colors } = useTheme();
    const auth = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [show, setShow] = useState(false);
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (!email.trim() || !password) return toast.error("Enter your email and password.");
        setLoading(true);
        try {
            await signInWithEmail(email, password);
            await auth.refresh();
            toast.success("Signed in successfully!");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to sign in";
            const code = error instanceof ApiError ? error.code : undefined;
            const noPassword = code === "USER_HAS_NO_PASSWORD" || (/password/i.test(message) && /(not set|no )/i.test(message));
            if (noPassword) {
                toast.error("No password found for this account. Create one to log in with email.");
                navigation.navigate("ForgotPassword", { email });
            } else if (/verif/i.test(message)) {
                toast.error(message);
                navigation.navigate("VerifyRequest", { email });
            } else {
                toast.error(message);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Welcome back"
            description="Sign in to your workspace"
            footer={
                <Pressable onPress={() => navigation.navigate("SignUp")}>
                    <Text tone="muted">
                        Don't have an account? <Text weight="semibold" tone="primary">Sign up</Text>
                    </Text>
                </Pressable>
            }
        >
            <Input
                label="Email"
                icon={Mail}
                placeholder="you@company.com"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                returnKeyType="next"
            />
            <Input
                label="Password"
                icon={Lock}
                placeholder="••••••••"
                secureTextEntry={!show}
                autoComplete="password"
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={submit}
                returnKeyType="go"
                right={
                    <Pressable hitSlop={10} onPress={() => setShow((v) => !v)}>
                        {show ? <EyeOff size={18} color={colors.mutedForeground} /> : <Eye size={18} color={colors.mutedForeground} />}
                    </Pressable>
                }
            />
            <Pressable style={{ alignSelf: "flex-end" }} onPress={() => navigation.navigate("ForgotPassword", { email })}>
                <Text variant="label" tone="muted">
                    Forgot password?
                </Text>
            </Pressable>
            <Button title="Sign in" size="lg" loading={loading} onPress={submit} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                <Text variant="caption" tone="muted">
                    INVITED BY YOUR TEAM?
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>
            <Button title="Accept an invitation" variant="outline" onPress={() => navigation.navigate("AcceptInvitation")} />
        </AuthLayout>
    );
}
