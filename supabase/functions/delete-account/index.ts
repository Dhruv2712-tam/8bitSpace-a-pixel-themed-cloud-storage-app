import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.112.4"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders })

  const authorization = request.headers.get("Authorization")
  if (!authorization) return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders })

  const url = Deno.env.get("SUPABASE_URL")!
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const adminClient = createClient(url, serviceKey)

  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders })

  const { data: fileRows, error: fileError } = await adminClient
    .from("files")
    .select("storage_path")
    .eq("user_id", user.id)
  if (fileError) return Response.json({ error: "Could not prepare account deletion" }, { status: 500, headers: corsHeaders })

  const filePaths = (fileRows ?? []).map(row => row.storage_path).filter(Boolean)
  for (let index = 0; index < filePaths.length; index += 100) {
    const { error } = await adminClient.storage.from("space-files").remove(filePaths.slice(index, index + 100))
    if (error) return Response.json({ error: "Could not remove stored files" }, { status: 500, headers: corsHeaders })
  }

  const { data: avatarObjects } = await adminClient.storage.from("profile-avatars").list(user.id, { limit: 1000 })
  const avatarPaths = (avatarObjects ?? []).map(item => `${user.id}/${item.name}`)
  if (avatarPaths.length) {
    const { error } = await adminClient.storage.from("profile-avatars").remove(avatarPaths)
    if (error) return Response.json({ error: "Could not remove stored avatars" }, { status: 500, headers: corsHeaders })
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
  if (deleteError) return Response.json({ error: "Could not delete account" }, { status: 500, headers: corsHeaders })

  return Response.json({ deleted: true }, { headers: { ...corsHeaders, "Content-Type": "application/json" } })
})
