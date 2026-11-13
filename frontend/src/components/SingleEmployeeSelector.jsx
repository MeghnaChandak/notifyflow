import React from "react";
import InputWithLabel from "./InputWithLabel";
import { Select } from "antd";
import { useAuth } from "../auth/AuthContext";

const SingleEmployeeSelector = ({ allOption, employee_id, setSelectedKey, inputStyles, isInline, divStyle }) => {
    const auth = useAuth();

    let employees = [];
    if (allOption) {
        employees.push({ employee_id: "ALL", employee_name: "All" });
    }
    auth.employees.forEach((employee) => {
        employees.push({ employee_id: employee.employee_id, employee_name: employee.employee_name });
    });

    return (
        <InputWithLabel label="Employee" isInline={isInline} divStyle={divStyle}>
            <Select
                value={employee_id}
                onChange={(value) => {
                    setSelectedKey("employee_id", value);
                }}
                style={inputStyles}
                showSearch={true}
                allowClear
                placeholder="Select Employee"
                optionFilterProp="label"
                options={employees.map((employee, index) => ({
                    label: employee.employee_name,
                    value: employee.employee_id,
                    id: index,
                }))}
            />
        </InputWithLabel>
    );
};

export default SingleEmployeeSelector;
