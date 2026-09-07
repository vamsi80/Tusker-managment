import React, { useState, useEffect, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Modal,
    Alert,
    Platform,
    FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { useTheme } from "../context/ThemeContext";
import OptionPickerSheet, { PickerOption } from "../components/OptionPickerSheet";
import { DetailSkeleton } from "../components/ScreenSkeleton";
import { useWorkspace } from "../context/WorkspaceContext";
import { SPACING, BORDER_RADIUS, FONTS } from "../constants/theme";
import {
    getProcurableProjects,
    getWorkspaceMembers,
    getMaterialsCatalog,
    getIndentUnits,
    getIndentableProjectTasks,
    createIndent,
    editIndent,
} from "../services/api";

/** Used only when the workspace has no units configured yet — mirrors
 * packages/core/src/lib/procurement/units.ts, which the mobile app (installed
 * standalone, outside the pnpm workspace) cannot import directly. */
const FALLBACK_UNITS = [
    { abbreviation: "pcs", name: "Pieces" },
    { abbreviation: "nos", name: "Numbers" },
    { abbreviation: "kg", name: "Kilogram" },
    { abbreviation: "ton", name: "Tonne" },
    { abbreviation: "gm", name: "Gram" },
    { abbreviation: "ltr", name: "Litre" },
    { abbreviation: "ml", name: "Millilitre" },
    { abbreviation: "mtr", name: "Metre" },
    { abbreviation: "ft", name: "Feet" },
    { abbreviation: "cm", name: "Centimetre" },
    { abbreviation: "sqft", name: "Square Feet" },
    { abbreviation: "sqmtr", name: "Square Metre" },
    { abbreviation: "bag", name: "Bag" },
    { abbreviation: "box", name: "Box" },
    { abbreviation: "roll", name: "Roll" },
];
import { useResponsive } from "../hooks/useResponsive";

export default function CreateIndentScreen({ route, navigation }: any) {
    const { colors, isDark } = useTheme();
    const { activeWorkspace } = useWorkspace();
    const { MAX_CONTENT_WIDTH, value } = useResponsive();

    // Check if edit mode
    const editPayload = route.params?.indent;
    const isEdit = !!editPayload;

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Data lists
    const [projects, setProjects] = useState<any[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [catalog, setCatalog] = useState<any[]>([]);
    const [units, setUnits] = useState<{ abbreviation: string; name: string }[]>([]);
    const [projectTasks, setProjectTasks] = useState<any[]>([]);
    const [loadingProjectTasks, setLoadingProjectTasks] = useState(false);

    // Form states
    // Web asks this only from the global procurement hub (the app's only
    // entry point today) and, on "No", creates a workspace-level indent with
    // no project at all. There is no Indent Name field on web — the name is
    // always generated server-side from the project/material/date.
    const [isProjectRelated, setIsProjectRelated] = useState(true);
    const [description, setDescription] = useState("");
    const [selectedProject, setSelectedProject] = useState<any>(null);
    const [selectedTask, setSelectedTask] = useState<any>(null);
    // The API requires approverIds (workspaceMember ids, at least one). Web
    // sources these from workspace OWNERs; a single "assignee" was never a
    // field the create endpoint accepted.
    const [approverIds, setApproverIds] = useState<string[]>([]);
    const [approverPickerOpen, setApproverPickerOpen] = useState(false);
    const [expectedDelivery, setExpectedDelivery] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [materials, setMaterials] = useState<any[]>([]);

    // Optional charges — mirrors the web create form's toggle-to-reveal fields.
    // taxPercent/exciseDutyPercent/vatPercent are plain percentages; transport
    // and labour are flat rupee amounts, converted to paise only at submit
    // (IndentLineItem/Indent store money as integer paise; see the schema).
    const [includeTax, setIncludeTax] = useState(false);
    const [includeExciseDuty, setIncludeExciseDuty] = useState(false);
    const [includeVat, setIncludeVat] = useState(false);
    const [includeTransport, setIncludeTransport] = useState(false);
    const [includeLabour, setIncludeLabour] = useState(false);
    const [taxPercent, setTaxPercent] = useState("");
    const [exciseDutyPercent, setExciseDutyPercent] = useState("");
    const [vatPercent, setVatPercent] = useState("");
    const [transportCharge, setTransportCharge] = useState("");
    const [labourCharge, setLabourCharge] = useState("");

    // Modal state for adding material item
    const [itemModalVisible, setItemModalVisible] = useState(false);
    const [matName, setMatName] = useState("");
    const [matUnit, setMatUnit] = useState("pcs");
    const [matQty, setMatQty] = useState("");
    const [matEstPrice, setMatEstPrice] = useState("");
    const [matTotalPrice, setMatTotalPrice] = useState("");
    const [matSpec, setMatSpec] = useState("");
    const [matDesc, setMatDesc] = useState("");

    // Autocomplete list
    const [autocompleteList, setAutocompleteList] = useState<any[]>([]);

    const loadData = useCallback(async () => {
        if (!activeWorkspace?.id) return;
        try {
            const [projectsData, membersData, catalogData, unitsData] = await Promise.all([
                getProcurableProjects(activeWorkspace.id),
                getWorkspaceMembers(activeWorkspace.id, "OWNER"),
                getMaterialsCatalog(activeWorkspace.id),
                getIndentUnits(activeWorkspace.id),
            ]);
            setProjects(projectsData);
            setMembers(membersData);
            setCatalog(catalogData);
            setUnits(unitsData.length > 0 ? unitsData : FALLBACK_UNITS);

            if (isEdit) {
                setDescription(editPayload.description || "");
                setExpectedDelivery(editPayload.expectedDelivery ? new Date(editPayload.expectedDelivery) : new Date());

                // Set materials — lineItems is the real field name on the
                // single-indent GET response (see IndentRepository.findById);
                // indent_line_item never existed there.
                if (editPayload.lineItems) {
                    setMaterials(editPayload.lineItems.map((item: any) => ({
                        materialName: item.materialName,
                        unit: item.unit,
                        quantity: String(item.quantity),
                        // The API stores estimatedUnitPrice as integer paise; the form
                        // works in rupees, so divide before displaying it.
                        estimatedUnitPrice: item.estimatedUnitPrice ? String(item.estimatedUnitPrice / 100) : "",
                        specifications: item.specifications || "",
                        description: item.description || "",
                    })));
                }

                // Match project. No project on the saved indent means it was
                // created as a workspace-level (not-project-related) indent.
                setIsProjectRelated(!!editPayload.projectId);
                const matchedProj = projectsData.find(p => p.id === editPayload.projectId);
                if (matchedProj) setSelectedProject(matchedProj);

                // Match assignee
                if (Array.isArray(editPayload.approverIds)) {
                    setApproverIds(editPayload.approverIds);
                } else if (Array.isArray(editPayload.approvals)) {
                    setApproverIds(editPayload.approvals.map((a: any) => a.workspaceMemberId).filter(Boolean));
                }

                // Charges: percentages are plain numbers; transport/labour are
                // paise and need dividing before they land in a rupee input.
                if (editPayload.taxPercent != null) { setIncludeTax(true); setTaxPercent(String(editPayload.taxPercent)); }
                if (editPayload.exciseDutyPercent != null) { setIncludeExciseDuty(true); setExciseDutyPercent(String(editPayload.exciseDutyPercent)); }
                if (editPayload.vatPercent != null) { setIncludeVat(true); setVatPercent(String(editPayload.vatPercent)); }
                if (editPayload.transportCharge != null) { setIncludeTransport(true); setTransportCharge(String(editPayload.transportCharge / 100)); }
                if (editPayload.labourCharge != null) { setIncludeLabour(true); setLabourCharge(String(editPayload.labourCharge / 100)); }
            }
        } catch (error) {
            console.error("CreateIndentScreen load error:", error);
        } finally {
            setLoading(false);
        }
    }, [activeWorkspace?.id, isEdit, editPayload]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Procurement-taggable subtasks for the selected project, excluding ones
    // that already have an indent — mirrors web's per-project task fetch.
    // "Link to Subtask" is optional; selecting one auto-fills the delivery
    // date from the task's due date, same as web's handleTaskChange.
    useEffect(() => {
        if (!activeWorkspace?.id || !selectedProject?.id || !isProjectRelated) {
            setProjectTasks([]);
            return;
        }
        let cancelled = false;
        setLoadingProjectTasks(true);
        getIndentableProjectTasks(activeWorkspace.id, selectedProject.id).then((tasks) => {
            if (cancelled) return;
            setProjectTasks(tasks);
            setLoadingProjectTasks(false);
            if (isEdit && editPayload?.taskId) {
                const matched = tasks.find((t: any) => t.id === editPayload.taskId);
                if (matched) setSelectedTask(matched);
            }
        });
        return () => { cancelled = true; };
    }, [activeWorkspace?.id, selectedProject?.id, isProjectRelated, isEdit, editPayload?.taskId]);

    const handleTaskSelect = (task: any | null) => {
        setSelectedTask(task);
        if (task?.dueDate) {
            const due = new Date(task.dueDate);
            if (!isNaN(due.getTime())) setExpectedDelivery(due);
        }
    };

    const handleMatNameChange = (text: string) => {
        setMatName(text);
        if (!text) {
            setAutocompleteList([]);
            return;
        }
        // Filter catalog
        const filtered = catalog.filter(c => c.name.toLowerCase().includes(text.toLowerCase())).slice(0, 5);
        setAutocompleteList(filtered);
    };

    const selectAutocompleteItem = (item: any) => {
        setMatName(item.name);
        if (item.unit) {
            setMatUnit(item.unit);
        }
        setAutocompleteList([]);
    };

    // Unit price, quantity and total price stay mutually consistent — mirrors
    // web's handleRowChange: editing quantity or unit price recomputes the
    // total; editing the total back-derives the unit price.
    const handleMatQtyChange = (text: string) => {
        setMatQty(text);
        const qty = Number(text) || 0;
        if (matEstPrice !== "" && !isNaN(Number(matEstPrice))) {
            setMatTotalPrice(qty > 0 ? String(Math.round(Number(matEstPrice) * qty * 100) / 100) : "");
        } else if (matTotalPrice !== "" && qty > 0 && !isNaN(Number(matTotalPrice))) {
            setMatEstPrice(String(Math.round((Number(matTotalPrice) / qty) * 100) / 100));
        }
    };
    const handleMatUnitPriceChange = (text: string) => {
        setMatEstPrice(text);
        const qty = Number(matQty) || 0;
        if (text === "") {
            setMatTotalPrice("");
        } else if (!isNaN(Number(text))) {
            setMatTotalPrice(String(Math.round(Number(text) * qty * 100) / 100));
        }
    };
    const handleMatTotalPriceChange = (text: string) => {
        setMatTotalPrice(text);
        const qty = Number(matQty) || 0;
        if (text === "") {
            setMatEstPrice("");
        } else if (!isNaN(Number(text)) && qty > 0) {
            setMatEstPrice(String(Math.round((Number(text) / qty) * 100) / 100));
        }
    };

    const handleAddMaterial = () => {
        if (!matName.trim()) {
            Alert.alert("Error", "Material name is required");
            return;
        }
        if (!matUnit.trim()) {
            Alert.alert("Error", "Unit is required");
            return;
        }
        if (!matQty || isNaN(Number(matQty)) || Number(matQty) <= 0) {
            Alert.alert("Error", "Quantity must be a positive number");
            return;
        }

        const newItem = {
            materialName: matName.trim(),
            unit: matUnit.trim(),
            quantity: String(Number(matQty)),
            estimatedUnitPrice: matEstPrice ? String(Number(matEstPrice)) : undefined,
            specifications: matSpec.trim() || undefined,
            description: matDesc.trim() || undefined,
        };

        setMaterials([...materials, newItem]);

        // Reset modal fields
        setMatName("");
        setMatUnit("pcs");
        setMatQty("");
        setMatEstPrice("");
        setMatTotalPrice("");
        setMatSpec("");
        setMatDesc("");
        setItemModalVisible(false);
    };

    const handleRemoveMaterial = (index: number) => {
        const updated = materials.filter((_, idx) => idx !== index);
        setMaterials(updated);
    };

    const approverOptions: PickerOption[] = members.map((m: any) => ({
        id: m.id,
        label: m.user?.surname || m.user?.name || "Member",
        searchText: m.user?.email || "",
    }));

    const approverSummary =
        approverIds.length === 0
            ? "Select approvers"
            : approverIds.length === 1
                ? (approverOptions.find(o => o.id === approverIds[0])?.label ?? "1 selected")
                : `${approverIds.length} selected`;

    const handleSubmit = async () => {
        if (!activeWorkspace?.id) return;

        // Validation order matches web's handleSubmit exactly: project (only
        // when project-related) → approvers → charge ranges → per-line-item
        // fields. Web has no Indent Name field to validate — the name is
        // always generated server-side.
        if (isProjectRelated && !selectedProject) {
            Alert.alert("Error", "Please select a project");
            return;
        }
        if (approverIds.length === 0) {
            Alert.alert("Error", "Select at least one owner for approval");
            return;
        }
        const pctCharges: [string, boolean, string][] = [
            ["Tax", includeTax, taxPercent],
            ["Excise duty", includeExciseDuty, exciseDutyPercent],
            ["VAT", includeVat, vatPercent],
        ];
        for (const [label, on, value] of pctCharges) {
            if (!on || value === "") continue;
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
                Alert.alert("Error", `${label} must be between 0% and 100%`);
                return;
            }
        }
        const flatCharges: [string, boolean, string][] = [
            ["Transportation charge", includeTransport, transportCharge],
            ["Labour charge", includeLabour, labourCharge],
        ];
        for (const [label, on, value] of flatCharges) {
            if (!on || value === "") continue;
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 0) {
                Alert.alert("Error", `${label} must be a positive amount`);
                return;
            }
        }
        if (materials.length === 0) {
            Alert.alert("Error", "Please add at least one material item");
            return;
        }

        setSubmitting(true);
        try {
            const trimmedDescription = description.trim();

            // Money fields round-trip through paise: IndentLineItem.estimatedUnitPrice
            // and Indent.transportCharge/labourCharge are integer paise columns,
            // while taxPercent/exciseDutyPercent/vatPercent are plain percentages
            // (Decimal(5,2)) — confirmed against packages/db/prisma/schema.prisma.
            const toPaise = (rupees: string) => Math.round(parseFloat(rupees) * 100);
            const charges: any = {
                taxPercent: includeTax && taxPercent ? Number(taxPercent) : undefined,
                exciseDutyPercent: includeExciseDuty && exciseDutyPercent ? Number(exciseDutyPercent) : undefined,
                vatPercent: includeVat && vatPercent ? Number(vatPercent) : undefined,
                transportCharge: includeTransport && transportCharge ? toPaise(transportCharge) : undefined,
                labourCharge: includeLabour && labourCharge ? toPaise(labourCharge) : undefined,
            };

            if (isEdit) {
                // UpdateIndentSchema (apps/api .../procurement-indents.ts) only
                // accepts name/description/expectedDelivery/approverIds/charges —
                // it has no projectId/taskId/lineItems fields. Sending those was
                // silently dropped by zod, which made "editing materials" a no-op
                // that still reported success. Send only what the route reads.
                const patch: any = {
                    expectedDelivery: expectedDelivery.toISOString(),
                    approverIds,
                    ...charges,
                };
                patch.description = trimmedDescription || null;
                await editIndent(activeWorkspace.id, editPayload.id, patch);
                Alert.alert("Success", "Indent request updated successfully.");
            } else {
                // Shape mirrors CreateIndentSchema: workspaceId lives in the BODY
                // (a query param alone is rejected), the array is `lineItems` (not
                // `materials` — an unknown key is stripped, silently creating an
                // indent with no items), and `description` must be omitted rather
                // than sent as null. `name` is left unset entirely — web's form has
                // no name field either; the server always generates one
                // ("<Project or General> - <first material> - <date>") unless a
                // caller explicitly supplies one, which no UI here does.
                const payload: any = {
                    workspaceId: activeWorkspace.id,
                    projectId: isProjectRelated ? selectedProject.id : undefined,
                    taskId: isProjectRelated ? selectedTask?.id || undefined : undefined,
                    expectedDelivery: expectedDelivery.toISOString(),
                    approverIds,
                    // No in-project entry point exists yet (CreateIndentScreen is
                    // only reachable from the global Procurement hub), so this
                    // always matches web's global-hub behaviour.
                    raisedInProject: false,
                    lineItems: materials.map(m => ({
                        materialCatalogId: m.materialCatalogId || undefined,
                        materialName: m.materialName,
                        unit: m.unit,
                        quantity: parseInt(m.quantity, 10),
                        estimatedUnitPrice: m.estimatedUnitPrice ? toPaise(m.estimatedUnitPrice) : undefined,
                        specifications: m.specifications || undefined,
                    })),
                    ...charges,
                };
                if (trimmedDescription) payload.description = trimmedDescription;
                await createIndent(activeWorkspace.id, payload);
                Alert.alert("Success", "Indent request created successfully.");
            }
            navigation.goBack();
        } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to submit indent request.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <DetailSkeleton paragraphs={4} />
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
            <View style={{ flex: 1, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' }}>
                
                {/* Header */}
                <View style={[styles.header, { paddingHorizontal: value(SPACING.lg, SPACING.xl, SPACING.xxl) }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: colors.text }]}>
                        {isEdit ? "Edit Indent" : "Create Indent"}
                    </Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView
                    contentContainerStyle={[styles.scrollContent, { paddingHorizontal: value(SPACING.lg, SPACING.xl, SPACING.xxl) }]}
                    showsVerticalScrollIndicator={false}
                >
                    {/* General Section — no Indent Name field: web has none either,
                        and the server always generates one from the project,
                        first material and date (IndentService.createIndent). */}
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Request Info</Text>
                    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.label, { color: colors.textDim }]}>Description</Text>
                        <TextInput
                            style={[styles.input, styles.textArea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Write any additional description..."
                            placeholderTextColor={colors.textDim}
                            multiline
                            numberOfLines={3}
                        />
                    </View>

                    {/* Logistics Section */}
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Logistics & Assignment</Text>
                    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>

                        {/* Is this related to a project? Only asked from the global
                            hub (this screen's only entry point), matching web's
                            asksProjectQuestion. "No" creates a workspace-level
                            indent with no project — it then shows up only in the
                            workspace-wide indent list, not under any project. */}
                        {!isEdit && (
                            <>
                                <Text style={[styles.label, { color: colors.textDim }]}>Is this related to a project? *</Text>
                                <View style={styles.pickerRow}>
                                    {([["Yes", true], ["No", false]] as const).map(([label, val]) => (
                                        <TouchableOpacity
                                            key={label}
                                            style={[
                                                styles.pickerPill,
                                                { borderColor: colors.border },
                                                isProjectRelated === val && { backgroundColor: colors.primary, borderColor: colors.primary },
                                            ]}
                                            onPress={() => {
                                                setIsProjectRelated(val);
                                                if (!val) {
                                                    setSelectedProject(null);
                                                    setSelectedTask(null);
                                                }
                                            }}
                                            accessibilityRole="radio"
                                            accessibilityState={{ selected: isProjectRelated === val }}
                                        >
                                            <Text style={{
                                                fontFamily: FONTS.bold,
                                                fontSize: 12,
                                                color: isProjectRelated === val ? "#fff" : colors.text,
                                            }}>
                                                {label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {!isProjectRelated && (
                                    <Text style={[styles.errorText, { color: colors.textDim, fontFamily: FONTS.regular }]}>
                                        Saved as a general indent. It appears in the workspace indent list only, not under any project.
                                    </Text>
                                )}
                            </>
                        )}

                        {/* Project Picker */}
                        {isProjectRelated && (
                            <>
                                <Text style={[styles.label, { color: colors.textDim, marginTop: SPACING.md }]}>Project *</Text>
                                <View style={styles.pickerRow}>
                                    {projects.map((proj) => (
                                        <TouchableOpacity
                                            key={proj.id}
                                            style={[
                                                styles.pickerPill,
                                                { borderColor: colors.border },
                                                selectedProject?.id === proj.id && { backgroundColor: colors.primary, borderColor: colors.primary }
                                            ]}
                                            onPress={() => {
                                                setSelectedProject(proj);
                                                setSelectedTask(null);
                                            }}
                                        >
                                            <Text style={{
                                                fontFamily: FONTS.bold,
                                                fontSize: 12,
                                                color: selectedProject?.id === proj.id ? "#fff" : colors.text
                                            }}>
                                                {proj.name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        )}

                        {/* Task Picker — optional, matching web's "Link to Subtask
                            (Optional)". Only offered when the project has
                            procurement-taggable subtasks without an indent yet. */}
                        {isProjectRelated && selectedProject && !loadingProjectTasks && projectTasks.length > 0 && (
                            <>
                                <Text style={[styles.label, { color: colors.textDim, marginTop: SPACING.md }]}>Link to Subtask (Optional)</Text>
                                <View style={styles.pickerRow}>
                                    <TouchableOpacity
                                        style={[
                                            styles.pickerPill,
                                            { borderColor: colors.border },
                                            !selectedTask && { backgroundColor: colors.primary, borderColor: colors.primary },
                                        ]}
                                        onPress={() => handleTaskSelect(null)}
                                    >
                                        <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: !selectedTask ? "#fff" : colors.text }}>
                                            None / Project-level
                                        </Text>
                                    </TouchableOpacity>
                                    {projectTasks.map((t) => (
                                        <TouchableOpacity
                                            key={t.id}
                                            style={[
                                                styles.pickerPill,
                                                { borderColor: colors.border },
                                                selectedTask?.id === t.id && { backgroundColor: colors.primary, borderColor: colors.primary },
                                            ]}
                                            onPress={() => handleTaskSelect(t)}
                                        >
                                            <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: selectedTask?.id === t.id ? "#fff" : colors.text }}>
                                                {t.name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        )}

                        {/* Approvers — required by the API (at least one). Web
                            selects workspace owners here; the value submitted is
                            the workspaceMember id. */}
                        <Text style={[styles.label, { color: colors.textDim, marginTop: SPACING.md }]}>Approvers *</Text>
                        <TouchableOpacity
                            style={[styles.input, { borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
                            onPress={() => setApproverPickerOpen(true)}
                            accessibilityRole="button"
                            accessibilityLabel={`Approvers: ${approverSummary}`}
                            accessibilityHint="Opens the approver list"
                        >
                            <Text
                                style={{
                                    flex: 1,
                                    fontSize: 16,
                                    fontFamily: FONTS.medium,
                                    color: approverIds.length ? colors.text : colors.textDim,
                                }}
                                numberOfLines={1}
                            >
                                {approverSummary}
                            </Text>
                            <Ionicons name="chevron-down" size={18} color={colors.textDim} />
                        </TouchableOpacity>

                        {/* Expected Delivery Date Picker */}
                        <Text style={[styles.label, { color: colors.textDim, marginTop: SPACING.md }]}>Expected Delivery *</Text>
                        <TouchableOpacity
                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                            onPress={() => setShowDatePicker(true)}
                        >
                            <Text style={{ color: colors.text }}>{format(expectedDelivery, "dd-MM-yyyy")}</Text>
                        </TouchableOpacity>

                        {showDatePicker && (
                            <DateTimePicker
                                value={expectedDelivery}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                textColor={colors.text}
                                themeVariant={isDark ? 'dark' : 'light'}
                                onChange={(event, date) => {
                                    setShowDatePicker(false);
                                    if (date) setExpectedDelivery(date);
                                }}
                            />
                        )}
                    </View>

                    {/* Materials requested Section */}
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Materials Requested</Text>
                        {!isEdit && (
                            <TouchableOpacity
                                style={[styles.addMatBtn, { borderColor: colors.primary }]}
                                onPress={() => setItemModalVisible(true)}
                            >
                                <Ionicons name="add" size={16} color={colors.primary} />
                                <Text style={[styles.addMatText, { color: colors.primary }]}>Add Material</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* UpdateIndentSchema (apps/api .../procurement-indents.ts) has no
                        lineItems field — items are managed per-item from the indent
                        detail screen once created, not through this form. Adding or
                        removing here in edit mode would look like it worked and then
                        silently do nothing on save. */}
                    {isEdit && materials.length > 0 && (
                        <Text style={[styles.materialsLockedNote, { color: colors.textDim }]}>
                            Materials are locked once an indent is created. Manage individual items from the indent details screen.
                        </Text>
                    )}

                    {materials.length === 0 ? (
                        <View style={[styles.emptyCard, { borderColor: colors.border }]}>
                            <Ionicons name="gift-outline" size={28} color={colors.textDim} />
                            <Text style={{ color: colors.textDim, fontSize: 13, fontFamily: FONTS.medium, marginTop: 4 }}>
                                No materials added yet. Tap Add Material above.
                            </Text>
                        </View>
                    ) : (
                        materials.map((mat, idx) => (
                            <View
                                key={idx}
                                style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.itemNameText, { color: colors.text }]}>
                                        {mat.materialName}
                                    </Text>
                                    <Text style={[styles.itemDetailsText, { color: colors.textDim }]}>
                                        Qty: {mat.quantity} {mat.unit} {mat.estimatedUnitPrice ? `• Est: ₹${mat.estimatedUnitPrice}/unit` : ""}
                                    </Text>
                                </View>

                                {!isEdit && (
                                    <TouchableOpacity onPress={() => handleRemoveMaterial(idx)}>
                                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))
                    )}

                    {/* Optional Charges — mirrors web: tax/excise/VAT apply as a
                        percentage of the material subtotal, transport/labour are
                        flat rupee amounts. Toggling a chip reveals its input and
                        clears the value when turned back off. */}
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Additional Charges (Optional)</Text>
                    <View style={styles.chargeChipRow}>
                        {([
                            ["Tax %", includeTax, setIncludeTax, setTaxPercent],
                            ["Excise Duty %", includeExciseDuty, setIncludeExciseDuty, setExciseDutyPercent],
                            ["VAT %", includeVat, setIncludeVat, setVatPercent],
                            ["Transport", includeTransport, setIncludeTransport, setTransportCharge],
                            ["Labour", includeLabour, setIncludeLabour, setLabourCharge],
                        ] as const).map(([label, active, setActive, setValue]) => (
                            <TouchableOpacity
                                key={label}
                                style={[
                                    styles.chargeChip,
                                    { borderColor: colors.border },
                                    active && { backgroundColor: colors.primary, borderColor: colors.primary },
                                ]}
                                onPress={() => {
                                    const next = !active;
                                    setActive(next);
                                    if (!next) setValue("");
                                }}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: active }}
                                accessibilityLabel={label}
                            >
                                <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: active ? "#fff" : colors.text }}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {includeTax && (
                        <>
                            <Text style={[styles.label, { color: colors.textDim, marginTop: SPACING.md }]}>Tax Percentage</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                value={taxPercent}
                                onChangeText={setTaxPercent}
                                keyboardType="numeric"
                                placeholder="e.g. 18"
                                placeholderTextColor={colors.textDim}
                            />
                        </>
                    )}
                    {includeExciseDuty && (
                        <>
                            <Text style={[styles.label, { color: colors.textDim, marginTop: SPACING.md }]}>Excise Duty Percentage</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                value={exciseDutyPercent}
                                onChangeText={setExciseDutyPercent}
                                keyboardType="numeric"
                                placeholder="e.g. 5"
                                placeholderTextColor={colors.textDim}
                            />
                        </>
                    )}
                    {includeVat && (
                        <>
                            <Text style={[styles.label, { color: colors.textDim, marginTop: SPACING.md }]}>VAT Percentage</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                value={vatPercent}
                                onChangeText={setVatPercent}
                                keyboardType="numeric"
                                placeholder="e.g. 12.5"
                                placeholderTextColor={colors.textDim}
                            />
                        </>
                    )}
                    {includeTransport && (
                        <>
                            <Text style={[styles.label, { color: colors.textDim, marginTop: SPACING.md }]}>Transport Charge (₹)</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                value={transportCharge}
                                onChangeText={setTransportCharge}
                                keyboardType="numeric"
                                placeholder="e.g. 1500"
                                placeholderTextColor={colors.textDim}
                            />
                        </>
                    )}
                    {includeLabour && (
                        <>
                            <Text style={[styles.label, { color: colors.textDim, marginTop: SPACING.md }]}>Labour Charge (₹)</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                value={labourCharge}
                                onChangeText={setLabourCharge}
                                keyboardType="numeric"
                                placeholder="e.g. 800"
                                placeholderTextColor={colors.textDim}
                            />
                        </>
                    )}

                    {/* Live estimated total — computed in rupees directly from the
                        local (pre-submit) material state, so no paise round-trip
                        is needed just to preview it. */}
                    {(() => {
                        const subtotal = materials.reduce(
                            (sum, m) => sum + (m.estimatedUnitPrice ? parseFloat(m.estimatedUnitPrice) * parseInt(m.quantity, 10) : 0),
                            0
                        );
                        const pctCharge = (pct: string) => (pct ? subtotal * (parseFloat(pct) / 100) : 0);
                        const flatCharge = (amt: string) => (amt ? parseFloat(amt) : 0);
                        const total =
                            subtotal +
                            (includeTax ? pctCharge(taxPercent) : 0) +
                            (includeExciseDuty ? pctCharge(exciseDutyPercent) : 0) +
                            (includeVat ? pctCharge(vatPercent) : 0) +
                            (includeTransport ? flatCharge(transportCharge) : 0) +
                            (includeLabour ? flatCharge(labourCharge) : 0);
                        if (subtotal === 0 && total === 0) return null;
                        return (
                            <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                                <Text style={{ fontFamily: FONTS.bold, fontSize: 13, color: colors.textDim }}>Estimated Total</Text>
                                <Text style={{ fontFamily: FONTS.bold, fontSize: 15, color: colors.text }}>
                                    ₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                </Text>
                            </View>
                        );
                    })()}

                    {/* Submit Button */}
                    <TouchableOpacity
                        style={[styles.submitButton, { backgroundColor: colors.primary }]}
                        onPress={handleSubmit}
                        disabled={submitting}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.submitButtonText}>
                                {isEdit ? "Update Request" : "Submit Request"}
                            </Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>

                {/* Add Material Modal */}
                <Modal visible={itemModalVisible} animationType="slide" transparent>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>Add Material Item</Text>
                                <TouchableOpacity onPress={() => setItemModalVisible(false)}>
                                    <Ionicons name="close" size={24} color={colors.text} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
                                <Text style={[styles.label, { color: colors.textDim }]}>Material Name *</Text>
                                <TextInput
                                    style={[styles.modalInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                    value={matName}
                                    onChangeText={handleMatNameChange}
                                    placeholder="e.g. UltraTech Cement"
                                    placeholderTextColor={colors.textDim}
                                />

                                {/* Auto-complete autocompleteList */}
                                {autocompleteList.length > 0 && (
                                    <View style={[styles.autocompleteContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                        {autocompleteList.map((item) => (
                                            <TouchableOpacity
                                                key={item.id}
                                                style={[styles.autocompleteItem, { borderBottomColor: colors.border }]}
                                                onPress={() => selectAutocompleteItem(item)}
                                            >
                                                <Text style={{ color: colors.text, fontSize: 13, fontFamily: FONTS.semibold }}>{item.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                <View style={styles.row}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.label, { color: colors.textDim }]}>Quantity *</Text>
                                        <TextInput
                                            style={[styles.modalInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                            value={matQty}
                                            onChangeText={handleMatQtyChange}
                                            keyboardType="numeric"
                                            placeholder="100"
                                            placeholderTextColor={colors.textDim}
                                        />
                                    </View>
                                    <View style={{ width: SPACING.md }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.label, { color: colors.textDim }]}>Unit *</Text>
                                        <TextInput
                                            style={[styles.modalInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                            value={matUnit}
                                            onChangeText={setMatUnit}
                                            placeholder="bags, kg, CFT..."
                                            placeholderTextColor={colors.textDim}
                                        />
                                    </View>
                                </View>

                                {/* Unit chips from the workspace's configured units of
                                    measure (falling back to the same defaults web uses
                                    when a workspace has none) — tapping one fills the
                                    Unit field above; it stays editable for anything
                                    not in the list, same as web's <select> + custom
                                    value. */}
                                {units.length > 0 && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                                        <View style={styles.pickerRow}>
                                            {units.map((u) => (
                                                <TouchableOpacity
                                                    key={u.abbreviation}
                                                    style={[
                                                        styles.unitChip,
                                                        { borderColor: colors.border },
                                                        matUnit === u.abbreviation && { backgroundColor: colors.primary, borderColor: colors.primary },
                                                    ]}
                                                    onPress={() => setMatUnit(u.abbreviation)}
                                                >
                                                    <Text style={{
                                                        fontFamily: FONTS.bold,
                                                        fontSize: 11,
                                                        color: matUnit === u.abbreviation ? "#fff" : colors.text,
                                                    }}>
                                                        {u.abbreviation}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </ScrollView>
                                )}

                                {/* Unit price and total price stay in sync (see
                                    handleMatUnitPriceChange/handleMatTotalPriceChange),
                                    matching web's line-item table. */}
                                <View style={styles.row}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.label, { color: colors.textDim }]}>Est. Unit Price (Optional)</Text>
                                        <TextInput
                                            style={[styles.modalInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                            value={matEstPrice}
                                            onChangeText={handleMatUnitPriceChange}
                                            keyboardType="numeric"
                                            placeholder="450"
                                            placeholderTextColor={colors.textDim}
                                        />
                                    </View>
                                    <View style={{ width: SPACING.md }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.label, { color: colors.textDim }]}>Total Price (Optional)</Text>
                                        <TextInput
                                            style={[styles.modalInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                            value={matTotalPrice}
                                            onChangeText={handleMatTotalPriceChange}
                                            keyboardType="numeric"
                                            placeholder="45000"
                                            placeholderTextColor={colors.textDim}
                                        />
                                    </View>
                                </View>

                                <Text style={[styles.label, { color: colors.textDim }]}>Specifications (Optional)</Text>
                                <TextInput
                                    style={[styles.modalInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                                    value={matSpec}
                                    onChangeText={setMatSpec}
                                    placeholder="53 Grade, OPC..."
                                    placeholderTextColor={colors.textDim}
                                />

                                <TouchableOpacity
                                    style={[styles.modalAddBtn, { backgroundColor: colors.primary }]}
                                    onPress={handleAddMaterial}
                                >
                                    <Text style={styles.modalAddBtnText}>Add Item</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            </View>

            <OptionPickerSheet
                visible={approverPickerOpen}
                onClose={() => setApproverPickerOpen(false)}
                title="Select Approvers"
                options={approverOptions}
                multiple
                selectedIds={approverIds}
                onToggle={(id) =>
                    setApproverIds((prev) =>
                        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    )
                }
                onClearAll={() => setApproverIds([])}
                emptyText="No workspace owners available"
                clearLabel="None"
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: SPACING.md },
    backBtn: { width: 40, height: 40, justifyContent: "center" },
    title: { fontSize: 18, fontFamily: FONTS.bold },
    
    scrollContent: { paddingBottom: 60 },
    sectionTitle: { fontSize: 15, fontFamily: FONTS.bold, marginTop: SPACING.lg, marginBottom: SPACING.sm },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: SPACING.lg, marginBottom: SPACING.sm },
    
    card: { padding: 16, borderRadius: BORDER_RADIUS.lg, borderWidth: 1 },
    label: { fontSize: 12, fontFamily: FONTS.bold, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 },
    errorText: { fontSize: 12, fontFamily: FONTS.semibold, marginTop: 6 },
    input: { height: 48, borderRadius: BORDER_RADIUS.md, borderWidth: 1, paddingHorizontal: SPACING.md, fontSize: 16 },
    textArea: { height: 80, paddingVertical: 10, textAlignVertical: "top" },
    materialsLockedNote: { fontSize: 12, fontFamily: FONTS.regular, fontStyle: "italic", marginBottom: SPACING.sm },
    chargeChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chargeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: BORDER_RADIUS.full, borderWidth: 1 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, paddingTop: SPACING.md, marginTop: SPACING.md },
    
    pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    pickerPill: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: BORDER_RADIUS.full, borderWidth: 1 },
    unitChip: { paddingHorizontal: SPACING.sm, paddingVertical: 5, borderRadius: BORDER_RADIUS.full, borderWidth: 1, marginRight: 6 },

    addMatBtn: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
    addMatText: { fontSize: 12, fontFamily: FONTS.bold, marginLeft: 2 },
    
    emptyCard: { borderStyle: "dashed", borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: 24, alignItems: "center" },
    itemCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: BORDER_RADIUS.md, borderWidth: 1, marginBottom: 8 },
    itemNameText: { fontSize: 15, fontFamily: FONTS.bold },
    itemDetailsText: { fontSize: 12, fontFamily: FONTS.medium, marginTop: 2 },
    
    submitButton: { marginTop: SPACING.xxl, height: 50, borderRadius: BORDER_RADIUS.lg, justifyContent: "center", alignItems: "center" },
    submitButtonText: { color: "#fff", fontSize: 16, fontFamily: FONTS.bold },
    
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, maxHeight: "90%" },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.lg },
    modalTitle: { fontSize: 18, fontFamily: FONTS.bold },
    form: { marginBottom: SPACING.xl },
    modalInput: { height: 44, borderRadius: BORDER_RADIUS.md, borderWidth: 1, paddingHorizontal: 12, fontSize: 15, marginBottom: 12 },
    
    autocompleteContainer: { borderRadius: BORDER_RADIUS.md, borderWidth: 1, overflow: "hidden", marginBottom: 12 },
    autocompleteItem: { padding: 12, borderBottomWidth: 1 },
    
    row: { flexDirection: "row" },
    modalAddBtn: { marginTop: SPACING.lg, height: 48, borderRadius: BORDER_RADIUS.md, justifyContent: "center", alignItems: "center" },
    modalAddBtnText: { color: "#fff", fontSize: 15, fontFamily: FONTS.bold },
});
