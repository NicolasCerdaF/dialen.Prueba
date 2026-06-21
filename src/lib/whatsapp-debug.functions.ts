import { createServerFn } from "@tanstack/react-start";

export const getWhatsAppDiagnostics = createServerFn({ method: "GET" }).handler(async () => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const graphVersion = process.env.META_GRAPH_API_VERSION || "v21.0";

  let metaAppReachable: boolean | null = null;
  let metaAppError: string | null = null;
  if (appId && appSecret) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${graphVersion}/${appId}?access_token=${appId}|${appSecret}&fields=id,name`,
      );
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        metaAppReachable = false;
        metaAppError = json?.error?.message ?? `HTTP ${res.status}`;
      } else {
        metaAppReachable = true;
      }
    } catch (e: any) {
      metaAppReachable = false;
      metaAppError = e?.message ?? "fetch error";
    }
  }

  return {
    server: {
      meta_app_id_set: !!appId,
      meta_app_id_preview: appId ? `${appId.slice(0, 4)}…${appId.slice(-2)}` : null,
      meta_app_secret_set: !!appSecret,
      graph_version: graphVersion,
      meta_app_reachable: metaAppReachable,
      meta_app_error: metaAppError,
    },
  };
});
