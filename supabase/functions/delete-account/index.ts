import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.112.4"
import { createDeleteHandler } from "./handler.js"

Deno.serve(createDeleteHandler({ createClient, env: (name: string) => Deno.env.get(name) }))
