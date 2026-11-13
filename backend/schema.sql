-- NotifyFlow database schema (MySQL 8, InnoDB, utf8mb4).
-- Applied by `python scripts/init_db.py`. Safe to run more than once (CREATE TABLE IF NOT EXISTS,
-- seed rows only inserted when missing).

-- ---------------------------------------------------------------------------
-- People and lookup tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS departments (
    department_id   INT AUTO_INCREMENT PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL,
    is_deleted      TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_department_name (department_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    email         VARCHAR(190) NOT NULL,
    password_hash VARCHAR(300) NOT NULL,
    role          ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    department_id INT NULL,
    manager_id    INT NULL,
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    is_deleted    TINYINT(1) NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_email (email),
    KEY idx_user_department (department_id),
    KEY idx_user_manager (manager_id),
    CONSTRAINT fk_user_department FOREIGN KEY (department_id) REFERENCES departments (department_id),
    CONSTRAINT fk_user_manager FOREIGN KEY (manager_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS todo_statuses (
    todo_status_id   INT AUTO_INCREMENT PRIMARY KEY,
    todo_status_name VARCHAR(50) NOT NULL,
    is_deleted       TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_todo_status_name (todo_status_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS priorities (
    priority_id   INT AUTO_INCREMENT PRIMARY KEY,
    priority_name VARCHAR(50) NOT NULL,
    is_deleted    TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_priority_name (priority_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- To-Do
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS todo_tasks (
    todo_id          INT AUTO_INCREMENT PRIMARY KEY,
    todo_code        VARCHAR(20) NULL,
    title            VARCHAR(100) NOT NULL,
    description      VARCHAR(255) NULL,
    todo_status_id   INT NOT NULL,
    todo_priority_id INT NOT NULL,
    term_type        VARCHAR(50) NULL,
    target_date      DATETIME NULL,
    owner_id         INT NOT NULL,
    assigned_to_id   INT NOT NULL,
    department_id    INT NULL,
    assigned_date    DATETIME NULL,
    is_private       TINYINT(1) NOT NULL DEFAULT 0,
    parent_todo_id   INT NULL,
    attachments      JSON NULL,
    created_by       INT NOT NULL,
    created_time     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by       INT NULL,
    updated_time     DATETIME NULL,
    is_deleted       TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_todo_code (todo_code),
    KEY idx_todo_owner (owner_id),
    KEY idx_todo_assigned (assigned_to_id),
    KEY idx_todo_created_by (created_by),
    KEY idx_todo_parent (parent_todo_id),
    KEY idx_todo_status (todo_status_id),
    KEY idx_todo_department (department_id),
    CONSTRAINT fk_todo_status FOREIGN KEY (todo_status_id) REFERENCES todo_statuses (todo_status_id),
    CONSTRAINT fk_todo_priority FOREIGN KEY (todo_priority_id) REFERENCES priorities (priority_id),
    CONSTRAINT fk_todo_owner FOREIGN KEY (owner_id) REFERENCES users (user_id),
    CONSTRAINT fk_todo_assigned FOREIGN KEY (assigned_to_id) REFERENCES users (user_id),
    CONSTRAINT fk_todo_creator FOREIGN KEY (created_by) REFERENCES users (user_id),
    CONSTRAINT fk_todo_department FOREIGN KEY (department_id) REFERENCES departments (department_id),
    CONSTRAINT fk_todo_parent FOREIGN KEY (parent_todo_id) REFERENCES todo_tasks (todo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS todo_tags (
    tag_id       INT AUTO_INCREMENT PRIMARY KEY,
    todo_id      INT NOT NULL,
    tag_name     VARCHAR(50) NOT NULL,
    created_by   INT NULL,
    created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted   TINYINT(1) NOT NULL DEFAULT 0,
    KEY idx_tag_todo (todo_id),
    CONSTRAINT fk_tag_todo FOREIGN KEY (todo_id) REFERENCES todo_tasks (todo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS todo_subscribers (
    subscriber_row_id INT AUTO_INCREMENT PRIMARY KEY,
    todo_id           INT NOT NULL,
    subscriber_id     INT NOT NULL,
    created_by        INT NULL,
    created_time      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by        INT NULL,
    updated_time      DATETIME NULL,
    is_deleted        TINYINT(1) NOT NULL DEFAULT 0,
    KEY idx_subscriber_todo (todo_id),
    KEY idx_subscriber_user (subscriber_id),
    CONSTRAINT fk_subscriber_todo FOREIGN KEY (todo_id) REFERENCES todo_tasks (todo_id),
    CONSTRAINT fk_subscriber_user FOREIGN KEY (subscriber_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A link points from a to-do to anything outside NotifyFlow (a ticket, an order, a web page...).
CREATE TABLE IF NOT EXISTS todo_links (
    link_id          INT AUTO_INCREMENT PRIMARY KEY,
    todo_id          INT NOT NULL,
    module_name      VARCHAR(50) NOT NULL,
    module_ref       VARCHAR(100) NOT NULL,
    module_record_id VARCHAR(255) NULL,
    title            VARCHAR(100) NULL,
    url              VARCHAR(500) NULL,
    created_by       INT NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by       INT NULL,
    updated_at       DATETIME NULL,
    is_deleted       TINYINT(1) NOT NULL DEFAULT 0,
    KEY idx_link_todo (todo_id),
    KEY idx_link_ref (module_name, module_ref),
    CONSTRAINT fk_link_todo FOREIGN KEY (todo_id) REFERENCES todo_tasks (todo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS todo_comments (
    comment_id   INT AUTO_INCREMENT PRIMARY KEY,
    todo_id      INT NOT NULL,
    comment      VARCHAR(255) NOT NULL,
    created_by   INT NULL,
    created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by   INT NULL,
    updated_time DATETIME NULL,
    is_deleted   TINYINT(1) NOT NULL DEFAULT 0,
    KEY idx_comment_todo (todo_id),
    CONSTRAINT fk_comment_todo FOREIGN KEY (todo_id) REFERENCES todo_tasks (todo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Change history of a to-do (who changed which field from what to what)
CREATE TABLE IF NOT EXISTS todo_activity (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    todo_id        INT NOT NULL,
    comment        VARCHAR(255) NULL,
    change_json    JSON NULL,
    updated_by     INT NULL,
    created_time   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_activity_todo (todo_id),
    CONSTRAINT fk_activity_todo FOREIGN KEY (todo_id) REFERENCES todo_tasks (todo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Notification engine
--
-- notif_modules   : things that can raise notifications (To-Do now; add more by registering a
--                   context loader in app/services/notifications.py)
-- notif_actions   : something that happens in a module (created, updated...). action_key is the unique
--                   key the app sends when the action happens.
-- notif_templates : one message for one audience on one action: subject/body, recipients_json,
--                   an optional "only when" condition_json and optional attachments_json.
-- notif_groups    : a named list of users.
-- notif_logs      : one row per template tried on each action (SENT / FAILED / SKIPPED).
--
-- recipients_json: [{"send_as":"TO","type":"GROUP|ROLE|EMPLOYEE","value":...,"condition":null}]
-- condition_json : [{"field":"priority","op":"=","value":"High"}]  (all checks must be true;
--                  ops: =  !=  in  not in  >  <  contains  is empty)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notif_modules (
    module_id   INT AUTO_INCREMENT PRIMARY KEY,
    module_code VARCHAR(50) NOT NULL,
    module_name VARCHAR(100) NOT NULL,
    is_deleted  TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_notif_module_code (module_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notif_actions (
    action_id   INT AUTO_INCREMENT PRIMARY KEY,
    module_id   INT NOT NULL,
    action_code VARCHAR(50) NOT NULL,
    action_key  VARCHAR(100) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    is_deleted  TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_notif_action_key (action_key),
    KEY idx_notif_action_module (module_id),
    CONSTRAINT fk_notif_action_module FOREIGN KEY (module_id) REFERENCES notif_modules (module_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notif_templates (
    template_id      INT AUTO_INCREMENT PRIMARY KEY,
    action_id        INT NOT NULL,
    template_name    VARCHAR(150) NOT NULL,
    channel          VARCHAR(20) NOT NULL DEFAULT 'EMAIL',
    subject          VARCHAR(255) NOT NULL,
    body             MEDIUMTEXT NOT NULL,
    condition_json   JSON NULL,
    recipients_json  JSON NOT NULL,
    attachments_json JSON NULL,
    stop_on_match    TINYINT(1) NOT NULL DEFAULT 0,
    is_fallback      TINYINT(1) NOT NULL DEFAULT 0,
    exclude_actor    TINYINT(1) NOT NULL DEFAULT 0,
    is_deleted       TINYINT(1) NOT NULL DEFAULT 0,
    created_by       INT NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by       INT NULL,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_notif_template_action (action_id),
    CONSTRAINT fk_notif_template_action FOREIGN KEY (action_id) REFERENCES notif_actions (action_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notif_groups (
    group_id   INT AUTO_INCREMENT PRIMARY KEY,
    group_code VARCHAR(50) NOT NULL,
    group_name VARCHAR(100) NOT NULL,
    user_ids   JSON NOT NULL,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_notif_group_code (group_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notif_logs (
    log_id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    template_id      INT NOT NULL,
    module_code      VARCHAR(50) NOT NULL,
    action_key       VARCHAR(100) NOT NULL,
    module_key       VARCHAR(50) NOT NULL,
    channel          VARCHAR(20) NOT NULL,
    to_list          TEXT NULL,
    cc_list          TEXT NULL,
    bcc_list         TEXT NULL,
    subject          VARCHAR(255) NULL,
    body             MEDIUMTEXT NULL,
    attachments_list TEXT NULL,
    status           VARCHAR(20) NOT NULL,
    error            TEXT NULL,
    triggered_by     INT NULL,
    created_time     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_notif_log_module (module_code, module_key),
    KEY idx_notif_log_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- In-app notifications shown in the bell menu (one row per person per notification)
CREATE TABLE IF NOT EXISTS inbox_notifications (
    inbox_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    title        VARCHAR(255) NOT NULL,
    message      TEXT NULL,
    module_code  VARCHAR(50) NULL,
    module_key   VARCHAR(50) NULL,
    is_read      TINYINT(1) NOT NULL DEFAULT 0,
    created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_inbox_user (user_id, is_read, inbox_id),
    CONSTRAINT fk_inbox_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Seed data (only inserted when missing)
-- ---------------------------------------------------------------------------

-- The screens colour priorities by id 0-3 and compare statuses by name, so these ids and names are fixed.
SET @old_sql_mode = @@SESSION.sql_mode;
SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'NO_AUTO_VALUE_ON_ZERO');

INSERT IGNORE INTO todo_statuses (todo_status_id, todo_status_name) VALUES
    (1, 'New'), (2, 'Assigned'), (3, 'In Progress'), (4, 'Blocked'), (5, 'Resolved'), (6, 'Closed');

INSERT IGNORE INTO priorities (priority_id, priority_name) VALUES
    (0, 'NA'), (1, 'Low'), (2, 'Medium'), (3, 'High');

SET SESSION sql_mode = @old_sql_mode;

INSERT IGNORE INTO departments (department_name) VALUES
    ('General'), ('Operations'), ('Engineering'), ('Finance');

INSERT IGNORE INTO notif_modules (module_code, module_name) VALUES ('TODO', 'To-Do');

INSERT IGNORE INTO notif_actions (module_id, action_code, action_key, name)
SELECT module_id, 'CREATE', 'TODO_CREATE', 'To-Do task created'
FROM notif_modules WHERE module_code = 'TODO';

INSERT IGNORE INTO notif_actions (module_id, action_code, action_key, name)
SELECT module_id, 'UPDATE', 'TODO_UPDATE', 'To-Do task updated'
FROM notif_modules WHERE module_code = 'TODO';

INSERT INTO notif_templates (action_id, template_name, subject, body, recipients_json)
SELECT na.action_id, 'To-Do task updated',
    'Task updated: {{title}}',
    '{{title}} was updated.\n\nStatus: {{status}}\nPriority: {{priority}}\nTarget date: {{target_date}}\nAssigned to: {{assigned_to_name}}\nOpen: {{record_link}}\n',
    '[{"send_as":"TO","type":"ROLE","value":"OWNER","condition":null},
      {"send_as":"TO","type":"ROLE","value":"ASSIGNEE","condition":null},
      {"send_as":"CC","type":"ROLE","value":"SUBSCRIBERS","condition":null}]'
FROM notif_actions na
WHERE na.action_key = 'TODO_UPDATE'
  AND NOT EXISTS (SELECT 1 FROM notif_templates nt WHERE nt.action_id = na.action_id);

INSERT INTO notif_templates (action_id, template_name, subject, body, recipients_json)
SELECT na.action_id, 'To-Do task created',
    'Task: {{title}}',
    '{{title}}\n\n{{description}}\n\nTarget date: {{target_date}}\nPriority: {{priority}}\nStatus: {{status}}\nAssigned to: {{assigned_to_name}}\nLinked to: {{linked_summary}}\nOpen: {{record_link}}\n',
    '[{"send_as":"TO","type":"ROLE","value":"OWNER","condition":null},
      {"send_as":"TO","type":"ROLE","value":"ASSIGNEE","condition":null},
      {"send_as":"CC","type":"ROLE","value":"SUBSCRIBERS","condition":null}]'
FROM notif_actions na
WHERE na.action_key = 'TODO_CREATE'
  AND NOT EXISTS (SELECT 1 FROM notif_templates nt WHERE nt.action_id = na.action_id);
