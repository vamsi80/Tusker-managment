import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AcceptInvitationForm } from "../../w/_components/auth/accept-invitation-form";
import { AppLoader } from "@/components/shared/app-loader";
import { WorkspaceService } from "@/server/services/workspace.service";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import prisma from "@/lib/db";

interface PageProps {
    searchParams: Promise<{
        token?: string;
        email?: string;
    }>;
}

export default async function AcceptInvitationPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const token = params.token;
    const email = params.email ? decodeURIComponent(params.email) : undefined;

    // 1. Check if user is already logged in
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (session) {
        return redirect("/");
    }

    // 2. Immediate validation of token/email presence
    if (!token || !email) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="w-full max-w-md border-destructive">
                    <CardHeader>
                        <div className="flex items-center gap-2 text-destructive mb-2">
                            <AlertCircle className="h-5 w-5" />
                            <CardTitle>Invalid Link</CardTitle>
                        </div>
                        <CardDescription>
                            This invitation link is missing required information. Please contact your administrator for a new link.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild variant="outline" className="w-full">
                            <Link href="/sign-in">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Sign In
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // 3. Server-side validation of token validity
    const isValid = await WorkspaceService.verifyInvitationToken(token, email);

    if (!isValid) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="w-full max-w-md border-destructive">
                    <CardHeader>
                        <div className="flex items-center gap-2 text-destructive mb-2">
                            <AlertCircle className="h-5 w-5" />
                            <CardTitle>Invitation Expired</CardTitle>
                        </div>
                        <CardDescription>
                            This invitation link has expired or is no longer valid. Invitation links are valid for 48 hours.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild variant="outline" className="w-full">
                            <Link href="/sign-in">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Sign In
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // 4. Fetch user to pre-fill name
    const user = await prisma.user.findUnique({
        where: { email },
        select: { name: true }
    });

    // 5. Render the set-password form
    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-muted/30">
            <Suspense fallback={<AppLoader />}>
                <AcceptInvitationForm 
                    token={token} 
                    email={email} 
                    initialName={user?.name || ""}
                />
            </Suspense>
        </div>
    );
}
