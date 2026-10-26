import { useState } from "react";
import { Pressable, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Lock, Mail, Phone, User } from "lucide-react-native";
import { signUpWithEmail } from "../../api/auth";
import { toast } from "../../lib/toast";
import { Button, Input, Text } from "../../components/ui";
import type { RootStackParamList } from "../../navigation/types";
import { AuthLayout } from "./AuthLayout";

/**
 * (auth)/sign-up/_components/signUpForm.tsx: first/last name, nickname,
 * email, phone and password; then an email OTP on the verify screen.
 */
export function SignUpScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "SignUp">) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [surname, setSurname] = useState("");
    const [email, setEmail] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (!firstName || !lastName || !surname || !email || !phoneNumber || !password) return toast.error("Please fill all fields.");
        if (password.length < 8) return toast.error("Password must be at least 8 characters");
        setLoading(true);
        try {
            await signUpWithEmail({ name: `${firstName} ${lastName}`.trim(), email, password });
            toast.success("Signup successful! Check your email for the verification code.");
            navigation.navigate("VerifyRequest", { email: email.trim(), surname, phoneNumber });
        } catch (error) {
            toast.fromError(error, "Signup failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Create your account"
            description="Join your team on drava core"
            footer={
                <Pressable onPress={() => navigation.navigate("SignIn")}>
                    <Text tone="muted">
                        Already have an account? <Text weight="semibold">Sign in</Text>
                    </Text>
                </Pressable>
            }
        >
            <View style={{ flexDirection: "row", gap: 10 }}>
                <Input label="First name" containerStyle={{ flex: 1 }} value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
                <Input label="Last name" containerStyle={{ flex: 1 }} value={lastName} onChangeText={setLastName} autoComplete="family-name" />
            </View>
            <Input label="Nickname" hint="How your name appears to your team" icon={User} value={surname} onChangeText={setSurname} />
            <Input label="Email" icon={Mail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} />
            <Input label="Phone number" icon={Phone} keyboardType="phone-pad" autoComplete="tel" value={phoneNumber} onChangeText={setPhoneNumber} />
            <Input label="Password" icon={Lock} secureTextEntry autoComplete="new-password" hint="At least 8 characters" value={password} onChangeText={setPassword} />
            <Button title="Create account" size="lg" loading={loading} onPress={submit} />
        </AuthLayout>
    );
}
