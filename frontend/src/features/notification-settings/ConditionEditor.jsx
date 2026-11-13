import { Button, Input, Select, Space } from "antd";
import axios from "axios";
import { useEffect, useState } from "react";

const OPERATORS = ["=", "!=", "in", "not in", ">", "<", "contains", "is empty"];

// Edits a list of "only when" checks. An empty list means "applies to ALL".
// moduleCode decides which choices a field offers: for example "Status" offers the statuses of
// that module. The backend knows the
// difference (see list_field_options), so we ask it instead of keeping lists here.
export default function ConditionEditor({ value, onChange, fields, moduleCode }) {
    const checks = value || [];
    const [optionsCache, setOptionsCache] = useState({});

    const optionsFor = (field) => optionsCache[`${moduleCode}:${field}`] || [];

    // Only fields the backend marked has_options get a dropdown; the rest stay a text box
    const loadOptions = (field) => {
        const fieldInfo = fields.find((item) => item.value === field);
        const cacheKey = `${moduleCode}:${field}`;
        if (!moduleCode || !fieldInfo?.has_options || optionsCache[cacheKey]) return;

        axios
            .get("/notification_settings/field_options", { params: { module_code: moduleCode, field: field } })
            .then((res) => setOptionsCache((prev) => ({ ...prev, [cacheKey]: res.data.data })))
            .catch((err) => err?.handleGlobally?.("Condition options"));
    };

    const changeCheck = (index, changes) => {
        const newChecks = checks.map((check, i) => (i === index ? { ...check, ...changes } : check));
        onChange(newChecks);
    };

    const removeCheck = (index) => {
        onChange(checks.filter((check, i) => i !== index));
    };

    const addCheck = () => {
        onChange([...checks, { field: undefined, op: "=", value: "" }]);
    };

    // "in" and "not in" take a list of values, every other operator takes one value
    const changeOperator = (index, op) => {
        const wantsList = op === "in" || op === "not in";
        const newValue = wantsList ? [] : "";
        changeCheck(index, { op: op, value: newValue });
    };

    // Load the choices for fields that are already in the conditions (editing a saved template)
    useEffect(() => {
        checks.forEach((check) => {
            if (check.field) loadOptions(check.field);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checks, moduleCode, fields]);

    return (
        <div>
            {checks.length === 0 && <div style={{ color: "#888", marginBottom: 6 }}>No condition: applies to ALL</div>}
            {checks.map((check, index) => {
                const fieldChoices = optionsFor(check.field);
                const wantsList = check.op === "in" || check.op === "not in";

                return (
                    <Space key={index} style={{ display: "flex", marginBottom: 6 }} align="start">
                        <Select
                            style={{ width: 200 }}
                            placeholder="Field"
                            options={fields}
                            value={check.field}
                            onChange={(field) => {
                                changeCheck(index, { field: field, value: wantsList ? [] : "" });
                                loadOptions(field);
                            }}
                        />
                        <Select
                            style={{ width: 110 }}
                            options={OPERATORS.map((op) => ({ value: op, label: op }))}
                            value={check.op}
                            onChange={(op) => changeOperator(index, op)}
                        />
                        {wantsList && fieldChoices.length > 0 && (
                            <Select
                                mode="multiple"
                                showSearch
                                optionFilterProp="label"
                                style={{ minWidth: 240 }}
                                placeholder="Select values"
                                value={Array.isArray(check.value) ? check.value : []}
                                options={fieldChoices}
                                onChange={(newValue) => changeCheck(index, { value: newValue })}
                            />
                        )}
                        {wantsList && fieldChoices.length === 0 && (
                            <Select
                                mode="tags"
                                style={{ minWidth: 240 }}
                                placeholder="Type a value and press enter"
                                value={Array.isArray(check.value) ? check.value : []}
                                onChange={(newValue) => changeCheck(index, { value: newValue })}
                            />
                        )}
                        {!wantsList && check.op !== "is empty" && fieldChoices.length > 0 && (
                            <Select
                                showSearch
                                optionFilterProp="label"
                                style={{ width: 240 }}
                                placeholder="Pick a value"
                                value={check.value === "" ? undefined : check.value}
                                options={fieldChoices}
                                onChange={(newValue) => changeCheck(index, { value: newValue })}
                                allowClear
                            />
                        )}
                        {!wantsList && check.op !== "is empty" && fieldChoices.length === 0 && (
                            <Input
                                style={{ width: 240 }}
                                placeholder="Value"
                                value={check.value}
                                onChange={(e) => changeCheck(index, { value: e.target.value })}
                            />
                        )}
                        <Button danger onClick={() => removeCheck(index)}>
                            Remove
                        </Button>
                    </Space>
                );
            })}
            <Button size="small" onClick={addCheck}>
                + Add condition
            </Button>
        </div>
    );
}
