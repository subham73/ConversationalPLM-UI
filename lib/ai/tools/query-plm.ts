import { tool } from "ai";
import { z } from "zod";

export const queryPLMAgent = tool({
  description: `
  Query the 3DX PLM intelligent agent for engineering, CAD, BOM, 
  cost optimization, or lifecycle queries.
  `,

  inputSchema: z.object({
    query: z.string().describe("User query for PLM system"),
  }),

  execute: async ({ query }) => {
    const res = await fetch("http://localhost:8000/agent/invoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: query }),
    });

    if (!res.ok) {
      return { error: "PLM agent failed" };
    }

    return await res.json();
  },
});
