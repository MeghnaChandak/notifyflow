import { Tabs } from "antd";
import NotificationGroups from "./NotificationGroups";
import NotificationLogs from "./NotificationLogs";
import NotificationRules from "./NotificationRules";

export default function NotificationSettings({ permissions }) {
    return (
        <div className="my-form-outer">
            <span className="my-form-title">Notification Settings</span>
            <Tabs
                items={[
                    { key: "rules", label: "Rules", children: <NotificationRules permissions={permissions} /> },
                    { key: "logs", label: "Delivery Log", children: <NotificationLogs /> },
                    { key: "groups", label: "Groups", children: <NotificationGroups permissions={permissions} /> },

                ]}
            />
        </div>
    );
}
