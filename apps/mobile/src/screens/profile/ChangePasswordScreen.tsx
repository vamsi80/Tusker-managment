import { useState } from "react";
import { Pressable } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react-native";
import { changePassword } from "../../api/auth";
import { toast } from "../../lib/toast";
import { useTheme } from "../../theme/ThemeProvider";
import { Banner, Button, Card, Input } from "../../components/ui";
import { BottomBar, Screen, ScreenBody, ScreenHeader } from "../../components/layout/Screen";
import type { RootStackParamList } from "../../navigation/types";

/** Better Auth /change-password: current password, new (8+), confirmation. */
export function ChangePasswordScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "ChangePassword">) {
    const { colors } = useTheme();
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirmNext, setConfirmNext] = useState("");
    const [show, setShow] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        setError(null);
        if (!current || !next || !confirmNext) return setError("Please fill in all fields.");
        if (next.length < 8) return setError("New password must be at least 8 characters long.");
        if (next !== confirmNext) return setError("New passwords do not match.");
        if (next === current) return setError("New password must be different from your current password.");
        setLoading(true);
        try {
            await changePassword(current, next);
            toast.success("Password updated");
            navigation.goBack();
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : "Failed to change password.");
        } finally {
            setLoading(false);
        }
    };

    const eye = (
        <Pressable hitSlop={10} onPress={() => setShow((v) => !v)}>
            {show ? <EyeOff size={18} color={colors.mutedForeground} /> : <Eye size={18} color={colors.mutedForeground} />}
        </Pressable>
    );

    return (
        <Screen>
            <ScreenHeader title="Change password" back showActions={false} />
            <ScreenBody
                footer={
                    <BottomBar>
                        <Button title="Update password" style={{ flex: 1 }} loading={loading} onPress={submit} />
                    </BottomBar>
                }
            >
                <Banner tone="info" title="Keep your account secure">
                    Enter your current password and a new password of at least 8 characters.
                </Banner>
                {error ? <Banner tone="destructive">{error}</Banner> : null}
                <Card style={{ gap: 14 }}>
                    <Input
                        label="Current password"
                        icon={Lock}
                        secureTextEntry={!show}
                        autoComplete="password"
                        textContentType="password"
                        value={current}
                        onChangeText={setCurrent}
                        right={eye}
                    />
                    <Input
                        label="New password"
                        icon={ShieldCheck}
                        secureTextEntry={!show}
                        autoComplete="new-password"
                        textContentType="newPassword"
                        hint="At least 8 characters"
                        value={next}
                        onChangeText={setNext}
                    />
                    <Input
                        label="Confirm new password"
                        icon={ShieldCheck}
                        secureTextEntry={!show}
                        autoComplete="new-password"
                        textContentType="newPassword"
                        value={confirmNext}
                        onChangeText={setConfirmNext}
                        onSubmitEditing={submit}
                        returnKeyType="go"
                        error={confirmNext && next !== confirmNext ? "Passwords do not match" : null}
                    />
                </Card>
            </ScreenBody>
        </Screen>
    );
}
