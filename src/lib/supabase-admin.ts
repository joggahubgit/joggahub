import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sessão própria da administração (não mistura com a conta de jogador nem com
// a do gestor no mesmo navegador). A permissão é conferida no servidor.
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: 'sb-admin-auth' },
})
