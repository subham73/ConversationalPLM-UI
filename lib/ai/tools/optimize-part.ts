import { tool } from "ai";
import { z } from "zod";

export const optimizePartCost = () =>
  tool({
    description:
      "Find the optimized manufacturing cost for a mechanical part using PLM and ERP agents. Only use when the user asks about cost, material selection, manufacturing optimization, ERP, or PLM queries.",

    inputSchema: z.object({
      part_name: z
        .string()
        .describe("Internal part identifier, e.g. bearing_6205"),
    }),

    execute: async ({ part_name }) => {
      try {
        const res = await fetch(
          "http://localhost:8000/api/agent/optimize-cost",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ part_name }),
          }
        );

        if (!res.ok) {
          const text = await res.text();
          return {
            error: "Optimization service failed",
            details: text,
          };
        }

        const data = await res.json();

        return data;
      } catch (err: any) {
        return {
          error: "Could not reach optimization service",
          details: err.message,
        };
      }
    },
  });
