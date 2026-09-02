import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TextInput,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Dimensions
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING, BORDER_RADIUS, TOUCH_TARGET, FONTS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { updateProject, getProject, getProjectWorkspaceMembers, getWorkspaceClients } from "../services/api";
import PressableScale from "./PressableScale";
import AppButton from "./AppButton";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const INK_ON_PRIMARY = "#2b1c04";

const PROJECT_COLORS = [
    "#ef4444", "#f97316", "#eab308", "#22c55e",
    "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
    "#6366f1", "#f43f5e", "#10b981", "#0ea5e9",
];

function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

interface EditProjectModalProps {
    visible: boolean;
    onClose: () => void;
    projectId: string;
}

export default function EditProjectModal({ visible, onClose, projectId }: EditProjectModalProps) {
    const { activeWorkspace, refreshData, tags: workspaceTags } = useWorkspace();
    const { colors, isDark } = useTheme();
    
    // Basic Info
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [description, setDescription] = useState("");
    const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
    
    // Team Assignment
    const [members, setMembers] = useState<any[]>([]);
    const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
    const [selectedMemberAccess, setSelectedMemberAccess] = useState<string[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    
    // Client Info
    const [isInternal, setIsInternal] = useState(false);
    const [companyName, setCompanyName] = useState("");
    const [registeredCompanyName, setRegisteredCompanyName] = useState("");
    const [directorName, setDirectorName] = useState("");
    const [address, setAddress] = useState("");
    const [gstNumber, setGstNumber] = useState("");
    const [contactPersonName, setContactPersonName] = useState("");
    const [contactNumber, setContactNumber] = useState("");
    
    // Existing Clients
    const [existingClients, setExistingClients] = useState<any[]>([]);
    const [showClientPicker, setShowClientPicker] = useState(false);

    // Pickers visibility
    const [showManagerPicker, setShowManagerPicker] = useState(false);
    const [showTeamPicker, setShowTeamPicker] = useState(false);
    const [managerSearch, setManagerSearch] = useState("");
    const [teamSearch, setTeamSearch] = useState("");

    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (visible && projectId) {
            loadProjectDetails();
            loadWorkspaceMembersAndClients();
        }
    }, [visible, projectId]);

    const handleNameChange = (val: string) => {
        setName(val);
        setSlug(slugify(val));
    };

    const loadProjectDetails = async () => {
        setFetching(true);
        setError(null);
        try {
            const data = await getProject(projectId);
            if (data) {
                setName(data.name || "");
                setSlug(data.slug || slugify(data.name || ""));
                setDescription(data.description || "");
                setSelectedColor(data.color || PROJECT_COLORS[0]);
                
                const isInternalProject = data.companyName === "Internal" || !!data.isInternal;
                setIsInternal(isInternalProject);
                
                // Client details
                const client = data.clint || data.clint?.[0] || {};
                setCompanyName(data.companyName || client.name || "");
                setRegisteredCompanyName(data.registeredCompanyName || client.registeredCompanyName || "");
                setDirectorName(data.directorName || client.directorName || "");
                setAddress(data.address || client.address || "");
                setGstNumber(data.gstNumber || client.gstNumber || "");
                
                const clientMember = client.clintMembers?.[0] || {};
                setContactPersonName(data.contactPerson || clientMember.name || "");
                setContactNumber(data.phoneNumber || clientMember.phoneNumber || "");

                // Identify manager
                const managerId = data.projectManagerId || 
                    data.projectManager?.id || 
                    data.projectMembers?.find((pm: any) => pm.projectRole === "PROJECT_MANAGER")?.userId ||
                    data.projectMembers?.find((pm: any) => pm.projectRole === "PROJECT_MANAGER")?.WorkspaceMember?.userId;
                
                if (managerId) {
                    setSelectedManagerId(managerId);
                }

                // Member access
                if (Array.isArray(data.memberAccess)) {
                    setSelectedMemberAccess(data.memberAccess);
                } else if (Array.isArray(data.projectMembers)) {
                    setSelectedMemberAccess(data.projectMembers.map((pm: any) => pm.workspaceMemberId || pm.userId || pm.id));
                }

                // Tags
                if (Array.isArray(data.tagIds)) {
                    setSelectedTagIds(data.tagIds);
                } else if (Array.isArray(data.tags)) {
                    setSelectedTagIds(data.tags.map((t: any) => t.id || t.tagId));
                }
            }
        } catch (err) {
            setError("Failed to load project details");
        } finally {
            setFetching(false);
        }
    };

    const loadWorkspaceMembersAndClients = async () => {
        if (!activeWorkspace) return;
        try {
            const [wMembers, wClients] = await Promise.all([
                getProjectWorkspaceMembers(activeWorkspace.id),
                getWorkspaceClients(activeWorkspace.id)
            ]);
            setMembers(wMembers || []);
            setExistingClients(wClients || []);
        } catch (err) {
            console.error("Failed to load workspace members and clients", err);
        }
    };

    const handleInternalToggle = (checked: boolean) => {
        setIsInternal(checked);
        if (checked) {
            setCompanyName("Internal");
            setRegisteredCompanyName("Company Internal Work");
            setDirectorName("Internal");
            setAddress("N/A");
            setGstNumber("Internal");
            setContactPersonName("Internal");
            setContactNumber("0000000000");
        } else {
            setCompanyName("");
            setRegisteredCompanyName("");
            setDirectorName("");
            setAddress("");
            setGstNumber("");
            setContactPersonName("");
            setContactNumber("");
        }
    };

    const handleSelectExistingClient = (client: any) => {
        setCompanyName(client.name || "");
        setRegisteredCompanyName(client.registeredCompanyName || "");
        setDirectorName(client.directorName || "");
        setAddress(client.address || "");
        setGstNumber(client.gstNumber || "");
        if (client.clintMembers && client.clintMembers.length > 0) {
            const m = client.clintMembers[0];
            setContactPersonName(m.name || "");
            setContactNumber(m.phoneNumber || "");
        }
        setShowClientPicker(false);
    };

    const handleSelectManager = (mId: string) => {
        const nextId = selectedManagerId === mId ? "" : mId;
        setSelectedManagerId(nextId || null);
        setShowManagerPicker(false);
        if (nextId && selectedMemberAccess.includes(nextId)) {
            setSelectedMemberAccess(selectedMemberAccess.filter(id => id !== nextId));
        }
    };

    const toggleMemberAccess = (memberId: string) => {
        if (selectedMemberAccess.includes(memberId)) {
            setSelectedMemberAccess(selectedMemberAccess.filter(id => id !== memberId));
        } else {
            setSelectedMemberAccess([...selectedMemberAccess, memberId]);
        }
    };

    const toggleTag = (tagId: string) => {
        if (selectedTagIds.includes(tagId)) {
            setSelectedTagIds(selectedTagIds.filter(id => id !== tagId));
        } else {
            setSelectedTagIds([...selectedTagIds, tagId]);
        }
    };

    const handleUpdate = async () => {
        if (!name.trim() || loading) return;
        setLoading(true);
        setError(null);
        try {
            const payload: any = {
                projectId,
                name: name.trim(),
                color: selectedColor,
                isInternal,
            };
            
            if (slug.trim().length >= 3) payload.slug = slug.trim();
            if (description.trim().length >= 3) payload.description = description.trim();
            
            if (!isInternal) {
                if (companyName.trim().length >= 3) payload.companyName = companyName.trim();
                if (registeredCompanyName.trim().length >= 3) payload.registeredCompanyName = registeredCompanyName.trim();
                if (directorName.trim().length >= 3) payload.directorName = directorName.trim();
                if (address.trim().length >= 3) payload.address = address.trim();
                if (gstNumber.trim().length > 0) payload.gstNumber = gstNumber.trim();
                if (contactPersonName.trim().length >= 3) payload.contactPerson = contactPersonName.trim();
                if (contactNumber.trim().length >= 10) payload.phoneNumber = contactNumber.trim();
            } else {
                payload.companyName = "Internal";
                payload.registeredCompanyName = "Company Internal Work";
                payload.directorName = "Internal";
                payload.address = "N/A";
                payload.gstNumber = "Internal";
                payload.contactPerson = "Internal";
                payload.phoneNumber = "0000000000";
            }

            if (selectedManagerId) {
                payload.projectManagerId = selectedManagerId;
                payload.projectLead = selectedManagerId;
            }

            if (selectedMemberAccess && selectedMemberAccess.length > 0) {
                payload.memberAccess = selectedMemberAccess;
            }

            if (selectedTagIds && selectedTagIds.length > 0) {
                payload.tagIds = selectedTagIds;
            }

            const res = await updateProject(projectId, payload);
            if (res.success || res.message) {
                await refreshData();
                onClose();
            } else {
                setError(res.error || "Failed to update project");
            }
        } catch (err: any) {
            setError(err.message || "An error occurred");
        } finally {
            setLoading(false);
        }
    };

    // Filter project managers exactly like web:
    // Web filters by workspaceRole === "MANAGER", or all managers if none explicitly marked
    const workspaceManagers = members.filter(m => m.workspaceRole === "MANAGER");
    const managerOptions = workspaceManagers.length > 0 ? workspaceManagers : members;

    const filteredManagers = managerOptions.filter(m => {
        if (!managerSearch) return true;
        const q = managerSearch.toLowerCase();
        const s = m.surname || m.user?.surname || "";
        const n = m.user?.name || "";
        const e = m.user?.email || "";
        return s.toLowerCase().includes(q) || n.toLowerCase().includes(q) || e.toLowerCase().includes(q);
    });

    const selectedManagerObj = members.find(m => m.id === selectedManagerId || m.userId === selectedManagerId);
    const selectedManagerDisplayName = selectedManagerObj?.surname || selectedManagerObj?.user?.surname || selectedManagerObj?.user?.name || "Unknown";

    // Non-admin workspace members for Team Assignment
    const nonAdminMembers = members.filter(m => m.workspaceRole !== "OWNER" && m.workspaceRole !== "ADMIN");
    const filteredTeamMembers = nonAdminMembers.filter(m => {
        if (!teamSearch) return true;
        const q = teamSearch.toLowerCase();
        const s = m.surname || m.user?.surname || "";
        const n = m.user?.name || "";
        const e = m.user?.email || "";
        return s.toLowerCase().includes(q) || n.toLowerCase().includes(q) || e.toLowerCase().includes(q);
    });

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.container}
                >
                    <View style={[styles.sheet, { backgroundColor: colors.surfaceSolid }]}>
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={[styles.handle, { backgroundColor: colors.border }]} />
                            <View style={styles.titleRow}>
                                <View style={styles.titleLeft}>
                                    <View style={[styles.iconBox, { backgroundColor: selectedColor + "25" }]}>
                                        <Ionicons name="create-outline" size={18} color={selectedColor} />
                                    </View>
                                    <View>
                                        <Text style={[styles.title, { color: colors.text }]}>Edit Project Settings</Text>
                                        <Text style={[styles.subtitle, { color: colors.textDim }]}>Update basic information, team assignments, and client billing details.</Text>
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

                        {fetching ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={[styles.loadingText, { color: colors.textDim }]}>Loading project information...</Text>
                            </View>
                        ) : (
                            <ScrollView
                                style={styles.content}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                {/* Section 1: Basic Information */}
                                <View style={styles.sectionHeaderRow}>
                                    <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Basic Information</Text>
                                </View>

                                {/* Project Name */}
                                <View style={styles.row}>
                                    <Text style={[styles.label, { color: colors.textDim }]}>Project Name</Text>
                                    <Text style={[styles.label, { color: colors.primary, marginLeft: 4 }]}>*</Text>
                                </View>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                    placeholder="Enter project name"
                                    placeholderTextColor={colors.textDim}
                                    value={name}
                                    onChangeText={handleNameChange}
                                />
                                {slug ? (
                                    <Text style={[styles.slugText, { color: colors.textDim }]}>
                                        Slug: <Text style={styles.slugCode}>{slug}</Text>
                                    </Text>
                                ) : null}

                                {/* Description */}
                                <Text style={[styles.label, { color: colors.textDim }]}>Description</Text>
                                <TextInput
                                    style={[styles.input, styles.textArea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                    placeholder="What is this project about?"
                                    placeholderTextColor={colors.textDim}
                                    value={description}
                                    onChangeText={setDescription}
                                    multiline
                                    numberOfLines={4}
                                />

                                {/* Section 2: Team Assignment */}
                                <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
                                    <Ionicons name="people-outline" size={18} color={colors.primary} />
                                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Team Assignment</Text>
                                </View>

                                {/* Project Manager */}
                                <View style={styles.row}>
                                    <Text style={[styles.label, { color: colors.textDim }]}>Project Manager</Text>
                                    <Text style={[styles.label, { color: colors.primary, marginLeft: 4 }]}>*</Text>
                                </View>
                                <Text style={[styles.helperText, { color: colors.textDim }]}>
                                    Select a project manager who will have full project access. (Managers only)
                                </Text>
                                <PressableScale
                                    onPress={() => setShowManagerPicker(!showManagerPicker)}
                                    style={[styles.dropdownTrigger, { backgroundColor: colors.background, borderColor: colors.border }]}
                                    haptic="selection"
                                >
                                    <View style={styles.dropdownValueRow}>
                                        {selectedManagerId && selectedManagerObj ? (
                                            <View style={[styles.managerBadge, { backgroundColor: colors.primary + "18" }]}>
                                                <Text style={[styles.managerBadgeText, { color: colors.primary }]}>
                                                    {selectedManagerDisplayName}
                                                </Text>
                                            </View>
                                        ) : (
                                            <Text style={[styles.dropdownPlaceholder, { color: colors.textDim }]}>Select manager</Text>
                                        )}
                                    </View>
                                    <Ionicons name={showManagerPicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textDim} />
                                </PressableScale>

                                {showManagerPicker && (
                                    <View style={[styles.pickerBox, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}>
                                        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                                            <Ionicons name="search" size={14} color={colors.textDim} />
                                            <TextInput
                                                style={[styles.searchInput, { color: colors.text }]}
                                                placeholder="Search managers..."
                                                placeholderTextColor={colors.textDim}
                                                value={managerSearch}
                                                onChangeText={setManagerSearch}
                                            />
                                        </View>
                                        <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                                            {filteredManagers.map((m) => {
                                                const mId = m.id || m.userId;
                                                const isSelected = selectedManagerId === mId || selectedManagerId === m.userId;
                                                const mName = m.surname || m.user?.surname || m.user?.name || "Manager";

                                                return (
                                                    <PressableScale
                                                        key={mId}
                                                        onPress={() => handleSelectManager(mId)}
                                                        style={[
                                                            styles.pickerRow,
                                                            { borderBottomColor: colors.border },
                                                            isSelected && { backgroundColor: colors.primary + "14" }
                                                        ]}
                                                        haptic="selection"
                                                    >
                                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                                            <View style={[styles.avatarSmall, { backgroundColor: colors.primary + "22" }]}>
                                                                <Text style={[styles.avatarSmallText, { color: colors.primary }]}>
                                                                    {(mName?.[0] || "?").toUpperCase()}
                                                                </Text>
                                                            </View>
                                                            <Text style={[styles.pickerRowText, { color: colors.text }, isSelected && { fontFamily: FONTS.bold, color: colors.primary }]}>
                                                                {mName}
                                                            </Text>
                                                        </View>
                                                        {isSelected && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                                                    </PressableScale>
                                                );
                                            })}
                                            {filteredManagers.length === 0 && (
                                                <Text style={[styles.emptyPickerText, { color: colors.textDim }]}>
                                                    No workspace managers found.
                                                </Text>
                                            )}
                                        </ScrollView>
                                    </View>
                                )}

                                {/* Team Members / Member Access */}
                                <Text style={[styles.label, { color: colors.textDim }]}>Team Members</Text>
                                <PressableScale
                                    onPress={() => setShowTeamPicker(!showTeamPicker)}
                                    style={[styles.dropdownTrigger, { backgroundColor: colors.background, borderColor: colors.border }]}
                                    haptic="selection"
                                >
                                    <View style={styles.dropdownValueRow}>
                                        {selectedMemberAccess.length > 0 ? (
                                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                                                {selectedMemberAccess.map((id) => {
                                                    const mem = members.find(m => m.id === id || m.userId === id);
                                                    const memName = mem?.surname || mem?.user?.surname || mem?.user?.name || "User";
                                                    return (
                                                        <View key={id} style={[styles.memberAccessChip, { backgroundColor: colors.surfaceHighlight }]}>
                                                            <Text style={[styles.memberAccessChipText, { color: colors.text }]}>
                                                                {memName}
                                                            </Text>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        ) : (
                                            <Text style={[styles.dropdownPlaceholder, { color: colors.textDim }]}>Add team members</Text>
                                        )}
                                    </View>
                                    <Ionicons name={showTeamPicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textDim} />
                                </PressableScale>

                                {showTeamPicker && (
                                    <View style={[styles.pickerBox, { backgroundColor: colors.surfaceSolid, borderColor: colors.border }]}>
                                        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                                            <Ionicons name="search" size={14} color={colors.textDim} />
                                            <TextInput
                                                style={[styles.searchInput, { color: colors.text }]}
                                                placeholder="Search members..."
                                                placeholderTextColor={colors.textDim}
                                                value={teamSearch}
                                                onChangeText={setTeamSearch}
                                            />
                                        </View>
                                        <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                                            {filteredTeamMembers.map((m) => {
                                                const mId = m.id || m.userId;
                                                const isSelected = selectedMemberAccess.includes(mId);
                                                const isPM = selectedManagerId === mId || selectedManagerId === m.userId;
                                                const mName = m.surname || m.user?.surname || m.user?.name || "Member";

                                                return (
                                                    <PressableScale
                                                        key={mId}
                                                        onPress={() => !isPM && toggleMemberAccess(mId)}
                                                        disabled={isPM}
                                                        style={[
                                                            styles.pickerRow,
                                                            { borderBottomColor: colors.border },
                                                            isSelected && { backgroundColor: colors.primary + "14" },
                                                            isPM && { opacity: 0.5 }
                                                        ]}
                                                        haptic="selection"
                                                    >
                                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                                            <View style={[styles.checkboxSmall, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                                                                {isSelected && <Ionicons name="checkmark" size={10} color="#fff" />}
                                                            </View>
                                                            <Text style={[styles.pickerRowText, { color: colors.text }]}>
                                                                {mName}
                                                                {isPM ? " (Project Manager)" : ""}
                                                            </Text>
                                                        </View>
                                                    </PressableScale>
                                                );
                                            })}
                                            {filteredTeamMembers.length === 0 && (
                                                <Text style={[styles.emptyPickerText, { color: colors.textDim }]}>
                                                    No members found.
                                                </Text>
                                            )}
                                        </ScrollView>
                                    </View>
                                )}

                                {/* Project Tags Selection */}
                                {workspaceTags && workspaceTags.length > 0 && (
                                    <>
                                        <Text style={[styles.label, { color: colors.textDim }]}>Project Tags</Text>
                                        <Text style={[styles.helperText, { color: colors.textDim }]}>
                                            Select workspace tags that will be available for tasks in this project.
                                        </Text>
                                        <View style={styles.tagsContainer}>
                                            {workspaceTags.map((tag: any) => {
                                                const isTagSelected = selectedTagIds.includes(tag.id);
                                                return (
                                                    <PressableScale
                                                        key={tag.id}
                                                        onPress={() => toggleTag(tag.id)}
                                                        haptic="selection"
                                                        style={[
                                                            styles.tagChip,
                                                            { backgroundColor: colors.background, borderColor: colors.border },
                                                            isTagSelected && { backgroundColor: (tag.color || colors.primary) + "20", borderColor: tag.color || colors.primary }
                                                        ]}
                                                    >
                                                        {isTagSelected && (
                                                            <Ionicons name="checkmark-circle" size={14} color={tag.color || colors.primary} style={{ marginRight: 4 }} />
                                                        )}
                                                        <Text
                                                            style={[
                                                                styles.tagChipText,
                                                                { color: colors.textDim },
                                                                isTagSelected && { color: tag.color || colors.primary, fontFamily: FONTS.bold }
                                                            ]}
                                                        >
                                                            {tag.name}
                                                        </Text>
                                                    </PressableScale>
                                                );
                                            })}
                                        </View>
                                    </>
                                )}

                                {/* Section 3: Client Information */}
                                <View style={[styles.sectionHeaderRow, { marginTop: 24, justifyContent: "space-between" }]}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                        <Ionicons name="briefcase-outline" size={18} color={colors.primary} />
                                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Client Information</Text>
                                    </View>

                                    {/* Internal project toggle */}
                                    <PressableScale
                                        onPress={() => handleInternalToggle(!isInternal)}
                                        style={[styles.internalToggleRow, { backgroundColor: isInternal ? colors.primary + "18" : colors.background, borderColor: colors.border }]}
                                        haptic="selection"
                                    >
                                        <View style={[styles.checkboxSmall, isInternal && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                                            {isInternal && <Ionicons name="checkmark" size={10} color="#fff" />}
                                        </View>
                                        <Text style={[styles.internalToggleText, { color: isInternal ? colors.primary : colors.textDim }]}>
                                            Internal Project?
                                        </Text>
                                    </PressableScale>
                                </View>

                                {!isInternal && (
                                    <>
                                        {/* Use Existing Client Button */}
                                        {existingClients.length > 0 && (
                                            <PressableScale
                                                onPress={() => setShowClientPicker(!showClientPicker)}
                                                style={[styles.useExistingClientBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                                                haptic="selection"
                                            >
                                                <Ionicons name="people-circle-outline" size={16} color={colors.primary} />
                                                <Text style={[styles.useExistingClientText, { color: colors.primary }]}>
                                                    Use Existing Client
                                                </Text>
                                                <Ionicons name="chevron-forward" size={12} color={colors.primary} />
                                            </PressableScale>
                                        )}

                                        {showClientPicker && (
                                            <View style={[styles.pickerBox, { backgroundColor: colors.surfaceSolid, borderColor: colors.border, marginBottom: 12 }]}>
                                                <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                                                    {existingClients.map((client) => (
                                                        <PressableScale
                                                            key={client.id}
                                                            onPress={() => handleSelectExistingClient(client)}
                                                            style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                                                            haptic="selection"
                                                        >
                                                            <View>
                                                                <Text style={[styles.pickerRowText, { color: colors.text, fontFamily: FONTS.bold }]}>
                                                                    {client.name}
                                                                </Text>
                                                                {client.registeredCompanyName ? (
                                                                    <Text style={[styles.clientSubtext, { color: colors.textDim }]}>
                                                                        {client.registeredCompanyName}
                                                                    </Text>
                                                                ) : null}
                                                            </View>
                                                        </PressableScale>
                                                    ))}
                                                </ScrollView>
                                            </View>
                                        )}

                                        <Text style={[styles.label, { color: colors.textDim }]}>Company Name</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                            placeholder="e.g. Google"
                                            placeholderTextColor={colors.textDim}
                                            value={companyName}
                                            onChangeText={setCompanyName}
                                        />

                                        <Text style={[styles.label, { color: colors.textDim }]}>Registered Company Name</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                            placeholder="Registered company name"
                                            placeholderTextColor={colors.textDim}
                                            value={registeredCompanyName}
                                            onChangeText={setRegisteredCompanyName}
                                        />

                                        <View style={styles.row}>
                                            <View style={styles.col}>
                                                <Text style={[styles.label, { color: colors.textDim }]}>Director Name</Text>
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                                    placeholder="eg: John Doe (MD)"
                                                    placeholderTextColor={colors.textDim}
                                                    value={directorName}
                                                    onChangeText={setDirectorName}
                                                />
                                            </View>
                                            <View style={styles.spacer} />
                                            <View style={styles.col}>
                                                <Text style={[styles.label, { color: colors.textDim }]}>Address</Text>
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                                    placeholder="eg: #123, Street name"
                                                    placeholderTextColor={colors.textDim}
                                                    value={address}
                                                    onChangeText={setAddress}
                                                />
                                            </View>
                                        </View>

                                        <Text style={[styles.label, { color: colors.textDim }]}>GST Number</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                            placeholder="12ABCDE3456F7Z8"
                                            placeholderTextColor={colors.textDim}
                                            value={gstNumber}
                                            onChangeText={setGstNumber}
                                            maxLength={15}
                                        />

                                        <View style={styles.row}>
                                            <View style={styles.col}>
                                                <Text style={[styles.label, { color: colors.textDim }]}>Contact Person Name</Text>
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                                    placeholder="e.g. John Doe"
                                                    placeholderTextColor={colors.textDim}
                                                    value={contactPersonName}
                                                    onChangeText={setContactPersonName}
                                                />
                                            </View>
                                            <View style={styles.spacer} />
                                            <View style={styles.col}>
                                                <Text style={[styles.label, { color: colors.textDim }]}>Phone Number</Text>
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                                    placeholder="e.g. +91 98765 43210"
                                                    placeholderTextColor={colors.textDim}
                                                    value={contactNumber}
                                                    onChangeText={setContactNumber}
                                                    keyboardType="phone-pad"
                                                />
                                            </View>
                                        </View>
                                    </>
                                )}

                                {/* Color Picker */}
                                <Text style={[styles.label, { color: colors.textDim, marginTop: 24 }]}>Project Color</Text>
                                <View style={styles.colorGrid}>
                                    {PROJECT_COLORS.map((c) => (
                                        <PressableScale
                                            key={c}
                                            onPress={() => setSelectedColor(c)}
                                            haptic="selection"
                                            accessibilityRole="button"
                                            accessibilityLabel={`Color ${c}`}
                                            accessibilityState={{ selected: selectedColor === c }}
                                            style={[
                                                styles.colorSwatch,
                                                { backgroundColor: c },
                                                selectedColor === c && styles.colorSwatchSelected
                                            ]}
                                        >
                                            {selectedColor === c && (
                                                <Ionicons name="checkmark" size={14} color="#fff" />
                                            )}
                                        </PressableScale>
                                    ))}
                                </View>

                                {error && (
                                    <Text style={[styles.errorText, { color: colors.validationError }]} accessibilityRole="alert">
                                        {error}
                                    </Text>
                                )}
                                <View style={{ height: 40 }} />
                            </ScrollView>
                        )}

                        {/* Footer */}
                        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surfaceSolid }]}>
                            <AppButton
                                label="Save Changes"
                                onPress={handleUpdate}
                                loading={loading}
                                disabled={!name.trim() || fetching}
                                icon="save-outline"
                                haptic="medium"
                                fullWidth
                                style={{ backgroundColor: selectedColor, height: 52 }}
                                textStyle={{ color: "#fff" }}
                            />
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        justifyContent: "flex-end",
    },
    container: { width: "100%" },
    sheet: {
        borderTopLeftRadius: BORDER_RADIUS.xl,
        borderTopRightRadius: BORDER_RADIUS.xl,
        maxHeight: "92%",
    },
    header: {
        alignItems: "center",
        paddingTop: 12,
        paddingBottom: 8,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
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
        gap: 10,
        flex: 1,
    },
    iconBox: {
        width: 34,
        height: 34,
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    title: {
        fontSize: 17,
        fontFamily: FONTS.bold,
    },
    subtitle: {
        fontSize: 11,
        marginTop: 1,
    },
    closeBtn: { minWidth: TOUCH_TARGET.min, minHeight: TOUCH_TARGET.min, alignItems: "flex-end", justifyContent: "center" },
    content: { padding: SPACING.lg },
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
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
    },
    sectionTitle: {
        fontSize: 15,
        fontFamily: FONTS.bold,
    },
    label: {
        fontSize: 12,
        fontFamily: FONTS.bold,
        marginBottom: 6,
        marginTop: 14,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    helperText: {
        fontSize: 11,
        fontFamily: FONTS.regular,
        marginBottom: 8,
    },
    slugText: {
        fontSize: 11,
        marginTop: 4,
        paddingHorizontal: 2,
    },
    slugCode: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    input: {
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        fontSize: 15,
        borderWidth: 1,
    },
    textArea: {
        height: 80,
        textAlignVertical: "top",
    },
    dropdownTrigger: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        borderWidth: 1,
        minHeight: 48,
    },
    dropdownValueRow: {
        flex: 1,
        marginRight: 8,
    },
    dropdownPlaceholder: {
        fontSize: 14,
        fontFamily: FONTS.regular,
    },
    managerBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    managerBadgeText: {
        fontSize: 13,
        fontFamily: FONTS.semibold,
    },
    memberAccessChip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
    },
    memberAccessChipText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
    },
    pickerBox: {
        borderWidth: 1,
        borderRadius: BORDER_RADIUS.md,
        marginTop: 6,
        padding: 6,
    },
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderRadius: BORDER_RADIUS.sm,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginBottom: 6,
    },
    searchInput: {
        flex: 1,
        fontSize: 13,
        paddingVertical: 2,
    },
    pickerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    pickerRowText: {
        fontSize: 14,
        fontFamily: FONTS.medium,
    },
    emptyPickerText: {
        textAlign: "center",
        fontSize: 12,
        paddingVertical: 12,
    },
    avatarSmall: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    avatarSmallText: {
        fontSize: 11,
        fontFamily: FONTS.bold,
    },
    checkboxSmall: {
        width: 16,
        height: 16,
        borderRadius: 3,
        borderWidth: 1.5,
        borderColor: "#888",
        justifyContent: "center",
        alignItems: "center",
    },
    internalToggleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
    },
    internalToggleText: {
        fontSize: 12,
        fontFamily: FONTS.semibold,
    },
    useExistingClientBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        alignSelf: "flex-start",
        marginTop: 8,
        marginBottom: 4,
    },
    useExistingClientText: {
        fontSize: 12,
        fontFamily: FONTS.semibold,
    },
    clientSubtext: {
        fontSize: 10,
        marginTop: 2,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
    },
    col: { flex: 1 },
    spacer: { width: SPACING.md },
    tagsContainer: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 4,
    },
    tagChip: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
    },
    tagChipText: {
        fontSize: 12,
        fontFamily: FONTS.medium,
    },
    colorGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        marginTop: 4,
    },
    colorSwatch: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
    },
    colorSwatchSelected: {
        borderWidth: 3,
        borderColor: "#ffffff",
        transform: [{ scale: 1.1 }],
    },
    errorText: {
        fontSize: 13,
        fontFamily: FONTS.medium,
        marginTop: SPACING.md,
    },
    footer: {
        padding: SPACING.lg,
        borderTopWidth: 1,
    },
});
