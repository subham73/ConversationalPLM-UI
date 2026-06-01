const TOOL_DISPLAY_MAP: Record<
  string,
  {
    label: string;
    provider?: string;
  }
> = {
  create_change_action: {
    label: "Create change action",
    provider: "3DX",
  },
  create_issue: {
    label: "Create issue",
    provider: "3DX",
  },
  get_change_action: {
    label: "Read change action",
    provider: "3DX",
  },
  get_issue_by_id: {
    label: "Read issue",
    provider: "3DX",
  },
  get_person: {
    label: "Find person",
    provider: "3DX",
  },
  search_issue: {
    label: "Search issues",
    provider: "3DX",
  },
  slow_demo_tool: {
    label: "Run backend check",
    provider: "3DX",
  },
  summarize_issue_agent_tool: {
    label: "Summarize issue",
    provider: "3DX",
  },
};

function normalizeToolName(typeOrName?: string | null) {
  if (!typeOrName) {
    return "";
  }

  return typeOrName.replace(/^tool-/, "");
}

function titleCaseToolName(toolName: string) {
  return normalizeToolName(toolName)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getToolDisplayName(typeOrName?: string | null) {
  const toolName = normalizeToolName(typeOrName);
  return TOOL_DISPLAY_MAP[toolName]?.label || titleCaseToolName(toolName);
}

export function getToolProvider(typeOrName?: string | null) {
  const toolName = normalizeToolName(typeOrName);
  return TOOL_DISPLAY_MAP[toolName]?.provider;
}

export function getApprovalDisplayName({
  title,
  action,
}: {
  title?: string;
  action?: Record<string, unknown>;
}) {
  const toolName =
    typeof action?.tool === "string"
      ? action.tool
      : title?.match(/^Run\s+(.+)$/i)?.[1];

  return toolName ? getToolDisplayName(toolName) : title || "Approval required";
}
