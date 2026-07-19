import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Types ----------
export type Product = {
  id: string;
  company_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  price: number;
  cost: number;
  currency: string;
  stock: number | null;
  track_stock: boolean;
  low_stock_threshold: number | null;
  images: any;
  variants: any;
  custom_fields: any;
  ai_recommendable: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductLink = {
  id: string;
  product_id: string;
  customer_id: string;
  conversation_id: string | null;
  context: string;
  quantity: number;
  unit_price: number | null;
  estimated_value: number | null;
  notes: string | null;
  created_at: string;
  product?: Pick<Product, "id" | "name" | "sku" | "price" | "currency" | "images"> | null;
};

async function getCompanyId(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (!data?.company_id) throw new Error("Sin empresa");
  return data.company_id as string;
}

// ---------- List products ----------
const ListInput = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  active: z.boolean().optional(),
  tag: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("products").select("*");
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%,description.ilike.%${s}%`);
    }
    if (data.category) q = q.eq("category", data.category);
    if (typeof data.active === "boolean") q = q.eq("active", data.active);
    if (data.tag) q = q.contains("tags", [data.tag]);
    q = q.order("updated_at", { ascending: false }).limit(data.limit);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Product[];
  });

// ---------- Get product ----------
export const getProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.from("products").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row as Product | null;
  });

// ---------- Upsert product ----------
const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().max(80).nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  category: z.string().max(120).nullable().optional(),
  tags: z.array(z.string()).default([]),
  price: z.number().min(0).default(0),
  cost: z.number().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  stock: z.number().int().nullable().optional(),
  track_stock: z.boolean().default(false),
  low_stock_threshold: z.number().int().nullable().optional(),
  images: z.array(z.string()).default([]),
  variants: z.array(z.any()).default([]),
  custom_fields: z.record(z.string(), z.any()).default({}),
  ai_recommendable: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const company_id = await getCompanyId(supabase, userId);
    const payload: any = { ...data, company_id };
    if (!data.id) payload.created_by = userId;
    const { data: row, error } = await supabase
      .from("products")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as Product;
  });

// ---------- Delete product ----------
export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Link product ↔ customer ----------
const LinkInput = z.object({
  product_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable().optional(),
  context: z.enum(["interested", "quoted", "purchased", "recommended"]).default("interested"),
  quantity: z.number().int().min(1).default(1),
  unit_price: z.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const linkProductToCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LinkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const company_id = await getCompanyId(supabase, userId);
    const { data: p } = await supabase
      .from("products")
      .select("id, name, price, currency")
      .eq("id", data.product_id)
      .maybeSingle();
    if (!p) throw new Error("Producto no encontrado");
    const unit_price = data.unit_price ?? p.price;
    const estimated_value = Number(unit_price) * data.quantity;
    const { data: row, error } = await supabase
      .from("product_customers")
      .insert({
        product_id: data.product_id,
        customer_id: data.customer_id,
        conversation_id: data.conversation_id ?? null,
        company_id,
        context: data.context,
        quantity: data.quantity,
        unit_price,
        estimated_value,
        notes: data.notes ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Bump customer estimated_value + timeline event
    const { data: c } = await supabase
      .from("customers")
      .select("estimated_value")
      .eq("id", data.customer_id)
      .maybeSingle();
    const nextValue = Number(c?.estimated_value ?? 0) + estimated_value;
    await supabase.from("customers").update({ estimated_value: nextValue }).eq("id", data.customer_id);
    await supabase.from("customer_events").insert({
      customer_id: data.customer_id,
      company_id,
      actor_id: userId,
      event_type: "product_linked",
      payload: {
        product_id: data.product_id,
        product_name: p.name,
        quantity: data.quantity,
        unit_price,
        estimated_value,
        context: data.context,
      },
    });
    return row as ProductLink;
  });

// ---------- Unlink ----------
export const unlinkProductFromCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: link } = await supabase
      .from("product_customers")
      .select("customer_id, estimated_value, company_id, product_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase.from("product_customers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (link) {
      const { data: c } = await supabase
        .from("customers")
        .select("estimated_value")
        .eq("id", link.customer_id)
        .maybeSingle();
      const next = Math.max(0, Number(c?.estimated_value ?? 0) - Number(link.estimated_value ?? 0));
      await supabase.from("customers").update({ estimated_value: next }).eq("id", link.customer_id);
      await supabase.from("customer_events").insert({
        customer_id: link.customer_id,
        company_id: link.company_id,
        actor_id: userId,
        event_type: "product_unlinked",
        payload: { product_id: link.product_id },
      });
    }
    return { ok: true };
  });

// ---------- List links for customer ----------
export const listCustomerProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ customer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("product_customers")
      .select("*, product:products(id, name, sku, price, currency, images)")
      .eq("customer_id", data.customer_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProductLink[];
  });

// ---------- Catalog overview / KPIs ----------
export const getCatalogOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: products }, { data: links }, { data: recos }] = await Promise.all([
      supabase.from("products").select("id, name, price, cost, stock, track_stock, low_stock_threshold, active, category, ai_recommendable"),
      supabase
        .from("product_customers")
        .select("product_id, quantity, unit_price, estimated_value, context, created_at"),
      supabase.from("product_recommendations").select("product_id, status, created_at"),
    ]);
    const p = products ?? [];
    const l = links ?? [];
    const r = recos ?? [];

    const totalActive = p.filter((x: any) => x.active).length;
    const lowStock = p.filter(
      (x: any) => x.track_stock && typeof x.stock === "number" && typeof x.low_stock_threshold === "number" && x.stock <= x.low_stock_threshold,
    );
    const linksByProduct = new Map<string, { count: number; value: number; purchased: number }>();
    for (const link of l) {
      const cur = linksByProduct.get(link.product_id) ?? { count: 0, value: 0, purchased: 0 };
      cur.count += 1;
      cur.value += Number(link.estimated_value ?? 0);
      if (link.context === "purchased") cur.purchased += 1;
      linksByProduct.set(link.product_id, cur);
    }
    const recosByProduct = new Map<string, number>();
    for (const rec of r) recosByProduct.set(rec.product_id, (recosByProduct.get(rec.product_id) ?? 0) + 1);

    const enriched = p.map((prod: any) => {
      const stat = linksByProduct.get(prod.id) ?? { count: 0, value: 0, purchased: 0 };
      const recoCount = recosByProduct.get(prod.id) ?? 0;
      const margin = Number(prod.price ?? 0) - Number(prod.cost ?? 0);
      const marginPct = prod.price > 0 ? margin / Number(prod.price) : 0;
      return { ...prod, links: stat.count, pipeline_value: stat.value, purchased: stat.purchased, reco_count: recoCount, margin, margin_pct: marginPct };
    });

    const topSelling = [...enriched].filter((x) => x.purchased > 0).sort((a, b) => b.purchased - a.purchased).slice(0, 5);
    const topPipeline = [...enriched].filter((x) => x.pipeline_value > 0).sort((a, b) => b.pipeline_value - a.pipeline_value).slice(0, 5);
    const topRecommended = [...enriched].filter((x) => x.reco_count > 0).sort((a, b) => b.reco_count - a.reco_count).slice(0, 5);
    const topMargin = [...enriched].filter((x) => x.price > 0).sort((a, b) => b.margin_pct - a.margin_pct).slice(0, 5);

    // Pipeline agrupado por moneda del producto (no sumar MXN + USD como si fueran lo mismo).
    const productCurrency = new Map<string, string>();
    for (const prod of p) productCurrency.set(prod.id, (prod as any).currency ?? "USD");
    const pipelineByCurrency: Record<string, number> = {};
    for (const link of l) {
      const cur = productCurrency.get(link.product_id) ?? "USD";
      pipelineByCurrency[cur] = (pipelineByCurrency[cur] ?? 0) + Number(link.estimated_value ?? 0);
    }
    // Productos distintos con al menos un vínculo (para KPI "Vinculados a clientes").
    const linkedProducts = new Set<string>();
    for (const link of l) linkedProducts.add(link.product_id);

    return {
      totals: {
        products: p.length,
        active: totalActive,
        lowStock: lowStock.length,
        recommendations: r.length,
        linkedProducts: linkedProducts.size,
        linkedRecords: l.length,
      },
      pipelineByCurrency,
      lowStock: lowStock.slice(0, 10),
      topSelling,
      topPipeline,
      topRecommended,
      topMargin,
      enriched,
    };
  });

// ============================================================
// Advanced list, bulk actions, duplicate, stock, import, AI
// ============================================================

const AdvListInput = z.object({
  search: z.string().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  active: z.enum(["all", "active", "inactive"]).default("all"),
  ai: z.enum(["all", "on", "off"]).default("all"),
  stock: z.enum(["all", "low", "out", "tracked"]).default("all"),
  price_min: z.number().optional(),
  price_max: z.number().optional(),
  sort: z
    .enum(["updated_at", "name", "price", "margin_pct", "stock"])
    .default("updated_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(1000).default(200),
  offset: z.number().int().min(0).default(0),
});

export const listProductsAdvanced = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AdvListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("products").select("*", { count: "exact" });
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%,description.ilike.%${s}%,category.ilike.%${s}%`);
    }
    if (data.categories?.length) q = q.in("category", data.categories);
    if (data.tags?.length) q = q.contains("tags", data.tags);
    if (data.active === "active") q = q.eq("active", true);
    else if (data.active === "inactive") q = q.eq("active", false);
    if (data.ai === "on") q = q.eq("ai_recommendable", true);
    else if (data.ai === "off") q = q.eq("ai_recommendable", false);
    if (typeof data.price_min === "number") q = q.gte("price", data.price_min);
    if (typeof data.price_max === "number") q = q.lte("price", data.price_max);
    if (data.stock === "tracked") q = q.eq("track_stock", true);
    else if (data.stock === "out") q = q.eq("track_stock", true).eq("stock", 0);
    // "low" cannot be filtered SQL-side (compares to per-row threshold) — filter after fetch.

    const sortCol = data.sort === "margin_pct" ? "price" : data.sort;
    q = q.order(sortCol, { ascending: data.dir === "asc" });
    q = q.range(data.offset, data.offset + data.limit - 1);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    let out = (rows ?? []) as Product[];
    if (data.stock === "low") {
      out = out.filter(
        (r) =>
          r.track_stock &&
          typeof r.stock === "number" &&
          typeof r.low_stock_threshold === "number" &&
          r.stock <= r.low_stock_threshold,
      );
    }
    if (data.sort === "margin_pct") {
      out = [...out].sort((a, b) => {
        const ma = a.price > 0 ? (a.price - a.cost) / a.price : 0;
        const mb = b.price > 0 ? (b.price - b.cost) / b.price : 0;
        return data.dir === "asc" ? ma - mb : mb - ma;
      });
    }
    return { rows: out, count: count ?? out.length };
  });

// ---------- Bulk actions ----------
const BulkInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum([
    "activate",
    "deactivate",
    "delete",
    "ai_on",
    "ai_off",
    "set_category",
    "add_tag",
    "remove_tag",
    "set_currency",
  ]),
  value: z.string().max(120).optional(),
});

export const bulkProductAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BulkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.action === "delete") {
      const { error } = await supabase.from("products").delete().in("id", data.ids);
      if (error) throw new Error(error.message);
      return { ok: true, count: data.ids.length };
    }
    if (data.action === "add_tag" || data.action === "remove_tag") {
      if (!data.value) throw new Error("Etiqueta requerida");
      const { data: rows } = await supabase.from("products").select("id, tags, company_id").in("id", data.ids);
      let n = 0;
      for (const r of rows ?? []) {
        const cur: string[] = (r as any).tags ?? [];
        const next =
          data.action === "add_tag"
            ? Array.from(new Set([...cur, data.value!]))
            : cur.filter((t) => t !== data.value);
        const { error } = await supabase.from("products").update({ tags: next }).eq("id", (r as any).id);
        if (!error) {
          n++;
          await supabase.from("product_events").insert({
            product_id: (r as any).id,
            company_id: (r as any).company_id,
            actor_id: userId,
            event_type: data.action,
            payload: { tag: data.value },
          });
        }
      }
      return { ok: true, count: n };
    }
    const patch: any = {};
    if (data.action === "activate") patch.active = true;
    if (data.action === "deactivate") patch.active = false;
    if (data.action === "ai_on") patch.ai_recommendable = true;
    if (data.action === "ai_off") patch.ai_recommendable = false;
    if (data.action === "set_category") patch.category = data.value || null;
    if (data.action === "set_currency") patch.currency = (data.value || "USD").toUpperCase().slice(0, 3);
    const { data: updated, error } = await supabase
      .from("products")
      .update(patch)
      .in("id", data.ids)
      .select("id, company_id");
    if (error) throw new Error(error.message);
    for (const u of updated ?? []) {
      await supabase.from("product_events").insert({
        product_id: (u as any).id,
        company_id: (u as any).company_id,
        actor_id: userId,
        event_type: data.action,
        payload: patch,
      });
    }
    return { ok: true, count: (updated ?? []).length };
  });

// ---------- Duplicate ----------
export const duplicateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: src } = await supabase.from("products").select("*").eq("id", data.id).maybeSingle();
    if (!src) throw new Error("Producto no encontrado");
    const clone: any = { ...src };
    delete clone.id;
    delete clone.created_at;
    delete clone.updated_at;
    clone.name = `${src.name} (copia)`;
    clone.sku = src.sku ? `${src.sku}-COPY-${Math.floor(Math.random() * 900 + 100)}` : null;
    clone.created_by = userId;
    const { data: row, error } = await supabase.from("products").insert(clone).select("*").single();
    if (error) throw new Error(error.message);
    await supabase.from("product_events").insert({
      product_id: (row as any).id,
      company_id: (row as any).company_id,
      actor_id: userId,
      event_type: "duplicated_from",
      payload: { source_id: src.id, source_name: src.name },
    });
    return row as Product;
  });

// ---------- Adjust stock ----------
const StockInput = z.object({
  id: z.string().uuid(),
  delta: z.number().int().optional(),
  set: z.number().int().min(0).optional(),
  reason: z.string().max(200).optional(),
});
export const adjustStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => StockInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("products")
      .select("id, stock, track_stock, company_id, name")
      .eq("id", data.id)
      .maybeSingle();
    if (!p) throw new Error("Producto no encontrado");
    if (!(p as any).track_stock) throw new Error("Este producto no controla stock");
    const prev = Number((p as any).stock ?? 0);
    const next =
      typeof data.set === "number"
        ? data.set
        : Math.max(0, prev + Number(data.delta ?? 0));
    const { error } = await supabase.from("products").update({ stock: next }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("product_events").insert({
      product_id: data.id,
      company_id: (p as any).company_id,
      actor_id: userId,
      event_type: "stock_adjusted",
      payload: { prev, next, delta: next - prev, reason: data.reason ?? null },
    });
    return { ok: true, prev, next };
  });

// ---------- Bulk import ----------
const ImportRow = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(80).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  price: z.number().min(0).default(0),
  cost: z.number().min(0).default(0),
  currency: z.string().length(3).optional(),
  stock: z.number().int().optional().nullable(),
  track_stock: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().max(4000).optional().nullable(),
  active: z.boolean().optional(),
});
export const bulkImportProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ rows: z.array(ImportRow).min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const company_id = await getCompanyId(supabase, userId);
    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: { row: number; error: string }[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        // Match by SKU when provided
        let existingId: string | null = null;
        if (r.sku) {
          const { data: ex } = await supabase
            .from("products")
            .select("id")
            .eq("company_id", company_id)
            .eq("sku", r.sku)
            .maybeSingle();
          existingId = (ex as any)?.id ?? null;
        }
        const payload: any = {
          company_id,
          name: r.name,
          sku: r.sku ?? null,
          category: r.category ?? null,
          price: r.price ?? 0,
          cost: r.cost ?? 0,
          currency: (r.currency ?? "USD").toUpperCase(),
          stock: r.track_stock ? r.stock ?? 0 : r.stock ?? null,
          track_stock: r.track_stock ?? false,
          tags: r.tags ?? [],
          description: r.description ?? null,
          active: r.active ?? true,
        };
        if (existingId) {
          const { error } = await supabase.from("products").update(payload).eq("id", existingId);
          if (error) throw new Error(error.message);
          updated++;
        } else {
          payload.created_by = userId;
          const { error } = await supabase.from("products").insert(payload);
          if (error) throw new Error(error.message);
          created++;
        }
      } catch (e: any) {
        failed++;
        errors.push({ row: i + 1, error: e?.message ?? "error" });
      }
    }
    return { created, updated, failed, errors };
  });

// ---------- Product details / timeline ----------
export const getProductDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: product }, { data: links }, { data: recos }, { data: quoteItems }, { data: events }] =
      await Promise.all([
        supabase.from("products").select("*").eq("id", data.id).maybeSingle(),
        supabase
          .from("product_customers")
          .select("*, customer:customers(id,name,company,phone,stage)")
          .eq("product_id", data.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("product_recommendations")
          .select("*, customer:customers(id,name)")
          .eq("product_id", data.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("quote_items")
          .select("id, name, quantity, unit_price, position, quote:quotes(id,number,status,customer_id,created_at,total)")
          .eq("product_id", data.id)
          .order("id", { ascending: false })
          .limit(50),
        supabase
          .from("product_events")
          .select("*")
          .eq("product_id", data.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
    if (!product) return null;
    const l = (links ?? []) as any[];
    const q = (quoteItems ?? []) as any[];
    const pipelineValue = l.reduce((s, x) => s + Number(x.estimated_value ?? 0), 0);
    const purchasedCount = l.filter((x) => x.context === "purchased").length;
    const acceptedQuotes = q.filter((x: any) => x.quote?.status === "accepted");
    const revenue = acceptedQuotes.reduce(
      (s, x: any) => s + Number(x.unit_price ?? 0) * Number(x.quantity ?? 0),
      0,
    );
    return {
      product,
      links: l,
      recommendations: recos ?? [],
      quoteItems: q,
      events: events ?? [],
      metrics: {
        pipelineValue,
        purchasedCount,
        linksCount: l.length,
        recoCount: (recos ?? []).length,
        quotesCount: q.length,
        revenue,
      },
    };
  });

// ---------- Catalog alerts ----------
export const getCatalogAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: products } = await supabase.from("products").select("*");
    const p = (products ?? []) as any[];
    const lowStock = p.filter(
      (x) =>
        x.track_stock &&
        typeof x.stock === "number" &&
        typeof x.low_stock_threshold === "number" &&
        x.stock <= x.low_stock_threshold,
    );
    const outOfStock = p.filter((x) => x.track_stock && x.stock === 0);
    const noMargin = p.filter((x) => x.active && Number(x.price) > 0 && Number(x.price) - Number(x.cost) <= 0);
    const missingPrice = p.filter((x) => x.active && Number(x.price) === 0);
    const aiPaused = p.filter((x) => x.active && !x.ai_recommendable);
    // Orphan = active but no links + no recos, checked lazily
    const { data: linkedIds } = await supabase.from("product_customers").select("product_id");
    const { data: recoIds } = await supabase.from("product_recommendations").select("product_id");
    const linked = new Set((linkedIds ?? []).map((x: any) => x.product_id));
    const recoed = new Set((recoIds ?? []).map((x: any) => x.product_id));
    const orphan = p.filter((x) => x.active && !linked.has(x.id) && !recoed.has(x.id));
    return {
      lowStock: lowStock.slice(0, 20),
      outOfStock: outOfStock.slice(0, 20),
      noMargin: noMargin.slice(0, 20),
      missingPrice: missingPrice.slice(0, 20),
      aiPaused: aiPaused.slice(0, 20),
      orphan: orphan.slice(0, 20),
    };
  });

// ---------- AI enrichment ----------
export const aiEnrichProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(2).max(200),
        category: z.string().max(120).optional().nullable(),
        current_description: z.string().max(4000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await getCompanyId(supabase, userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY no configurada");
    const prompt = `Eres un experto en catálogos de e-commerce en español. Devuelve JSON con: description (2-3 frases claras, orientadas a beneficio comercial), tags (array de 3-6 keywords cortas en minúsculas, sin # ni comas).
Producto: ${data.name}
${data.category ? `Categoría: ${data.category}` : ""}
${data.current_description ? `Descripción actual: ${data.current_description}` : ""}
Responde SOLO con JSON válido: {"description":"...","tags":["..."]}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const json: any = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Respuesta IA no válida");
    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error("JSON IA no válido");
    }
    return {
      description: String(parsed.description ?? "").slice(0, 4000),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t: any) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8)
        : [],
    };
  });

// ---------- List product events ----------
export const listProductEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ product_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("product_events")
      .select("*")
      .eq("product_id", data.product_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Distinct categories ----------
export const listCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase.from("products").select("category").not("category", "is", null);
    const set = new Set<string>();
    for (const r of data ?? []) if ((r as any).category) set.add((r as any).category);
    return [...set].sort();
  });
