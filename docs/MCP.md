# MCP Server (railway) — README

This document explains the MCP server configuration, verification steps, and best practices.

What changed
- The MCP server config (.copilot/mcpServers.json) was updated to use `npx railway mcp`, keep `cwd` and `env`, and restrict the tool capabilities to a conservative default: `["shell", "network", "filesystem"]` for least privilege.

Security notes
- Do NOT commit real secrets. Set `RAILWAY_TOKEN` as a repository or runner secret and reference it via `${RAILWAY_TOKEN}`.
- Ensure the Railway token has the minimum scope required.

Local verification
1. Create a local .env file (for testing only) or export the RAILWAY_TOKEN in your shell:

   export RAILWAY_TOKEN="<your-token>"

2. From the repository root (or the configured `cwd`):

   npm install
   ./scripts/mcp_verify.sh

What to check
- The script attempts to run `npx railway mcp` and streams logs to the console.
- If the MCP process requests an additional capability, you will see an error indicating which permission/tool is missing. Add only that tool to the `tools` list and re-run.

If you prefer a different conservative tool list (for example including `filesystem`), discuss in the PR comments and we will update accordingly.
