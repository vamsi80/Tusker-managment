import { useEffect, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { Text } from "./Text";
import { Toaster } from "../../lib/toast";
import { Button } from "./Button";
import { Input } from "./Input";

/**
 * Imperative confirm / prompt dialogs — the web uses window.confirm,
 * window.prompt and AlertDialog for these; one host renders them all.
 *
 *   if (await confirm({ title: "Delete this indent?", destructive: true })) …
 *   const reason = await prompt({ title: "Enter rejection reason" });
 */
type ConfirmOptions = {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
};
type PromptOptions = ConfirmOptions & { placeholder?: string; defaultValue?: string; multiline?: boolean; required?: boolean };

type Request =
    | { kind: "confirm"; options: ConfirmOptions; resolve: (v: boolean) => void }
    | { kind: "prompt"; options: PromptOptions; resolve: (v: string | null) => void };

let enqueue: ((r: Request) => void) | null = null;

export const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => (enqueue ? enqueue({ kind: "confirm", options, resolve }) : resolve(false)));

export const prompt = (options: PromptOptions) =>
    new Promise<string | null>((resolve) => (enqueue ? enqueue({ kind: "prompt", options, resolve }) : resolve(null)));

export function DialogHost() {
    const { colors, shadow } = useTheme();
    const [request, setRequest] = useState<Request | null>(null);
    const [text, setText] = useState("");
    const scale = useRef(new Animated.Value(0.94)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        enqueue = (r) => {
            setText(r.kind === "prompt" ? r.options.defaultValue ?? "" : "");
            setRequest(r);
        };
        return () => {
            enqueue = null;
        };
    }, []);

    useEffect(() => {
        if (!request) return;
        scale.setValue(0.94);
        opacity.setValue(0);
        Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 260 }),
            Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
        ]).start();
    }, [request, scale, opacity]);

    if (!request) return null;
    const { options } = request;

    const close = (accepted: boolean) => {
        if (request.kind === "confirm") request.resolve(accepted);
        else request.resolve(accepted ? text.trim() : null);
        setRequest(null);
    };

    const promptInvalid = request.kind === "prompt" && (request.options.required ?? true) && !text.trim();

    return (
        <Modal visible transparent animationType="none" onRequestClose={() => close(false)} statusBarTranslucent>
            <KeyboardAvoidingView behavior="padding" style={styles.center}>
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity }]}>
                    <Pressable style={{ flex: 1 }} onPress={() => close(false)} />
                </Animated.View>
                <Animated.View style={[styles.card, shadow.lg, { backgroundColor: colors.popover, borderColor: colors.border, opacity, transform: [{ scale }] }]}>
                    <Text variant="h2">{options.title}</Text>
                    {options.message ? (
                        <Text variant="body" tone="muted">
                            {options.message}
                        </Text>
                    ) : null}
                    {request.kind === "prompt" ? (
                        <Input
                            autoFocus
                            value={text}
                            onChangeText={setText}
                            placeholder={request.options.placeholder}
                            multiline={request.options.multiline}
                            containerStyle={{ marginTop: 4 }}
                        />
                    ) : null}
                    <View style={styles.actions}>
                        <Button title={options.cancelLabel ?? "Cancel"} variant="ghost" size="sm" onPress={() => close(false)} />
                        <Button
                            title={options.confirmLabel ?? (request.kind === "prompt" ? "Submit" : "Confirm")}
                            variant={options.destructive ? "destructive" : "default"}
                            size="sm"
                            disabled={promptInvalid}
                            onPress={() => close(true)}
                        />
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
            <Toaster />
        </Modal>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    card: { width: "100%", maxWidth: 420, borderRadius: radius.xl, borderWidth: 1, padding: 22, gap: 10 },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
});
