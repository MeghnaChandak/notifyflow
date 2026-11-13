import React, { useState, useEffect, useCallback } from "react";
import { Tabs, Button, Spin, Tag, Typography, message, Select, Popover } from "antd";
import {
    LinkOutlined,
    SearchOutlined,
    PlusOutlined,
    FolderOpenOutlined,
    UserOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    SmileOutlined,
    QuestionCircleOutlined,
} from "@ant-design/icons";
import axios from "axios";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import todoApi from "./todoApi";
import QuickAddTaskModal from "./QuickAddTaskModal";
import TaskRow, { openForInfo } from "./TaskRow";
import { formatLinkDisplay, openExternalLink, safeExternalUrl } from "./moduleRoutes";
import { useFunctionDebounce } from "../../components/useFunctionDebounce";
import SingleEmployeeSelector from "../../components/SingleEmployeeSelector";
import "./MyTasksLanding.css";

const { Option } = Select;
const { Text, Title } = Typography;

// One entry per bucket the backend returns — drives both the summary tiles and
// the section headers so colour/wording only lives in one place.
const BUCKETS = [
    { key: "overdue", label: "Overdue", hint: "Past the due date", color: "#cf1322", bg: "#fff1f0" },
    { key: "due_this_week", label: "Due this week", hint: "Next 7 days", color: "#d48806", bg: "#fffbe6" },
    { key: "later", label: "Later", hint: "Due after this week", color: "#1677ff", bg: "#e6f4ff" },
    { key: "no_due_date", label: "No due date", hint: "Nothing scheduled", color: "#595959", bg: "#f5f5f5" },
    { key: "completed_today", label: "Done today", hint: "Nice work", color: "#389e0d", bg: "#f6ffed" },
];

// Groups items by parent todo so actions sit under the todo they belong to. Todos
// that are their own leaf (no actions under them) share one header-less group.
function groupByParent(items) {
    const order = [];
    const map = new Map();
    items.forEach((item) => {
        const key = item.parent_todo_id || "standalone";
        if (!map.has(key)) {
            map.set(key, {
                parentId: item.parent_todo_id || null,
                parentTitle: item.parent_todo_id ? item.parent_title : null,
                parentAssignedToName: item.parent_todo_id ? item.parent_assigned_to_name : null,
                items: [],
            });
            order.push(key);
        }
        map.get(key).items.push(item);
    });
    return order.map((key) => map.get(key));
}

// Reference chips — open the reference's web address in a new tab when it has one.
function LinkTags({ links }) {
    if (!links || links.length === 0) return null;
    return (
        <>
            {links.map((l) => {
                const url = safeExternalUrl(l.url);
                return (
                    <Tag
                        key={`${l.module}${l.ref}`}
                        icon={<LinkOutlined />}
                        color="geekblue"
                        style={{ cursor: url ? "pointer" : "default", marginRight: 0 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (url) openExternalLink(url);
                        }}
                    >
                        {formatLinkDisplay(l.module, l.ref)}
                    </Tag>
                );
            })}
        </>
    );
}

// Card per parent todo, its actions listed inside — reads as "this todo, and what's
// on my plate under it".
function GroupedTaskList({ items, onComplete, completed, showMeta }) {
    const navigate = useNavigate();
    return groupByParent(items).map((group, idx) => (
        <div
            key={idx}
            style={{
                border: "1px solid #ececec",
                borderRadius: 10,
                marginBottom: 12,
                overflow: "hidden",
                background: "#fff",
            }}
        >
            {group.parentTitle && (
                <div
                    style={{
                        background: "#f7f8fa",
                        padding: "8px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12.5,
                    }}
                >
                    <FolderOpenOutlined style={{ color: "#8c8c8c" }} />
                    <span style={{ color: "#8c8c8c" }}>Todo</span>
                    <span
                        style={{ fontWeight: 700, color: "#262626", cursor: "pointer" }}
                        onClick={() => navigate(`/todo/edit/${group.parentId}`)}
                    >
                        {group.parentTitle}
                    </span>
                    {group.parentAssignedToName && (
                        <span style={{ color: "#8c8c8c" }}>
                            <UserOutlined style={{ marginRight: 4 }} />
                            Assigned to: {group.parentAssignedToName}
                        </span>
                    )}
                    <span style={{ marginLeft: "auto", color: "#8c8c8c" }}>
                        {group.items.length} action{group.items.length > 1 ? "s" : ""}
                    </span>
                </div>
            )}
            {group.items.map((t, i) => (
                <div key={t.todo_id} style={i === 0 ? { marginTop: -1 } : undefined}>
                    <TaskRow
                        todo={t}
                        onComplete={onComplete}
                        completed={completed}
                        showMeta={showMeta}
                        extra={<LinkTags links={t.links} />}
                    />
                </div>
            ))}
        </div>
    ));
}

function SummaryTile({ bucket, count, active, onClick }) {
    return (
        <div
            onClick={onClick}
            role="button"
            style={{
                flex: "1 1 140px",
                minWidth: 130,
                cursor: "pointer",
                background: bucket.bg,
                border: `1.5px solid ${active ? bucket.color : "transparent"}`,
                borderRadius: 10,
                padding: "10px 14px",
                transition: "border-color .15s, transform .15s",
            }}
        >
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, color: bucket.color }}>{count}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#262626" }}>{bucket.label}</div>
            <div style={{ fontSize: 11.5, color: "#8c8c8c" }}>{bucket.hint}</div>
        </div>
    );
}

function SectionHeader({ bucket, count }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "20px 0 8px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: bucket.color }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#262626" }}>{bucket.label}</span>
            <span
                style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: bucket.color,
                    background: bucket.bg,
                    borderRadius: 10,
                    padding: "0 8px",
                }}
            >
                {count}
            </span>
        </div>
    );
}

// "Assigned by me" — what you handed out and where it stands.
function AssignedByMeList({ rows, navigate }) {
    const statusTag = (done) =>
        done ? (
            <Tag icon={<CheckCircleFilled />} color="success" style={{ marginRight: 0 }}>
                Done
            </Tag>
        ) : (
            <Tag icon={<ClockCircleOutlined />} color="warning" style={{ marginRight: 0 }}>
                Pending
            </Tag>
        );

    return rows.map((row) => (
        <div
            key={row.todo_id}
            style={{ border: "1px solid #ececec", borderRadius: 10, marginBottom: 12, background: "#fff", overflow: "hidden" }}
        >
            <div style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                        <span
                            style={{ fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
                            onClick={() => navigate(`/todo/edit/${row.todo_id}`)}
                        >
                            {row.title}
                        </span>
                        {row.parent_title && (
                            <div style={{ fontSize: 11.5, color: "#8c8c8c", marginTop: 2 }}>
                                Action under: {row.parent_title}
                            </div>
                        )}
                        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                            {statusTag(row.is_complete)}
                            <span style={{ fontSize: 12.5, color: "#595959" }}>
                                <UserOutlined style={{ marginRight: 4, color: "#8c8c8c" }} />
                                {row.assigned_to_name || "Unassigned"}
                            </span>
                            <LinkTags links={row.links} />
                        </div>
                    </div>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {row.completed_at
                                ? `Completed ${moment(row.completed_at).format("MMM D, HH:mm")}`
                                : row.target_date
                                ? `Due ${moment(row.target_date).format("MMM D")}`
                                : "No due date"}
                        </Text>
                        {openForInfo(row.created_at) && (
                            <div style={{ fontSize: 11.5, color: openForInfo(row.created_at).color }} title={openForInfo(row.created_at).title}>
                                {openForInfo(row.created_at).text}
                            </div>
                        )}
                    </div>
                </div>
                {row.remark && (
                    <div
                        style={{
                            marginTop: 8,
                            padding: "6px 10px",
                            borderLeft: "3px solid #d9d9d9",
                            background: "#fafafa",
                            fontSize: 12.5,
                            color: "#595959",
                        }}
                    >
                        {row.remark}
                    </div>
                )}
            </div>
            {(row.subtasks || []).length > 0 && (
                <div style={{ borderTop: "1px solid #f0f0f0", background: "#fafbfc", padding: "6px 14px 8px 28px" }}>
                    {row.subtasks.map((s) => (
                        <div
                            key={s.todo_id}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 }}
                        >
                            {s.is_complete ? (
                                <CheckCircleFilled style={{ color: "#52c41a" }} />
                            ) : (
                                <ClockCircleOutlined style={{ color: "#faad14" }} />
                            )}
                            <span style={{ color: "#595959" }}>{s.assigned_to_name || "Unassigned"}</span>
                            <span style={{ color: "#bfbfbf" }}>&mdash;</span>
                            <span
                                style={{
                                    cursor: "pointer",
                                    textDecoration: s.is_complete ? "line-through" : "none",
                                    color: s.is_complete ? "#8c8c8c" : "#262626",
                                }}
                                onClick={() => navigate(`/todo/edit/${s.todo_id}`)}
                            >
                                {s.title}
                            </span>
                            <LinkTags links={s.links} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    ));
}

// Compact, on-demand legend — the Dashboard/List View/Kanban switcher above this
// page already covers "browse all todos", so that card was dropped as a duplicate.
// This stays a tiny "?" trigger instead of a standing card so it costs no layout
// space until someone actually wants it.
const DUE_LEGEND = [
    ["#cf1322", "Overdue"],
    ["#fa8c16", "Due today"],
    ["#faad14", "Due tomorrow"],
    ["#1677ff", "Due this week"],
    ["#bfbfbf", "Due later / no date"],
];
const OPEN_FOR_LEGEND = [
    ["#8c8c8c", "Under 2 weeks"],
    ["#d48806", "2–4 weeks, getting stale"],
    ["#cf1322", "Over a month"],
];

function LegendDot({ color, text }) {
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#595959" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
            {text}
        </span>
    );
}

function LegendPopover() {
    const content = (
        <div style={{ maxWidth: 260 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#8c8c8c", marginBottom: 4 }}>DUE DATE</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginBottom: 10 }}>
                {DUE_LEGEND.map(([color, text]) => (
                    <LegendDot key={text} color={color} text={text} />
                ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#8c8c8c", marginBottom: 4 }}>OPEN FOR</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
                {OPEN_FOR_LEGEND.map(([color, text]) => (
                    <LegendDot key={text} color={color} text={text} />
                ))}
            </div>
        </div>
    );
    return (
        <Popover content={content} title="What the colours mean" trigger="click" placement="bottomRight">
            <Button type="text" size="small" icon={<QuestionCircleOutlined />} style={{ color: "#8c8c8c" }}>
                Colours
            </Button>
        </Popover>
    );
}

export default function MyTasksLanding({ permissions = {} }) {
    const navigate = useNavigate();
    const canSeeAll = !!permissions?.all_todos;
    const [activeTab, setActiveTab] = useState("assigned_to_me");
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({
        overdue: [],
        due_this_week: [],
        later: [],
        no_due_date: [],
        completed_today: [],
        audit: [],
    });
    const [counts, setCounts] = useState({});
    const [viewAsUserId, setViewAsUserId] = useState(null);
    const [quickAddOpen, setQuickAddOpen] = useState(false);

    // Filters: focus on one bucket (click a tile) and/or narrow to a single todo.
    const [sectionFilter, setSectionFilter] = useState("all");
    const [todoQuery, setTodoQuery] = useState("");
    const [todoOptions, setTodoOptions] = useState([]);
    const [todoOptionsLoading, setTodoOptionsLoading] = useState(false);
    const [todoFilter, setTodoFilter] = useState(null); // {todo_id, title} | null

    useFunctionDebounce(
        async (cancelToken) => {
            if (!todoQuery) {
                setTodoOptions([]);
                return;
            }
            setTodoOptionsLoading(true);
            try {
                const res = await axios.get("/search_todo_tasks", { params: { search_text: todoQuery }, cancelToken });
                setTodoOptions(res.data?.data || []);
            } catch (err) {
                setTodoOptions([]);
            } finally {
                setTodoOptionsLoading(false);
            }
        },
        350,
        [todoQuery]
    );

    const load = useCallback(() => {
        setLoading(true);
        todoApi
            .getMyTasks(activeTab, canSeeAll ? viewAsUserId : null)
            .then((res) => setData(res.data))
            .finally(() => setLoading(false));
    }, [activeTab, canSeeAll, viewAsUserId]);

    useEffect(() => {
        load();
    }, [load]);

    const loadCounts = useCallback(() => {
        todoApi.getMyTasksCounts().then(setCounts);
    }, []);

    useEffect(() => {
        loadCounts();
    }, [loadCounts]);

    const matchesTodoFilter = (item) =>
        !todoFilter || item.todo_id === todoFilter.todo_id || item.parent_todo_id === todoFilter.todo_id;

    const handleComplete = async (todo, remark) => {
        try {
            await todoApi.changeStatus(todo.todo_id, "Closed");
            await todoApi.addComment(todo.todo_id, remark);
            message.success("Action marked complete");
            load();
            loadCounts();
        } catch (err) {
            message.error(err?.response?.data?.detail || "Failed to update action");
        }
    };

    const buckets = {};
    BUCKETS.forEach((b) => {
        buckets[b.key] = (data[b.key] || []).filter(matchesTodoFilter);
    });
    const openCount = ["overdue", "due_this_week", "later", "no_due_date"].reduce(
        (sum, key) => sum + buckets[key].length,
        0
    );
    const visibleBuckets = BUCKETS.filter((b) => sectionFilter === "all" || sectionFilter === b.key);
    const nothingToShow = visibleBuckets.every((b) => buckets[b.key].length === 0);
    const auditRows = data.audit.filter((row) => !todoFilter || row.todo_id === todoFilter.todo_id);

    const headline =
        activeTab !== "assigned_by_me"
            ? buckets.overdue.length > 0
                ? `${buckets.overdue.length} overdue — start there.`
                : openCount > 0
                ? `${openCount} open action${openCount > 1 ? "s" : ""} on your plate.`
                : "You're all caught up."
            : `${auditRows.length} todo${auditRows.length === 1 ? "" : "s"} you've handed out.`;

    return (
        <div style={{ padding: "24px clamp(16px, 3vw, 40px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                        {moment().format("dddd, MMMM D")}
                    </Text>
                    <Title level={3} style={{ margin: "2px 0 0" }}>
                        My Actions
                    </Title>
                    <Text style={{ color: "#595959" }}>{headline}</Text>
                </div>
                {permissions?.add && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setQuickAddOpen(true)}>
                        New action
                    </Button>
                )}
            </div>

            <Tabs
                style={{ marginTop: 8 }}
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    { key: "assigned_to_me", label: `Assigned to me${counts.assigned_to_me != null ? ` (${counts.assigned_to_me})` : ""}` },
                    { key: "assigned_by_me", label: `Assigned by me${counts.assigned_by_me != null ? ` (${counts.assigned_by_me})` : ""}` },
                    { key: "owner", label: `I own${counts.owner != null ? ` (${counts.owner})` : ""}` },
                    { key: "team", label: `Team${counts.team != null ? ` (${counts.team})` : ""}` },
                    ...(canSeeAll
                        ? [{ key: "all", label: `All tasks${counts.all != null ? ` (${counts.all})` : ""}` }]
                        : []),
                ]}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <Select
                    showSearch
                    allowClear
                    style={{ width: 320, maxWidth: "100%" }}
                    placeholder="Show only one todo…"
                    suffixIcon={<SearchOutlined />}
                    filterOption={false}
                    notFoundContent={todoOptionsLoading ? <Spin size="small" /> : null}
                    searchValue={todoQuery}
                    onSearch={setTodoQuery}
                    value={todoFilter?.todo_id}
                    onChange={(val) => {
                        if (val === undefined) {
                            setTodoFilter(null);
                            return;
                        }
                        setTodoFilter(todoOptions.find((o) => o.todo_id === val) || null);
                    }}
                >
                    {todoOptions.map((o) => (
                        <Option key={o.todo_id} value={o.todo_id}>
                            {o.title} <span style={{ color: "#999" }}>({o.todo_code})</span>
                        </Option>
                    ))}
                </Select>
                {activeTab !== "assigned_by_me" && sectionFilter !== "all" && (
                    <Button type="link" onClick={() => setSectionFilter("all")} style={{ padding: 0 }}>
                        Show everything
                    </Button>
                )}
                {activeTab !== "assigned_by_me" && sectionFilter === "all" && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Tip: click a card below to focus on just that group.
                    </Text>
                )}
                {canSeeAll && (
                    <SingleEmployeeSelector
                        filterCode="ALL"
                        allOption
                        employee_id={viewAsUserId || "ALL"}
                        setSelectedKey={(_key, val) => setViewAsUserId(val === "ALL" ? null : val)}
                        inputStyles={{ width: 220 }}
                        isInline
                        divStyle={{ width: "auto" }}
                    />
                )}
                <LegendPopover />
            </div>

            <Spin spinning={loading}>
                {activeTab !== "assigned_by_me" ? (
                    <>
                        <div className="mta-tiles">
                            {BUCKETS.map((b) => (
                                <SummaryTile
                                    key={b.key}
                                    bucket={b}
                                    count={buckets[b.key].length}
                                    active={sectionFilter === b.key}
                                    onClick={() => setSectionFilter(sectionFilter === b.key ? "all" : b.key)}
                                />
                            ))}
                        </div>

                        {nothingToShow && !loading && (
                            <div style={{ textAlign: "center", padding: "48px 0", color: "#8c8c8c" }}>
                                <SmileOutlined style={{ fontSize: 34, color: "#b7eb8f" }} />
                                <div style={{ marginTop: 10, fontSize: 15, fontWeight: 600, color: "#595959" }}>
                                    {sectionFilter === "all" ? "You're all caught up" : "Nothing in this group"}
                                </div>
                                <div style={{ fontSize: 12.5 }}>
                                    {todoFilter ? "Try clearing the todo filter." : "New actions assigned to you will show up here."}
                                </div>
                            </div>
                        )}

                        {visibleBuckets
                            .filter((b) => buckets[b.key].length > 0)
                            .map((b) => (
                                <div key={b.key}>
                                    <SectionHeader bucket={b} count={buckets[b.key].length} />
                                    <GroupedTaskList
                                        items={buckets[b.key]}
                                        onComplete={handleComplete}
                                        completed={b.key === "completed_today"}
                                        showMeta={["team", "all"].includes(activeTab)}
                                    />
                                </div>
                            ))}
                    </>
                ) : auditRows.length === 0 && !loading ? (
                    <div style={{ textAlign: "center", padding: "48px 0", color: "#8c8c8c" }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#595959" }}>Nothing assigned by you yet</div>
                        <div style={{ fontSize: 12.5 }}>Todos you create and hand to others will be tracked here.</div>
                    </div>
                ) : (
                    <AssignedByMeList rows={auditRows} navigate={navigate} />
                )}
            </Spin>

            <QuickAddTaskModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} onCreated={load} />
        </div>
    );
}
