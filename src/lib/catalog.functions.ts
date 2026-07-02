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

    const topSelling = [...enriched].sort((a, b) => b.purchased - a.purchased).slice(0, 5);
    const topPipeline = [...enriched].sort((a, b) => b.pipeline_value - a.pipeline_value).slice(0, 5);
    const topRecommended = [...enriched].sort((a, b) => b.reco_count - a.reco_count).slice(0, 5);
    const topMargin = [...enriched].filter((x) => x.price > 0).sort((a, b) => b.margin_pct - a.margin_pct).slice(0, 5);

    const totalPipeline = l.reduce((s: number, link: any) => s + Number(link.estimated_value ?? 0), 0);

    return {
      totals: {
        products: p.length,
        active: totalActive,
        lowStock: lowStock.length,
        recommendations: r.length,
        pipelineValue: totalPipeline,
        linked: l.length,
      },
      lowStock: lowStock.slice(0, 10),
      topSelling,
      topPipeline,
      topRecommended,
      topMargin,
      enriched,
    };
  });
