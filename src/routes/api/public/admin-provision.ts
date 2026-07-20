import { createFileRoute } from "@tanstack/react-router";
import { handleProvisionRequest } from "@/lib/provision.server";

export const Route = createFileRoute("/api/public/admin-provision")({
  server: {
    handlers: {
      POST: async ({ request }) => handleProvisionRequest(request),
      OPTIONS: async ({ request }) => handleProvisionRequest(request),
    },
  },
});
