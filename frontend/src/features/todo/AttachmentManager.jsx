import React, { useState } from "react";
import { Button, List, Popconfirm, Upload, message } from "antd";
import { DeleteOutlined, PaperClipOutlined, UploadOutlined } from "@ant-design/icons";
import axios from "axios";

const MAX_FILE_MB = 10;

function attachmentName(attachment) {
    return attachment.name || attachment.file_name || attachment.object_name || "attachment";
}

/**
 * Attachments of one task. A file is uploaded to POST /upload_todo_attachment/{todo_id} (multipart,
 * field "file"); removing one rewrites the list through POST /add_todo_attachment.
 * An attachment url is either a full http(s) address or a path relative to the API root; relative
 * ones are fetched with the user's token and opened as a blob, because the file endpoint needs auth.
 */
export default function AttachmentManager({ todoId, attachments = [], canEdit = true, onChanged }) {
    const [uploading, setUploading] = useState(false);

    const uploadFile = async (options) => {
        const formData = new FormData();
        formData.append("file", options.file);
        formData.append("todo_id", todoId);
        setUploading(true);
        try {
            await axios.post(`/upload_todo_attachment/${todoId}`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            message.success("Attachment uploaded");
            options.onSuccess && options.onSuccess({});
            onChanged && onChanged();
        } catch (err) {
            options.onError && options.onError(err);
            err?.handleGlobally?.("Upload Attachment");
        } finally {
            setUploading(false);
        }
    };

    const beforeUpload = (file) => {
        if (file.size / 1024 / 1024 > MAX_FILE_MB) {
            message.error(`File must be smaller than ${MAX_FILE_MB} MB`);
            return Upload.LIST_IGNORE;
        }
        return true;
    };

    const removeAttachment = async (index) => {
        const remaining = attachments.filter((item, i) => i !== index);
        try {
            await axios.post("/add_todo_attachment", { todo_id: parseInt(todoId), attachments: remaining });
            message.success("Attachment removed");
            onChanged && onChanged();
        } catch (err) {
            err?.handleGlobally?.("Remove Attachment");
        }
    };

    const openAttachment = async (attachment) => {
        const url = attachment.url;
        if (!url) return;
        if (url.startsWith("http://") || url.startsWith("https://")) {
            window.open(url, "_blank", "noopener,noreferrer");
            return;
        }
        if (!url.startsWith("/")) {
            message.warning("This attachment has no valid address");
            return;
        }
        try {
            const res = await axios.get(url, { responseType: "blob" });
            const blobUrl = window.URL.createObjectURL(res.data);
            window.open(blobUrl, "_blank", "noopener,noreferrer");
        } catch (err) {
            err?.handleGlobally?.("Open Attachment");
        }
    };

    return (
        <div>
            {canEdit && (
                <Upload customRequest={uploadFile} beforeUpload={beforeUpload} showUploadList={false} multiple>
                    <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                        Upload Attachments ({attachments.length})
                    </Button>
                </Upload>
            )}
            <List
                size="small"
                style={{ marginTop: 12 }}
                locale={{ emptyText: "No attachments" }}
                dataSource={attachments}
                renderItem={(attachment, index) => (
                    <List.Item
                        actions={
                            canEdit
                                ? [
                                      <Popconfirm key="remove" title="Remove this attachment?" onConfirm={() => removeAttachment(index)}>
                                          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                                      </Popconfirm>,
                                  ]
                                : []
                        }
                    >
                        <a onClick={() => openAttachment(attachment)}>
                            <PaperClipOutlined /> {attachmentName(attachment)}
                        </a>
                    </List.Item>
                )}
            />
        </div>
    );
}
