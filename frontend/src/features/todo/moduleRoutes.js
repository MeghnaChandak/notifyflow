// Links on a task are generic external references: a label (e.g. "JIRA", "INVOICE"), a reference
// text (e.g. "ABC-123") and an optional URL. Nothing here navigates into another module.

// Ref codes are often already self-prefixed (e.g. "INV-204" under label "INV") — only prepend the
// label when the ref doesn't already carry it, so chips never read "INVINV-204".
export function formatLinkDisplay(module, ref) {
    const refStr = String(ref);
    if (!module) return refStr;
    return refStr.toUpperCase().startsWith(module.toUpperCase()) ? refStr : `${module}${refStr}`;
}

// Only plain web addresses are ever opened; anything else (javascript:, data:, relative paths) is rejected
export function safeExternalUrl(url) {
    if (!url) return null;
    const text = String(url).trim();
    if (text.startsWith("https://") || text.startsWith("http://")) {
        return text;
    }
    return null;
}

export function openExternalLink(url) {
    const safeUrl = safeExternalUrl(url);
    if (!safeUrl) return false;
    window.open(safeUrl, "_blank", "noopener,noreferrer");
    return true;
}
