import React from "react";
import { Modal } from "antd";
import { useNavigate } from "react-router-dom";
import SubtaskForm from "./SubtaskForm";

/**
 * "New action" popup — reachable from the My Tasks page. There is no path to a standalone task
 * here: every task created this way is a subtask, so the user either picks an existing
 * todo to attach it to (SubtaskForm's parent picker) or jumps to ToDoCreatePage.
 */
export default function QuickAddTaskModal({ open, onClose, onCreated }) {
    const navigate = useNavigate();

    return (
        <Modal title="New action" open={open} destroyOnClose onCancel={onClose} footer={null}>
            <SubtaskForm
                open={open}
                onCreateNewTodo={() => {
                    onClose();
                    navigate("/todo/create");
                }}
                onSaved={(created) => {
                    onCreated && onCreated(created);
                    onClose();
                }}
                onCancel={onClose}
            />
        </Modal>
    );
}
