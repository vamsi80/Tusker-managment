import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TextInput,
    ActivityIndicator,
    ScrollView,
    Dimensions,
    Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING, BORDER_RADIUS, TOUCH_TARGET, FONTS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { useWorkspace } from "../context/WorkspaceContext";
import {
    getProjectMembers,
    getWorkspaceMembers,
    addProjectMembers,
    updateProjectMember,
    removeProjectMember
} from "../services/api";
import PressableScale from "./PressableScale";
import ConfirmationSheet from "./ConfirmationSheet";
import EmptyState from "./EmptyState";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type ProjectRoleType = "PROJECT_MANAGER" | "PROJECT_COORDINATOR" | "LEAD" | "MEMBER" | "VIEWER";

interface ProjectMemberItem {
    id: string;
    userId: string;
    userName: string;
    projectRole: ProjectRoleType;
    workspaceRole?: string;
    image?: string;
}

interface ProjectMembersModalProps {
    visible: boolean;
    onClose: () => void;
    projectId: string;
    projectName: string;
}

export default function ProjectMembersModal({ visible, onClose, projectId, projectName }: ProjectMembersModalProps) {
    const { colors, isDark } = useTheme();
    const { activeWorkspace, refreshData } = useWorkspace();
    
    const [projectMembers, setProjectMembers] = useState<ProjectMemberItem[]>([]);
    const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    // Add members state
    const [selectedMembersToAdd, setSelectedMembersToAdd] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [showAddPicker, setShowAddPicker] = useState(false);

    // Role picker state
    const [roleTarget, setRoleTarget] = useState<{ userId: string; name: string; currentRole: ProjectRoleType } | null>(null);

    // Remove confirmation state
    const [removeTarget, setRemoveTarget] = useState<{ userId: string; name: string } | null>(null);

    useEffect(() => {
        if (visible && projectId) {
            loadAllData();
        }
    }, [visible, projectId]);

    const loadAllData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [pMembersRaw, wMembersRaw] = await Promise.all([
                getProjectMembers(projectId),
                activeWorkspace ? getWorkspaceMembers(activeWorkspace.id) : []
            ]);

            const mappedProjectMembers: ProjectMemberItem[] = (pMembersRaw || []).map((pm: any) => {
                const u = pm.user || pm.workspaceMember?.user || pm;
                const userId = pm.userId || pm.workspaceMember?.userId || pm.id || u.id;
                const userName = u.surname || u.name || pm.name || u.email || "Member";
                const projectRole: ProjectRoleType = pm.projectRole || pm.role || "MEMBER";
                const workspaceRole = pm.workspaceRole || pm.workspaceMember?.workspaceRole;
                const image = u.image || pm.image;

                return {
                    id: pm.id || userId,
                    userId,
                    userName,
                    projectRole,
                    workspaceRole,
                    image,
                };
            });

            setProjectMembers(mappedProjectMembers);
            setWorkspaceMembers(wMembersRaw || []);
            setSelectedMembersToAdd([]);
        } catch (err) {
            setError("Failed to load members data");
        } finally {
            setLoading(false);
        }
    };

    // Derived: Current member IDs set
    const currentMemberUserIds = new Set(projectMembers.map((m) => m.userId));

    // Available workspace members (excluding existing project members and Workspace OWNER/ADMIN)
    const availableMembers = workspaceMembers.filter((wm) => {
        const isAlreadyIn = currentMemberUserIds.has(wm.userId);
        const isAdminOrOwner = wm.workspaceRole === "OWNER" || wm.workspaceRole === "ADMIN";
        return !isAlreadyIn && !isAdminOrOwner;
    });

    const filteredAvailableMembers = availableMembers.filter((wm) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const s = wm.user?.surname?.toLowerCase() || "";
        const n = wm.user?.name?.toLowerCase() || "";
        const e = wm.user?.email?.toLowerCase() || "";
        return s.includes(q) || n.includes(q) || e.includes(q);
    });

    // Filter out workspace admins and owners from the displayed project members list (matching web)
    const displayMembers = projectMembers.filter((member) => {
        const wm = workspaceMembers.find((w) => w.userId === member.userId);
        return wm?.workspaceRole !== "ADMIN" && wm?.workspaceRole !== "OWNER";
    });

    const hasCoordinatorAlready = projectMembers.some((m) => m.projectRole === "PROJECT_COORDINATOR");

    const toggleMemberSelection = (userId: string) => {
        if (selectedMembersToAdd.includes(userId)) {
            setSelectedMembersToAdd(selectedMembersToAdd.filter((id) => id !== userId));
        } else {
            setSelectedMembersToAdd([...selectedMembersToAdd, userId]);
        }
    };

    const handleAddSelectedMembers = async () => {
        if (selectedMembersToAdd.length === 0) return;
        setActionLoading("add");
        try {
            const res = await addProjectMembers(projectId, selectedMembersToAdd);
            if (res.success || res.message) {
                await loadAllData();
                await refreshData();
                setShowAddPicker(false);
                setSelectedMembersToAdd([]);
            } else {
                Alert.alert("Error", res.error || "Failed to add members");
            }
        } catch (err: any) {
            Alert.alert("Error", err.message || "An error occurred while adding members");
        } finally {
            setActionLoading(null);
        }
    };

    const handleUpdateRole = async (userId: string, newRole: ProjectRoleType) => {
        setRoleTarget(null);
        setActionLoading(userId);
        try {
            const res = await updateProjectMember(projectId, userId, newRole);
            if (res.success || res.message) {
                await loadAllData();
                await refreshData();
            } else {
                Alert.alert("Error", res.error || "Failed to update member role");
            }
        } catch (err: any) {
            Alert.alert("Error", err.message || "An error occurred while updating role");
        } finally {
            setActionLoading(null);
        }
    };

    const confirmRemoveMember = async () => {
        if (!removeTarget) return;
        const { userId } = removeTarget;
        setActionLoading(userId);
        try {
            const res = await removeProjectMember(projectId, userId);
            if (res.success || res.message) {
                await loadAllData();
                await refreshData();
                setRemoveTarget(null);
            } else {
                Alert.alert("Error", res.error || "Failed to remove member");
            }
        } catch (err: any) {
            Alert.alert("Error", err.message || "An error occurred while removing member");
        } finally {
            setActionLoading(null);
        }
    };

    const getRoleBadgeStyle = (role: ProjectRoleType) => {
        switch (role) {
            case "PROJECT_MANAGER":
                return { bg: "#f59e0b", text: "#ffffff", label: "Manager" };
            case "PROJECT_COORDINATOR":
                return { bg: "#2563eb", text: "#ffffff", label: "Coordinator" };
            case "LEAD":
                return { bg: "#8b5cf6", text: "#ffffff", label: "Lead" };
            case "MEMBER":
                return { bg: colors.surfaceHighlight, text: colors.text, label: "Member" };
            case "VIEWER":
                return { bg: "transparent", border: colors.border, text: colors.textDim, label: "Viewer" };
            default:
                return { bg: colors.surfaceHighlight, text: colors.text, label: role };
        }
    };

    return (
        <>
            <Modal
                visible={visible}
                transparent
                animationType="slide"
                onRequestClose={onClose}
            >
                <View style={styles.overlay}>
                    <View style={[styles.sheet, { backgroundColor: colors.surfaceSolid }]}>
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={[styles.handle, { backgroundColor: colors.border }]} />
                            <View style={styles.titleRow}>
                                <View style={styles.titleLeft}>
                                    <View style={[styles.iconBox, { backgroundColor: colors.primary + "25" }]}>
                                        <Ionicons name="people" size={18} color={colors.primary} />
                                    </View>
                                    <View>
                                        <Text style={[styles.title, { color: colors.text }]}>Manage Project Members</Text>
                                        <Text style={[styles.subtitle, { color: colors.textDim }]} numberOfLines={1}>
                                            Manage members for <Text style={{ fontFamily: FONTS.bold, color: colors.text }}>{projectName}</Text>
                                        </Text>
                                    </View>
                                </View>
                                <PressableScale
                                    onPress={onClose}
                                    style={styles.closeBtn}
                                    accessibilityLabel="Close"
                                    accessibilityRole="button"
                                    hitSlop={8}
                                >
                                    <Ionicons name="close" size={22} color={colors.textDim} />
                                </PressableScale>
                            </View>
                        </View>

                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={[styles.loadingText, { color: colors.textDim }]}>Loading project team...</Text>
                            </View>
                        ) : (
                            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                                {/* Section 1: Add Members */}
                                <View style={[styles.sectionContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <View style={styles.sectionHeaderRow}>
                                        <Text style={[styles.sectionHeading, { color: colors.text }]}>Add Members</Text>
                                        {availableMembers.length > 0 && (
                                            <Text style={[styles.availableCount, { color: colors.textDim }]}>
                                                {availableMembers.length} available
                                            </Text>
                                        )}
                                    </View>

                                    <PressableScale
                                        onPress={() => setShowAddPicker(!showAddPicker)}
                                        style={[
                                            styles.addTriggerBtn,
                                            { backgroundColor: colors.surfaceSolid, borderColor: colors.border }
                                        ]}
                                        haptic="selection"
                                    >
                                        <Text style={[styles.addTriggerText, { color: selectedMembersToAdd.length > 0 ? colors.primary : colors.textDim }]}>
                                            {selectedMembersToAdd.length > 0
                                                ? `${selectedMembersToAdd.length} member(s) selected`
                                                : availableMembers.length === 0
                                                    ? "No available members"
                                                    : "Select members to add..."}
                                        </Text>
                                        <Ionicons name={showAddPicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textDim} />
                                    </PressableScale>

                                    {/* Add Members Dropdown Picker */}
                                    {showAddPicker && (
                                        <View style={[styles.pickerContainer, { borderColor: colors.border, backgroundColor: colors.surfaceSolid }]}>
                                            <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                                                <Ionicons name="search" size={16} color={colors.textDim} />
                                                <TextInput
                                                    style={[styles.searchInput, { color: colors.text }]}
                                                    placeholder="Search members..."
                                                    placeholderTextColor={colors.textDim}
                                                    value={searchQuery}
                                                    onChangeText={setSearchQuery}
                                                />
                                                {searchQuery.length > 0 && (
                                                    <PressableScale onPress={() => setSearchQuery("")} hitSlop={8}>
                                                        <Ionicons name="close-circle" size={16} color={colors.textDim} />
                                                    </PressableScale>
                                                )}
                                            </View>

                                            <ScrollView style={styles.pickerList} nestedScrollEnabled>
                                                {filteredAvailableMembers.map((member) => {
                                                    const isSelected = selectedMembersToAdd.includes(member.userId);
                                                    const mName = member.user?.surname || member.user?.name || "Member";
                                                    const mRole = member.workspaceRole || "MEMBER";

                                                    return (
                                                        <PressableScale
                                                            key={member.userId}
                                                            onPress={() => toggleMemberSelection(member.userId)}
                                                            haptic="selection"
                                                            style={[
                                                                styles.pickerItem,
                                                                { borderBottomColor: colors.border },
                                                                isSelected && { backgroundColor: colors.primary + "12" }
                                                            ]}
                                                        >
                                                            <View style={[styles.checkbox, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                                                                {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                                                            </View>
                                                            <Text style={[styles.pickerItemName, { color: colors.text }]}>{mName}</Text>
                                                            <View style={[styles.wsRoleBadge, { backgroundColor: colors.surfaceHighlight }]}>
                                                                <Text style={[styles.wsRoleText, { color: colors.textDim }]}>{mRole}</Text>
                                                            </View>
                                                        </PressableScale>
                                                    );
                                                })}
                                                {filteredAvailableMembers.length === 0 && (
                                                    <Text style={[styles.emptySearchText, { color: colors.textDim }]}>
                                                        No members found
                                                    </Text>
                                                )}
                                            </ScrollView>

                                            <View style={styles.pickerActions}>
                                                <PressableScale
                                                    onPress={handleAddSelectedMembers}
                                                    disabled={selectedMembersToAdd.length === 0 || actionLoading === "add"}
                                                    style={[
                                                        styles.addConfirmBtn,
                                                        { backgroundColor: colors.primary },
                                                        selectedMembersToAdd.length === 0 && { opacity: 0.5 }
                                                    ]}
                                                    haptic="medium"
                                                >
                                                    {actionLoading === "add" ? (
                                                        <ActivityIndicator size="small" color="#fff" />
                                                    ) : (
                                                        <>
                                                            <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 4 }} />
                                                            <Text style={styles.addConfirmText}>
                                                                Add {selectedMembersToAdd.length > 0 ? `(${selectedMembersToAdd.length})` : ""}
                                                            </Text>
                                                        </>
                                                    )}
                                                </PressableScale>
                                            </View>
                                        </View>
                                    )}
                                </View>

                                {/* Section 2: Current Members */}
                                <View style={styles.currentSection}>
                                    <Text style={[styles.sectionHeading, { color: colors.text }]}>
                                        Current Members ({displayMembers.length})
                                    </Text>

                                    {displayMembers.length === 0 ? (
                                        <EmptyState
                                            icon="people-outline"
                                            title="No members yet"
                                            message="No members in this project yet. Use the section above to add workspace members."
                                        />
                                    ) : (
                                        <View style={styles.memberList}>
                                            {displayMembers.map((member) => {
                                                const badge = getRoleBadgeStyle(member.projectRole);
                                                const isManager = member.projectRole === "PROJECT_MANAGER";
                                                const isActioning = actionLoading === member.userId;

                                                return (
                                                    <View
                                                        key={member.userId}
                                                        style={[styles.memberCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                                                    >
                                                        <View style={styles.memberLeft}>
                                                            <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
                                                                <Text style={[styles.avatarText, { color: colors.primary }]}>
                                                                    {(member.userName?.[0] || "?").toUpperCase()}
                                                                </Text>
                                                            </View>
                                                            <View style={styles.memberInfo}>
                                                                <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                                                                    {member.userName}
                                                                </Text>
                                                                <View
                                                                    style={[
                                                                        styles.roleBadge,
                                                                        { backgroundColor: badge.bg },
                                                                        badge.border ? { borderWidth: 1, borderColor: badge.border } : null
                                                                    ]}
                                                                >
                                                                    <Text style={[styles.roleBadgeText, { color: badge.text }]}>
                                                                        {badge.label}
                                                                    </Text>
                                                                </View>
                                                            </View>
                                                        </View>

                                                        <View style={styles.memberActions}>
                                                            {/* Role selector / Fixed Role text */}
                                                            {isManager ? (
                                                                <Text style={[styles.fixedRoleText, { color: colors.textDim }]}>
                                                                    Fixed Role
                                                                </Text>
                                                            ) : (
                                                                <PressableScale
                                                                    onPress={() => setRoleTarget({ userId: member.userId, name: member.userName, currentRole: member.projectRole })}
                                                                    disabled={isActioning}
                                                                    style={[styles.roleSelectBtn, { borderColor: colors.border, backgroundColor: colors.surfaceSolid }]}
                                                                    haptic="selection"
                                                                >
                                                                    {isActioning ? (
                                                                        <ActivityIndicator size="small" color={colors.primary} />
                                                                    ) : (
                                                                        <>
                                                                            <Text style={[styles.roleSelectText, { color: colors.text }]}>
                                                                                {badge.label}
                                                                            </Text>
                                                                            <Ionicons name="chevron-down" size={12} color={colors.textDim} style={{ marginLeft: 4 }} />
                                                                        </>
                                                                    )}
                                                                </PressableScale>
                                                            )}

                                                            {/* Remove button */}
                                                            <PressableScale
                                                                onPress={() => setRemoveTarget({ userId: member.userId, name: member.userName })}
                                                                disabled={isManager || isActioning}
                                                                style={[
                                                                    styles.removeBtn,
                                                                    { backgroundColor: `${colors.error}14` },
                                                                    isManager && { opacity: 0.3 }
                                                                ]}
                                                                haptic="warning"
                                                            >
                                                                <Ionicons name="trash-outline" size={16} color={colors.error} />
                                                            </PressableScale>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}
                                </View>

                                <View style={{ height: 40 }} />
                            </ScrollView>
                        )}

                        {/* Footer */}
                        <View style={[styles.footer, { borderTopColor: colors.border }]}>
                            <PressableScale
                                onPress={onClose}
                                style={[styles.closeFooterBtn, { backgroundColor: colors.surfaceHighlight }]}
                                haptic="selection"
                            >
                                <Text style={[styles.closeFooterText, { color: colors.text }]}>Close</Text>
                            </PressableScale>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Role Selection Modal */}
            {roleTarget && (
                <Modal visible={true} transparent animationType="fade" onRequestClose={() => setRoleTarget(null)}>
                    <View style={styles.roleOverlay}>
                        <View style={[styles.roleDialog, { backgroundColor: colors.surfaceSolid }]}>
                            <Text style={[styles.roleDialogTitle, { color: colors.text }]}>Select Role for {roleTarget.name}</Text>
                            
                            <View style={styles.roleOptionsList}>
                                {(roleTarget.currentRole === "PROJECT_COORDINATOR" || !hasCoordinatorAlready) && (
                                    <PressableScale
                                        style={[
                                            styles.roleOptionItem,
                                            { borderColor: colors.border },
                                            roleTarget.currentRole === "PROJECT_COORDINATOR" && { backgroundColor: "#2563eb18", borderColor: "#2563eb" }
                                        ]}
                                        onPress={() => handleUpdateRole(roleTarget.userId, "PROJECT_COORDINATOR")}
                                    >
                                        <View>
                                            <Text style={[styles.roleOptionTitle, { color: colors.text }]}>Coordinator</Text>
                                            <Text style={[styles.roleOptionDesc, { color: colors.textDim }]}>Can manage tasks and review work</Text>
                                        </View>
                                        {roleTarget.currentRole === "PROJECT_COORDINATOR" && <Ionicons name="checkmark-circle" size={20} color="#2563eb" />}
                                    </PressableScale>
                                )}

                                <PressableScale
                                    style={[
                                        styles.roleOptionItem,
                                        { borderColor: colors.border },
                                        roleTarget.currentRole === "LEAD" && { backgroundColor: "#8b5cf618", borderColor: "#8b5cf6" }
                                    ]}
                                    onPress={() => handleUpdateRole(roleTarget.userId, "LEAD")}
                                >
                                    <View>
                                        <Text style={[styles.roleOptionTitle, { color: colors.text }]}>Lead</Text>
                                        <Text style={[styles.roleOptionDesc, { color: colors.textDim }]}>Can lead tasks and assign teammates</Text>
                                    </View>
                                    {roleTarget.currentRole === "LEAD" && <Ionicons name="checkmark-circle" size={20} color="#8b5cf6" />}
                                </PressableScale>

                                <PressableScale
                                    style={[
                                        styles.roleOptionItem,
                                        { borderColor: colors.border },
                                        roleTarget.currentRole === "MEMBER" && { backgroundColor: colors.primary + "18", borderColor: colors.primary }
                                    ]}
                                    onPress={() => handleUpdateRole(roleTarget.userId, "MEMBER")}
                                >
                                    <View>
                                        <Text style={[styles.roleOptionTitle, { color: colors.text }]}>Member</Text>
                                        <Text style={[styles.roleOptionDesc, { color: colors.textDim }]}>Can work on assigned tasks</Text>
                                    </View>
                                    {roleTarget.currentRole === "MEMBER" && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                                </PressableScale>

                                <PressableScale
                                    style={[
                                        styles.roleOptionItem,
                                        { borderColor: colors.border },
                                        roleTarget.currentRole === "VIEWER" && { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }
                                    ]}
                                    onPress={() => handleUpdateRole(roleTarget.userId, "VIEWER")}
                                >
                                    <View>
                                        <Text style={[styles.roleOptionTitle, { color: colors.text }]}>Viewer</Text>
                                        <Text style={[styles.roleOptionDesc, { color: colors.textDim }]}>Read-only project access</Text>
                                    </View>
                                    {roleTarget.currentRole === "VIEWER" && <Ionicons name="checkmark-circle" size={20} color={colors.text} />}
                                </PressableScale>
                            </View>

                            <PressableScale
                                style={[styles.roleCancelBtn, { backgroundColor: colors.surfaceHighlight }]}
                                onPress={() => setRoleTarget(null)}
                            >
                                <Text style={[styles.roleCancelText, { color: colors.text }]}>Cancel</Text>
                            </PressableScale>
                        </View>
                    </View>
                </Modal>
            )}

            {/* Remove Confirmation Sheet */}
            <ConfirmationSheet
                visible={!!removeTarget}
                title="Remove Member"
                description={
                    removeTarget
                        ? `Are you sure you want to remove "${removeTarget.name}" from ${projectName}? They will lose access to all tasks in this project.`
                        : undefined
                }
                tone="destructive"
                confirmLabel="Remove Member"
                cancelLabel="Cancel"
                loading={actionLoading === removeTarget?.userId}
                onConfirm={confirmRemoveMember}
                onClose={() => setRemoveTarget(null)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        justifyContent: "flex-end",
    },
    sheet: {
        borderTopLeftRadius: BORDER_RADIUS.xl,
        borderTopRightRadius: BORDER_RADIUS.xl,
        maxHeight: "90%",
    },
    header: {
        alignItems: "center",
        paddingTop: 12,
        paddingBottom: 8,
    },
    handle: {
        width: 40,
        height: 5,
        borderRadius: 3,
        marginBottom: 12,
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        paddingHorizontal: SPACING.lg,
    },
    titleLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        flex: 1,
    },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    title: {
        fontSize: 18,
        fontFamily: FONTS.bold,
    },
    subtitle: {
        fontSize: 12,
        fontFamily: FONTS.regular,
        marginTop: 2,
    },
    closeBtn: {
        minWidth: TOUCH_TARGET.min,
        minHeight: TOUCH_TARGET.min,
        alignItems: "flex-end",
        justifyContent: "center",
    },
    content: {
        padding: SPACING.lg,
    },
    loadingContainer: {
        height: 300,
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        fontFamily: FONTS.medium,
    },
    sectionContainer: {
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
        marginBottom: 20,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    sectionHeading: {
        fontSize: 14,
        fontFamily: FONTS.bold,
    },
    availableCount: {
        fontSize: 12,
        fontFamily: FONTS.medium,
    },
    addTriggerBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
    },
    addTriggerText: {
        fontSize: 13,
        fontFamily: FONTS.medium,
    },
    pickerContainer: {
        marginTop: 10,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        padding: 8,
    },
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 1,
        marginBottom: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 13,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    pickerList: {
        maxHeight: 160,
    },
    pickerItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    checkbox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: "#888",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 10,
    },
    pickerItemName: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        flex: 1,
    },
    wsRoleBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    wsRoleText: {
        fontSize: 10,
        fontFamily: FONTS.bold,
    },
    emptySearchText: {
        textAlign: "center",
        paddingVertical: 12,
        fontSize: 12,
    },
    pickerActions: {
        marginTop: 8,
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    addConfirmBtn: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.md,
    },
    addConfirmText: {
        fontSize: 13,
        fontFamily: FONTS.bold,
        color: "#fff",
    },
    currentSection: {
        marginBottom: 16,
    },
    memberList: {
        marginTop: 10,
        gap: 8,
    },
    memberCard: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 12,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
    },
    memberLeft: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        marginRight: 8,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 10,
    },
    avatarText: {
        fontSize: 14,
        fontFamily: FONTS.bold,
    },
    memberInfo: {
        flex: 1,
    },
    memberName: {
        fontSize: 14,
        fontFamily: FONTS.semibold,
        marginBottom: 4,
    },
    roleBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    roleBadgeText: {
        fontSize: 11,
        fontFamily: FONTS.bold,
    },
    memberActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    fixedRoleText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
        paddingHorizontal: 8,
    },
    roleSelectBtn: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
    },
    roleSelectText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
    },
    removeBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    footer: {
        padding: SPACING.md,
        borderTopWidth: 1,
    },
    closeFooterBtn: {
        height: 48,
        borderRadius: BORDER_RADIUS.md,
        justifyContent: "center",
        alignItems: "center",
    },
    closeFooterText: {
        fontSize: 15,
        fontFamily: FONTS.semibold,
    },
    // Role selection modal
    roleOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.6)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    roleDialog: {
        width: "100%",
        maxWidth: 380,
        borderRadius: BORDER_RADIUS.xl,
        padding: SPACING.lg,
    },
    roleDialogTitle: {
        fontSize: 16,
        fontFamily: FONTS.bold,
        marginBottom: 16,
        textAlign: "center",
    },
    roleOptionsList: {
        gap: 10,
    },
    roleOptionItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 12,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
    },
    roleOptionTitle: {
        fontSize: 14,
        fontFamily: FONTS.bold,
        marginBottom: 2,
    },
    roleOptionDesc: {
        fontSize: 11,
    },
    roleCancelBtn: {
        marginTop: 16,
        height: 44,
        borderRadius: BORDER_RADIUS.md,
        justifyContent: "center",
        alignItems: "center",
    },
    roleCancelText: {
        fontSize: 14,
        fontFamily: FONTS.semibold,
    },
});
