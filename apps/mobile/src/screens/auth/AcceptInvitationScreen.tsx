import { useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { KeyRound, Lock, Mail, User } from "lucide-react-native";
import { acceptInvitation, verifyInvitation } from "../../api/auth";
import { toast } from "../../lib/toast";
import { Banner, Button, Input } from "../../components/ui";
import type { RootStackParamList } from "../../navigation/types";
import { AuthLayout } from "./AuthLayout";

/** (auth)/accept-invitation — acceptInvitationSchema: name, nickname, strong password. */
export function AcceptInvitationScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, "AcceptInvitation">) {
    const [token, setToken] = useState(route.params?.token ?? "");
    const [email, setEmail] = useState(route.params?.email ?? "");
    const [name, setName] = useState("");
    const [niceName, setNiceName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [valid, setValid] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!route.params?.token || !route.params?.email) return;
        verifyInvitation(route.params.token, route.params.email)
            .then((r) => setValid(!!r.valid))
            .catch(() => setValid(false));
    }, [route.params?.token, route.params?.email]);

    const submit = async () => {
        if (!token || !email) return toast.error("Paste the invitation token and your email from the invite.");
        if (name.trim().length < 3) return toast.error("Name must be at least 3 characters");
        if (password.length < 8 || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            return toast.error("Password needs 8+ characters with an uppercase letter, a lowercase letter and a number");
        }
        if (password !== confirmPassword) return toast.error("Passwords do not match");
        setLoading(true);
        try {
            await acceptInvitation({ token: token.trim(), email: email.trim(), name: name.trim(), niceName: niceName.trim() || undefined, password, confirmPassword });
            toast.success("Account activated successfully. You can now log in.");
            navigation.navigate("SignIn");
        } catch (error) {
            toast.fromError(error, "Failed to accept invitation");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout title="Join your team" description="Activate the account your admin created for you.">
            {valid === false ? <Banner tone="destructive">This invitation link is invalid or has expired. Ask your admin to resend it.</Banner> : null}
            {!route.params?.token ? <Input label="Invitation token" icon={KeyRound} autoCapitalize="none" value={token} onChangeText={setToken} /> : null}
            <Input label="Email" icon={Mail} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} editable={!route.params?.email} />
            <Input label="Full name" icon={User} value={name} onChangeText={setName} />
            <Input label="Nickname" hint="How your name appears to your team" value={niceName} onChangeText={setNiceName} />
            <Input label="Password" icon={Lock} secureTextEntry value={password} onChangeText={setPassword} hint="8+ characters, with upper & lower case and a number" />
            <Input label="Confirm password" icon={Lock} secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
            <Button title="Activate account" size="lg" loading={loading} onPress={submit} />
        </AuthLayout>
    );
}
