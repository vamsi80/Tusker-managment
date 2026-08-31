import React from "react";
import { ScrollView, Text, View } from "react-native";

type Props = { children: React.ReactNode };
type State = { error: Error | null; stack: string | null };

/**
 * Without this, one throw during render unmounts the whole tree and the app
 * shows a blank screen with the cause only in the Metro console. Rendering the
 * message on the device is the difference between "it went blank" and a
 * reportable bug.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null, stack: null };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error("[ErrorBoundary]", error, info.componentStack);
        this.setState({ stack: info.componentStack ?? null });
    }

    render() {
        const { error, stack } = this.state;
        if (!error) return this.props.children;

        return (
            <View style={{ flex: 1, backgroundColor: "#1b1b1b", padding: 24, paddingTop: 72 }}>
                <Text style={{ color: "#ff8a80", fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
                    Something crashed
                </Text>
                <Text selectable style={{ color: "#fff", fontSize: 14, marginBottom: 16 }}>
                    {error.message}
                </Text>
                <ScrollView>
                    <Text selectable style={{ color: "#aaa", fontSize: 11, lineHeight: 16 }}>
                        {(stack ?? error.stack ?? "").trim()}
                    </Text>
                </ScrollView>
            </View>
        );
    }
}
