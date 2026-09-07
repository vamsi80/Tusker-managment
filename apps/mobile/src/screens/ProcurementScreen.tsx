import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useTheme } from "../context/ThemeContext";
import { ListSkeleton } from "../components/ScreenSkeleton";
import { haptics } from "../services/haptics";
import { useWorkspace } from "../context/WorkspaceContext";
import { SPACING, BORDER_RADIUS, FONTS } from "../constants/theme";
import { getIndentRequestsPage, getVendors, getIndentLineItemsHub } from "../services/api";
import { useResponsive } from "../hooks/useResponsive";
import StatusChip, { StatusKind } from "../components/StatusChip";
import Sheet from "../components/Sheet";
import PressableScale from "../components/PressableScale";

const { width } = Dimensions.get("window");

export default function ProcurementScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { activeWorkspace } = useWorkspace();
  const { MAX_CONTENT_WIDTH, value } = useResponsive();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"indents" | "materials" | "vendors">("indents");
  const [indents, setIndents] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null);
  const [hasMoreIndents, setHasMoreIndents] = useState(false);
  const [nextIndentCursor, setNextIndentCursor] = useState<string | null>(null);
  const [loadingMoreIndents, setLoadingMoreIndents] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    try {
      const [indentPage, vendorsData, lineItemsData] = await Promise.all([
        getIndentRequestsPage(activeWorkspace.id, undefined, debouncedSearch),
        getVendors(activeWorkspace.id),
        getIndentLineItemsHub(activeWorkspace.id),
      ]);
      setIndents(indentPage.indents);
      setHasMoreIndents(indentPage.hasMore);
      setNextIndentCursor(indentPage.nextCursor);
      setVendors(vendorsData);
      setLineItems(lineItemsData);
    } catch (error) {
      console.error("ProcurementScreen load error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeWorkspace?.id, debouncedSearch]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const loadMoreIndents = useCallback(async () => {
    if (
      activeTab !== "indents" ||
      !activeWorkspace?.id ||
      !hasMoreIndents ||
      !nextIndentCursor ||
      loadingMoreIndents
    ) {
      return;
    }

    setLoadingMoreIndents(true);
    try {
      const page = await getIndentRequestsPage(
        activeWorkspace.id,
        nextIndentCursor,
        debouncedSearch,
      );
      setIndents((current) => {
        const ids = new Set(current.map((indent) => indent.id));
        return [
          ...current,
          ...page.indents.filter((indent) => !ids.has(indent.id)),
        ];
      });
      setHasMoreIndents(page.hasMore);
      setNextIndentCursor(page.nextCursor);
    } finally {
      setLoadingMoreIndents(false);
    }
  }, [
    activeTab,
    activeWorkspace?.id,
    hasMoreIndents,
    loadingMoreIndents,
    nextIndentCursor,
    debouncedSearch,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    haptics.light();
    setRefreshing(true);
    loadData();
  };

  const filteredIndents = useMemo(() => {
    if (!searchQuery) return indents;
    return indents.filter(
      (ind) =>
        ind.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ind.indentId &&
          ind.indentId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (ind.project?.name &&
          ind.project.name.toLowerCase().includes(searchQuery.toLowerCase())),
    );
  }, [indents, searchQuery]);

  // Groups line items by material name+unit (case-insensitive), matching
  // web's Procurement > Materials hub — this is what actually links a
  // material to the indent(s) it's raised through.
  const groupedMaterials = useMemo(() => {
    const map: Record<string, {
      groupKey: string;
      materialName: string;
      unit: string;
      combinedQuantity: number;
      items: any[];
      projectsCount: number;
    }> = {};
    for (const item of lineItems) {
      const key = `${(item.materialName || "").toLowerCase().trim()}_${(item.unit || "").toLowerCase().trim()}`;
      if (!map[key]) {
        map[key] = { groupKey: key, materialName: item.materialName, unit: item.unit, combinedQuantity: 0, items: [], projectsCount: 0 };
      }
      map[key].combinedQuantity += item.quantity || 0;
      map[key].items.push(item);
    }
    return Object.values(map).map((group) => ({
      ...group,
      projectsCount: new Set(group.items.map((i) => i.indent?.project?.id).filter(Boolean)).size,
    }));
  }, [lineItems]);

  const filteredMaterialGroups = useMemo(() => {
    if (!searchQuery) return groupedMaterials;
    return groupedMaterials.filter((g) => g.materialName.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [groupedMaterials, searchQuery]);

  const selectedGroup = selectedGroupKey ? groupedMaterials.find((g) => g.groupKey === selectedGroupKey) || null : null;

  const filteredVendors = useMemo(() => {
    if (!searchQuery) return vendors;
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.companyName &&
          v.companyName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (v.email && v.email.toLowerCase().includes(searchQuery.toLowerCase())),
    );
  }, [vendors, searchQuery]);

  const getIndentStatusStyles = (status: string) => {
    switch (status) {
      case "APPROVED":
        return { bg: "#dcfce7", text: "#166534" }; // soft green
      case "CANCELLED":
        return { bg: "#fee2e2", text: "#991b1b" }; // soft red
      case "SUBMITTED":
        return { bg: "#fef3c7", text: "#92400e" }; // soft amber
      case "ASSIGNED":
        return { bg: "#dbeafe", text: "#1e40af" }; // soft blue
      default:
        return { bg: "#f3f4f6", text: "#374151" }; // soft gray (DRAFT)
    }
  };

  const getIndentStatusKind = (status: string): StatusKind => {
    switch (status) {
      case "APPROVED":
        return "success";
      case "CANCELLED":
        return "error";
      case "SUBMITTED":
        return "warning";
      case "ASSIGNED":
        return "info";
      default:
        return "neutral"; // DRAFT
    }
  };

  if (loading) {
    return (
      <ListSkeleton rows={7} />
    );
  }

  return (
    <>
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <View
        style={{
          flex: 1,
          maxWidth: MAX_CONTENT_WIDTH,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { paddingHorizontal: value(SPACING.lg, SPACING.xl, SPACING.xxl) },
          ]}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: SPACING.sm }}>
            <Text style={[styles.title, { color: colors.text }]}>
              Procurement
            </Text>
            {activeWorkspace && (
              <Text
                style={{
                  fontSize: 10,
                  color: colors.textDim,
                  fontFamily: FONTS.bold,
                  letterSpacing: 0.5,
                }}
              >
                {activeWorkspace.name.toUpperCase()}
              </Text>
            )}
          </View>

          {activeTab === "indents" && (
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate("CreateIndent")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Create new indent"
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Segment Tab Switcher */}
        <View
          style={[
            styles.tabContainer,
            { paddingHorizontal: value(SPACING.lg, SPACING.xl, SPACING.xxl) },
          ]}
        >
          <View
            style={[
              styles.pillSwitcher,
              { backgroundColor: isDark ? "#1e293b" : "#f1f5f9" },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.pillOption,
                activeTab === "indents" && { backgroundColor: colors.surface },
              ]}
              onPress={() => {
                setActiveTab("indents");
                setSearchQuery("");
              }}
            >
              <Text
                style={[
                  styles.pillText,
                  {
                    color:
                      activeTab === "indents" ? colors.primary : colors.textDim,
                  },
                ]}
              >
                Indents ({indents.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.pillOption,
                activeTab === "materials" && { backgroundColor: colors.surface },
              ]}
              onPress={() => {
                setActiveTab("materials");
                setSearchQuery("");
              }}
            >
              <Text
                style={[
                  styles.pillText,
                  {
                    color:
                      activeTab === "materials" ? colors.primary : colors.textDim,
                  },
                ]}
              >
                Materials ({groupedMaterials.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.pillOption,
                activeTab === "vendors" && { backgroundColor: colors.surface },
              ]}
              onPress={() => {
                setActiveTab("vendors");
                setSearchQuery("");
              }}
            >
              <Text
                style={[
                  styles.pillText,
                  {
                    color:
                      activeTab === "vendors" ? colors.primary : colors.textDim,
                  },
                ]}
              >
                Vendors ({vendors.length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View
          style={[
            styles.searchContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              marginHorizontal: value(SPACING.lg, SPACING.xl, SPACING.xxl),
            },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textDim} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={
              activeTab === "indents"
                ? "Search by name, key, project..."
                : activeTab === "materials"
                ? "Search materials..."
                : "Search by vendor, company, email..."
            }
            placeholderTextColor={colors.textDim}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={colors.textDim} />
            </TouchableOpacity>
          )}
        </View>

        {/* Main Scroll Content */}
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: value(SPACING.lg, SPACING.xl, SPACING.xxl) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={200}
          onScroll={({ nativeEvent }) => {
            const remaining =
              nativeEvent.contentSize.height -
              nativeEvent.layoutMeasurement.height -
              nativeEvent.contentOffset.y;
            if (remaining < 240) loadMoreIndents();
          }}
        >
          {activeTab === "indents" ? (
            filteredIndents.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="cart-outline"
                  size={54}
                  color={colors.textDim}
                />
                <Text style={[styles.emptyText, { color: colors.textDim }]}>
                  No indents found
                </Text>
              </View>
            ) : (
              filteredIndents.map((item) => {
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() =>
                      navigation.navigate("IndentDetail", { indentId: item.id })
                    }
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Indent ${item.indentId || "IND-RAW"}, ${item.name}, status ${item.status}`}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.badgeRow}>
                        <Text
                          style={[
                            styles.indentIdText,
                            { color: colors.primary },
                          ]}
                        >
                          {item.indentId || "IND-RAW"}
                        </Text>
                        {item.project && (
                          <View
                            style={[
                              styles.projectBadge,
                              {
                                borderColor:
                                  item.project.color || colors.primary,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontFamily: FONTS.semibold,
                                color: item.project.color || colors.primary,
                              }}
                            >
                              {item.project.name.toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>

                      <StatusChip
                        label={item.status}
                        kind={getIndentStatusKind(item.status)}
                        size="sm"
                      />
                    </View>

                    <Text
                      style={[styles.indentName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>

                    {item.description ? (
                      <Text
                        style={[styles.indentDesc, { color: colors.textDim }]}
                        numberOfLines={2}
                      >
                        {item.description}
                      </Text>
                    ) : null}

                    <View
                      style={[
                        styles.cardDivider,
                        { backgroundColor: colors.border },
                      ]}
                    />

                    <View style={styles.cardFooter}>
                      <View style={styles.footerRow}>
                        <Ionicons
                          name="gift-outline"
                          size={14}
                          color={colors.textDim}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={[styles.footerText, { color: colors.textDim }]}
                        >
                          {item._count?.lineItems ?? 0} items
                        </Text>
                      </View>

                      {item.expectedDelivery && (
                        <View style={styles.footerRow}>
                          <Ionicons
                            name="calendar-outline"
                            size={14}
                            color={colors.textDim}
                            style={{ marginRight: 4 }}
                          />
                          <Text
                            style={[
                              styles.footerText,
                              { color: colors.textDim },
                            ]}
                          >
                            Deliv:{" "}
                            {format(
                              new Date(item.expectedDelivery),
                              "MMM d, yyyy",
                            )}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )
          ) : activeTab === "materials" ? (
            filteredMaterialGroups.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={54} color={colors.textDim} />
                <Text style={[styles.emptyText, { color: colors.textDim }]}>
                  No materials raised in any indent yet
                </Text>
              </View>
            ) : (
              filteredMaterialGroups.map((group) => (
                <TouchableOpacity
                  key={group.groupKey}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setSelectedGroupKey(group.groupKey)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.materialName}, ${group.combinedQuantity} ${group.unit} required across ${group.projectsCount} projects`}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.indentName, { color: colors.text, marginBottom: 0 }]} numberOfLines={1}>
                      {group.materialName}
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: FONTS.extrabold, color: colors.primary }}>
                      {group.combinedQuantity} {group.unit}
                    </Text>
                  </View>
                  <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.cardFooter}>
                    <View style={styles.footerRow}>
                      <Ionicons name="folder-outline" size={14} color={colors.textDim} style={{ marginRight: 4 }} />
                      <Text style={[styles.footerText, { color: colors.textDim }]}>
                        {group.projectsCount} {group.projectsCount === 1 ? "project" : "projects"}
                      </Text>
                    </View>
                    <View style={styles.footerRow}>
                      <Ionicons name="document-text-outline" size={14} color={colors.textDim} style={{ marginRight: 4 }} />
                      <Text style={[styles.footerText, { color: colors.textDim }]}>
                        {group.items.length} {group.items.length === 1 ? "indent" : "indents"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )
          ) : filteredVendors.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="people-outline"
                size={54}
                color={colors.textDim}
              />
              <Text style={[styles.emptyText, { color: colors.textDim }]}>
                No vendors registered
              </Text>
            </View>
          ) : (
            filteredVendors.map((vendor) => {
              const isExpanded = expandedVendorId === vendor.id;
              return (
                <TouchableOpacity
                  key={vendor.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                    isExpanded && { borderColor: colors.primary },
                  ]}
                  onPress={() =>
                    setExpandedVendorId(isExpanded ? null : vendor.id)
                  }
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${vendor.name}, ${isExpanded ? "collapse" : "expand"} capabilities`}
                >
                  <View style={styles.cardHeader}>
                    <Text
                      style={[styles.vendorName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {vendor.name}
                    </Text>

                    <StatusChip
                      label={
                        vendor.status ||
                        (vendor.isActive ? "ACTIVE" : "INACTIVE")
                      }
                      kind={vendor.isActive ? "success" : "neutral"}
                      size="sm"
                    />
                  </View>

                  {vendor.companyName ? (
                    <Text
                      style={[styles.vendorCompany, { color: colors.primary }]}
                    >
                      {vendor.companyName.toUpperCase()}
                    </Text>
                  ) : null}

                  {vendor.contactPerson ? (
                    <View style={[styles.vendorInfoRow, { marginTop: 8 }]}>
                      <Ionicons
                        name="person-outline"
                        size={14}
                        color={colors.textDim}
                      />
                      <Text
                        style={[
                          styles.vendorInfoText,
                          { color: colors.textDim },
                        ]}
                      >
                        Contact: {vendor.contactPerson}
                      </Text>
                    </View>
                  ) : null}

                  {vendor.email ? (
                    <View style={styles.vendorInfoRow}>
                      <Ionicons
                        name="mail-outline"
                        size={14}
                        color={colors.textDim}
                      />
                      <Text
                        style={[
                          styles.vendorInfoText,
                          { color: colors.textDim },
                        ]}
                      >
                        {vendor.email}
                      </Text>
                    </View>
                  ) : null}

                  {vendor.phoneNumber ? (
                    <View style={styles.vendorInfoRow}>
                      <Ionicons
                        name="call-outline"
                        size={14}
                        color={colors.textDim}
                      />
                      <Text
                        style={[
                          styles.vendorInfoText,
                          { color: colors.textDim },
                        ]}
                      >
                        {vendor.phoneNumber}
                      </Text>
                    </View>
                  ) : null}

                  {vendor.gstNumber ? (
                    <View style={styles.vendorInfoRow}>
                      <Ionicons
                        name="receipt-outline"
                        size={14}
                        color={colors.textDim}
                      />
                      <Text
                        style={[
                          styles.vendorInfoText,
                          { color: colors.textDim },
                        ]}
                      >
                        GST: {vendor.gstNumber}
                      </Text>
                    </View>
                  ) : null}

                  {/* Capabilities Accordion Section */}
                  {isExpanded && (
                    <View style={styles.capabilitiesContainer}>
                      <View
                        style={[
                          styles.cardDivider,
                          { backgroundColor: colors.border },
                        ]}
                      />
                      <View style={styles.capabilitiesHeader}>
                        <Ionicons
                          name="sparkles-outline"
                          size={14}
                          color={colors.primary}
                        />
                        <Text
                          style={[
                            styles.capabilitiesTitle,
                            { color: colors.text },
                          ]}
                        >
                          SUPPLIER CAPABILITIES
                        </Text>
                      </View>

                      {!vendor.vendor_material_capability ||
                      vendor.vendor_material_capability.length === 0 ? (
                        <Text
                          style={[
                            styles.noCapabilitiesText,
                            { color: colors.textDim },
                          ]}
                        >
                          No registered material or labour capabilities.
                        </Text>
                      ) : (
                        <View style={styles.capabilitiesPillContainer}>
                          {vendor.vendor_material_capability.map((cap: any) => (
                            <View
                              key={cap.id}
                              style={[
                                styles.capabilityPill,
                                {
                                  backgroundColor:
                                    cap.serviceType === "LABOUR"
                                      ? "#fef3c7"
                                      : "#dbeafe",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.capabilityPillText,
                                  {
                                    color:
                                      cap.serviceType === "LABOUR"
                                        ? "#92400e"
                                        : "#1e40af",
                                  },
                                ]}
                              >
                                {cap.materialName}{" "}
                                {cap.unit ? `(${cap.unit})` : ""} •{" "}
                                {cap.serviceType}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
          {activeTab === "indents" && loadingMoreIndents && (
            <ActivityIndicator
              color={colors.primary}
              style={{ paddingVertical: 16 }}
            />
          )}
        </ScrollView>
      </View>
    </SafeAreaView>

    {/* Consolidated material overview — mirrors web's Procurement > Materials
        hub Sheet: every indent that needs this material, with a link into
        each one. This IS the material<->indent link the mobile app lacked. */}
    <Sheet
      visible={!!selectedGroup}
      onClose={() => setSelectedGroupKey(null)}
      accessibilityLabel={selectedGroup?.materialName}
    >
      {selectedGroup && (
        <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg }}>
          <Text style={{ fontSize: 10, fontFamily: FONTS.extrabold, color: colors.primary, letterSpacing: 0.5 }}>
            CONSOLIDATED MATERIAL OVERVIEW
          </Text>
          <Text style={[styles.indentName, { color: colors.text, marginTop: 4 }]}>
            {selectedGroup.materialName}
          </Text>
          <Text style={{ fontSize: 12, fontFamily: FONTS.medium, color: colors.textDim, marginBottom: SPACING.md }}>
            Required in {selectedGroup.items.length} {selectedGroup.items.length === 1 ? "indent" : "indents"} across{" "}
            {selectedGroup.projectsCount} {selectedGroup.projectsCount === 1 ? "project" : "projects"} · Combined total:{" "}
            {selectedGroup.combinedQuantity} {selectedGroup.unit}
          </Text>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {selectedGroup.items.map((item) => (
              <PressableScale
                key={item.id}
                haptic="selection"
                style={[styles.materialItemRow, { borderColor: colors.border }]}
                onPress={() => {
                  setSelectedGroupKey(null);
                  navigation.navigate("IndentDetail", { indentId: item.indent.id });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open indent ${item.indent.indentId || "draft"} for ${item.indent.project?.name || "General"}`}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.footerText, { color: colors.text, fontFamily: FONTS.bold }]} numberOfLines={1}>
                    {item.indent.project?.name || "General"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <Text style={{ fontSize: 11, fontFamily: FONTS.bold, color: colors.primary }}>
                      {item.indent.indentId || "Draft"}
                    </Text>
                    <StatusChip label={item.indent.status} kind={getIndentStatusKind(item.indent.status)} size="sm" />
                  </View>
                  {item.indent.expectedDelivery && (
                    <Text style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>
                      Due {format(new Date(item.indent.expectedDelivery), "MMM d, yyyy")}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 13, fontFamily: FONTS.extrabold, color: colors.text }}>
                  {item.quantity} {item.unit}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textDim} style={{ marginLeft: 8 }} />
              </PressableScale>
            ))}
          </ScrollView>
        </View>
      )}
    </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  title: { fontSize: 24, fontFamily: FONTS.extrabold, letterSpacing: -0.5 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },

  tabContainer: { paddingVertical: SPACING.sm },
  pillSwitcher: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 24,
    height: 48,
  },
  pillOption: {
    flex: 1,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  pillText: { fontSize: 13, fontFamily: FONTS.bold },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginVertical: SPACING.md,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },

  scrollContent: { paddingBottom: 40 },
  emptyState: { alignItems: "center", justifyContent: "center", marginTop: 80 },
  emptyText: { marginTop: 12, fontSize: 16, fontFamily: FONTS.semibold },

  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  indentIdText: { fontSize: 13, fontFamily: FONTS.extrabold },
  projectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontFamily: FONTS.extrabold },
  indentName: { fontSize: 16, fontFamily: FONTS.bold, marginBottom: 4 },
  indentDesc: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  cardDivider: { height: 1, marginVertical: 12, opacity: 0.3 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerRow: { flexDirection: "row", alignItems: "center" },
  footerText: { fontSize: 12, fontFamily: FONTS.medium },

  vendorName: { fontSize: 16, fontFamily: FONTS.bold, flex: 1, marginRight: 8 },
  vendorCompany: {
    fontSize: 10,
    fontFamily: FONTS.extrabold,
    letterSpacing: 0.5,
  },
  vendorInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  vendorInfoText: { fontSize: 12, fontFamily: FONTS.medium },

  capabilitiesContainer: { marginTop: 4 },
  capabilitiesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  capabilitiesTitle: {
    fontSize: 10,
    fontFamily: FONTS.extrabold,
    letterSpacing: 0.5,
  },
  noCapabilitiesText: { fontSize: 11, fontStyle: "italic", marginLeft: 4 },
  capabilitiesPillContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  capabilityPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  capabilityPillText: { fontSize: 11, fontFamily: FONTS.bold },

  materialItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.xs,
  },
});
