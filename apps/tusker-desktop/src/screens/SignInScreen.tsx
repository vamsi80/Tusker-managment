import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "~/providers/AuthProvider";

/** Same account as the website and mobile app (Better Auth email + password). */
export function SignInScreen() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await signIn(email, password);
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    };

    return (
        <div className="app-bg grid h-svh place-items-center p-6">
            <form onSubmit={submit} className="surface flex w-full max-w-sm flex-col gap-5 p-8">
                <div>
                    <h1 className="font-heading text-2xl font-bold tracking-tight">Sign in to Tusker</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Use the same account as the website.</p>
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />} Sign in
                </Button>
                <button
                    type="button"
                    onClick={() => window.tusker.open("https://tusker-managment.vercel.app/forgot-password")}
                    className="text-center text-xs text-muted-foreground hover:text-foreground"
                >
                    Forgot your password? Reset it on the website.
                </button>
            </form>
        </div>
    );
}
