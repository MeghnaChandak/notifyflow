import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from loguru import logger

from app import config


def clean_addresses(addresses):
    clean_list = []
    if addresses is None:
        return clean_list
    for address in addresses:
        if address:
            clean_list.append(address)
    return clean_list


def has_line_break(text):
    return "\r" in text or "\n" in text


def build_message(to, cc, subject, body, attachments):
    if attachments:
        message = MIMEMultipart()
        message.attach(MIMEText(body))
    else:
        message = MIMEText(body)

    message["Subject"] = subject
    message["From"] = config.MAIL_FROM
    message["To"] = ", ".join(to)
    if cc:
        message["Cc"] = ", ".join(cc)

    for attachment in attachments:
        content = attachment.get("content")
        if not content:
            continue
        mime_type = attachment.get("content_type")
        if mime_type is None or mime_type == "" or "/" not in mime_type:
            mime_type = "application/octet-stream"
        main_type, sub_type = mime_type.split("/", 1)
        if isinstance(content, str):
            content = content.encode("utf-8")

        part = MIMEBase(main_type, sub_type)
        part.set_payload(content)
        encoders.encode_base64(part)
        filename = attachment.get("filename")
        if filename is None or filename == "":
            filename = "attachment"
        part.add_header("Content-Disposition", "attachment", filename=filename)
        message.attach(part)

    return message


def send_mail(to, subject, body, cc=None, bcc=None, attachments=None):
    """Sends one mail. Returns True when it was sent (or logged, in console mode), False otherwise.
    Header values with line breaks are refused so a template cannot inject extra headers."""
    to = clean_addresses(to)
    cc = clean_addresses(cc)
    bcc = clean_addresses(bcc)
    if attachments is None:
        attachments = []
    if not to and not cc and not bcc:
        return False

    for header_value in [subject] + to + cc + bcc:
        if has_line_break(header_value):
            logger.error("Mail refused: a subject or address contains a line break")
            return False

    if config.MAIL_MODE != "smtp":
        logger.info(f"[MAIL console mode] To={to} Cc={cc} Bcc={bcc} Subject={subject!r} Attachments={len(attachments)}")
        logger.info(f"[MAIL console mode] Body:\n{body}")
        return True

    try:
        message = build_message(to, cc, subject, body, attachments)
        recipients = to + cc + bcc
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=30) as server:
            if config.SMTP_USE_TLS:
                server.starttls()
            if config.SMTP_USERNAME != "":
                server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
            server.sendmail(config.MAIL_FROM, recipients, message.as_string())
        return True
    except Exception as e:
        logger.error(f"Could not send mail: {e}")
        return False
