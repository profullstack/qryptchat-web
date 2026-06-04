"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const ALLOWED_KINDS = ["outrank", "crawlproof"];

const KIND_PREFIX = {
  outrank: "otrk_",
  crawlproof: "cp_qc_",
};

async function assertAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const svc = getServiceRoleClient();
  const { data } = await svc
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { ok: false, error: "Admin only." };
  return { ok: true, userId: user.id };
}

export async function createIntegration({ name, kind }) {
  const adminCheck = await assertAdmin();
  if (!adminCheck.ok) return adminCheck;

  const safeKind = ALLOWED_KINDS.includes(kind) ? kind : "crawlproof";
  const safeName = (name || "").trim().slice(0, 100);
  if (!safeName) return { ok: false, error: "Name is required." };

  const accessToken = `${KIND_PREFIX[safeKind]}${randomBytes(32).toString("base64url")}`;

  const svc = getServiceRoleClient();
  const { error } = await svc.from("autoblog_integrations").insert({
    name: safeName,
    kind: safeKind,
    access_token: accessToken,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true, accessToken };
}

export async function revokeIntegration({ id }) {
  const adminCheck = await assertAdmin();
  if (!adminCheck.ok) return adminCheck;

  const svc = getServiceRoleClient();
  const { error } = await svc
    .from("autoblog_integrations")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}
