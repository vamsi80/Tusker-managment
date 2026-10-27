import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, Platform, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * KeyboardAvoidingView for modals. Pads the bottom only by how much the
 * keyboard actually overlaps this view: some Android devices already resize
 * the modal window for the keyboard and others don't, and padding by the full
 * keyboard height on top of a resize pushed sheet content off the top.
 *
 * Meant for a full-window root (a translucent Modal), whose top sits at
 * screen y = 0; its own height is measured, so the padding never feeds back.
 */
export function KeyboardInset({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
    const [rootHeight, setRootHeight] = useState(0);
    const [keyboardTop, setKeyboardTop] = useState<number | null>(null);

    useEffect(() => {
        const ios = Platform.OS === "ios";
        const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => setKeyboardTop(e.endCoordinates.screenY));
        const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardTop(null));
        return () => {
            show.remove();
            hide.remove();
        };
    }, []);

    const overlap = keyboardTop === null || !rootHeight ? 0 : Math.max(0, rootHeight - keyboardTop);

    return (
        <View style={[style, { paddingBottom: overlap }]} onLayout={(e) => setRootHeight(e.nativeEvent.layout.height)}>
            {children}
        </View>
    );
}
