import React from "react";
import { Modal } from "antd";
import SubtaskForm from "./SubtaskForm";

/**
 * "+ Add subtask" from inside a parent task's page — the parent is already known,
 * so SubtaskForm's locked-chip mode is used instead of its search picker.
 */
export default function AddSubtaskModal({ open, onClose, parentTodo, onCreated }) {
    return (
        <Modal title="New action" open={open} destroyOnClose onCancel={onClose} width={560} footer={null}>
            <SubtaskForm
                open={open}
                lockedParent={parentTodo}
                onSaved={(created) => {
                    onCreated && onCreated(created);
                    onClose();
                }}
                onCancel={onClose}
            />
        </Modal>
    );
}
