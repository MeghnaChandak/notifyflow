import { Alert, Button, Card, Modal, Space, Tag, message } from "antd";
import axios from "axios";
import { useState } from "react";

/**
 * Drop-in replacement for a screen's own "Save & Send Mail" button.
 *
 * Always shows both "Save" and "Save & Notify" — whether the second one actually
 * has anything to send depends on whether an admin has set up a template for
 * `actionKey` in Notification Settings; if not, the preview just says so.
 *
 * `onSave` must perform the real save (however that screen already does it) and
 * resolve to the saved record's id (the "module_key"), or null/throw on failure.
 * It must NOT navigate away or close a parent modal — if it did, that would
 * unmount this component (and its preview popup) before the user ever saw it.
 * Instead, pass `onFinished(moduleKey)`: it fires once the whole interaction is
 * over — right after a plain Save, or after the notify preview is dismissed
 * (sent or skipped) — and that is the right place for the screen to navigate,
 * show its own success message, or close its dialog.
 *
 * `getActionKey(moduleKey)` is optional. Use it when the right notification depends on the record AFTER
 * the save (e.g. its stage). It resolves to the action key to use, or null when nothing applies, and then
 * `actionKey` is not needed.
 */
export default function SaveWithNotification({
    actionKey,
    getActionKey,
    onSave,
    onFinished,
    saveLabel = "Save",
    notifyLabel = "Save & Notify",
    disabled = false,
}) {
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState({ open: false, moduleKey: null, actionKey: null, results: null, loading: false });

    const handlePlainSave = async () => {
        setSaving(true);
        let moduleKey = null;
        try {
            moduleKey = await onSave();
        } finally {
            setSaving(false);
        }
        if (moduleKey !== null) onFinished && onFinished(moduleKey);
    };

    const handleSaveAndNotify = async () => {
        setSaving(true);
        let moduleKey = null;
        try {
            moduleKey = await onSave();
        } finally {
            setSaving(false);
        }
        if (!moduleKey) return; // onSave already reported its own failure; nothing more to do

        let chosenActionKey = actionKey;
        if (getActionKey) {
            try {
                chosenActionKey = await getActionKey(moduleKey);
            } catch (err) {
                chosenActionKey = null;
            }
            if (!chosenActionKey) {
                message.info("Saved. No mail applies at this stage.");
                onFinished && onFinished(moduleKey);
                return;
            }
        }

        setPreview({ open: true, moduleKey, actionKey: chosenActionKey, results: null, loading: true });
        axios
            .post("/notification_settings/preview", { action_key: chosenActionKey, module_key: moduleKey })
            .then((res) => setPreview((prev) => ({ ...prev, results: res.data.data, loading: false })))
            .catch((err) => {
                err?.handleGlobally?.("Notification preview");
                setPreview((prev) => ({ ...prev, loading: false }));
            });
    };

    // Dismissing the preview (Send, Don't send, or the X) is what tells the screen
    // the whole interaction is finished — never before, so the preview is always
    // actually shown first, regardless of how the parent reacts to "finished".
    const closePreview = () => {
        const moduleKey = preview.moduleKey;
        setPreview({ open: false, moduleKey: null, actionKey: null, results: null, loading: false });
        onFinished && onFinished(moduleKey);
    };

    const sendNow = () => {
        axios
            .post("/notification_settings/dispatch", { action_key: preview.actionKey, module_key: preview.moduleKey })
            .then(() => message.success("Notification is being sent"))
            .catch((err) => err?.handleGlobally?.("Send notification"));
        closePreview();
    };

    return (
        <>
            <Space>
                <Button loading={saving} disabled={disabled} onClick={handlePlainSave}>
                    {saveLabel}
                </Button>
                <Button type="primary" loading={saving} disabled={disabled} onClick={handleSaveAndNotify}>
                    {notifyLabel}
                </Button>
            </Space>

            <Modal
                title="Who will be notified"
                open={preview.open}
                onCancel={closePreview}
                footer={[
                    <Button key="skip" onClick={closePreview}>
                        Don't send
                    </Button>,
                    <Button key="send" type="primary" disabled={preview.loading} onClick={sendNow}>
                        Send
                    </Button>,
                ]}
                width={700}
            >
                <div style={{ color: "#888", marginBottom: 12 }}>Already saved — this only decides whether to send the notification mail.</div>
                {preview.loading && <div>Working out who should get this...</div>}
                {preview.results && preview.results.length === 0 && <Alert type="info" message="No notification is set up for this action" />}
                {preview.results &&
                    preview.results.map((result) => (
                        <Card
                            key={result.template_id}
                            size="small"
                            style={{ marginBottom: 8 }}
                            title={result.template_name}
                            extra={<Tag color={result.status === "READY" ? "green" : "default"}>{result.status}</Tag>}
                        >
                            {result.status === "SKIPPED" && <div>Not sent: {result.error}</div>}
                            {result.status === "READY" && (
                                <div>
                                    <div>To: {result.to_emails.join(", ") || "-"}</div>
                                    {result.cc_emails.length > 0 && <div>Cc: {result.cc_emails.join(", ")}</div>}
                                    <div style={{ marginTop: 6 }}>
                                        <b>{result.subject}</b>
                                    </div>
                                </div>
                            )}
                        </Card>
                    ))}
            </Modal>
        </>
    );
}
