"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { AppLoader } from "@/components/shared/app-loader";
import { WorkspaceData } from "@/types/workspace";
import { WorkspaceInfoForm } from "./workspace-info-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, MapPin, Phone, Mail, Globe, IdCard } from "lucide-react";

interface WorkspaceInfoViewProps {
    workspaceId: string;
    canEdit: boolean;
}

const DetailRow = ({ label, value, icon: Icon }: { label: string; value: string | null | undefined, icon?: React.ElementType }) => {
    if (!value) return null;
    return (
        <div className="flex items-start py-3 border-b last:border-0 border-border/50">
            {Icon && <Icon className="w-5 h-5 mr-3 text-muted-foreground mt-0.5 shrink-0" />}
            <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
                <p className="text-base font-semibold text-foreground">{value}</p>
            </div>
        </div>
    );
};

export function WorkspaceInfoView({ workspaceId, canEdit }: WorkspaceInfoViewProps) {
    const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchWorkspace() {
            try {
                const data = await apiClient.workspaces.getById(workspaceId);
                setWorkspace(data);
            } catch (error) {
                console.error("Failed to fetch workspace:", error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchWorkspace();
    }, [workspaceId]);

    if (isLoading) {
        return <AppLoader />;
    }

    if (!workspace) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
                <Building2 className="w-12 h-12 text-muted-foreground" />
                <h2 className="text-xl font-semibold">Workspace Not Found</h2>
                <p className="text-muted-foreground text-center max-w-xs">
                    We couldn't find the details for this workspace. It might have been deleted or you don't have access.
                </p>
            </div>
        );
    }

    if (canEdit) {
        return (
            <div className="w-full py-0 space-y-8 animate-in fade-in duration-500">
                <WorkspaceInfoForm workspace={workspace} />
            </div>
        );
    }

    const hasAddress = workspace.addressLine1 || workspace.city || workspace.state || workspace.country || workspace.pincode;

    const addressParts = [
        workspace.addressLine1,
        workspace.addressLine2,
        workspace.city,
        workspace.state,
        workspace.pincode,
        workspace.country
    ].filter(Boolean);

    return (
        <div className="w-full py-0 space-y-8 animate-in fade-in duration-500">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Workspace Information</h1>
                <p className="text-muted-foreground">
                    View organizational and legal details for {workspace.name}.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="w-5 h-5" />
                            Organization Details
                        </CardTitle>
                        <CardDescription>Legal and registration information</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1">
                        <DetailRow label="Workspace Name" value={workspace.name} />
                        <DetailRow label="Legal Entity Name" value={workspace.legalName} />
                        <DetailRow label="Industry" value={workspace.industry} />
                        <DetailRow label="Company Type" value={workspace.companyType} />
                        <DetailRow label="GST Number" value={workspace.gstNumber} icon={IdCard} />
                        <DetailRow label="PAN Number" value={workspace.panNumber} icon={IdCard} />
                        <DetailRow label="MSME Number" value={workspace.msmeNumber} icon={IdCard} />
                        <DetailRow label="Description" value={workspace.description} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MapPin className="w-5 h-5" />
                            Contact & Location
                        </CardTitle>
                        <CardDescription>Address and communication details</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1">
                        <DetailRow label="Email" value={workspace.email} icon={Mail} />
                        <DetailRow label="Phone" value={workspace.phone} icon={Phone} />
                        <DetailRow label="Website" value={workspace.website} icon={Globe} />

                        {hasAddress && (
                            <div className="flex items-start py-3 border-b last:border-0 border-border/50">
                                <MapPin className="w-5 h-5 mr-3 text-muted-foreground mt-0.5 shrink-0" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-muted-foreground mb-1">Registered Address</p>
                                    <p className="text-base text-foreground whitespace-pre-line leading-relaxed">
                                        {addressParts.join('\n')}
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
