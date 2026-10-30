/**
 * Conexão com o Supabase (opcional).
 * Sem a chave, o app funciona em modo local (dados no navegador).
 *
 * A chave "anon"/"publishable" é PÚBLICA por design: pode ficar no código.
 * Quem protege os dados é o Row Level Security (veja supabase/schema.sql):
 * só usuários com login leem e editam.
 * NUNCA coloque aqui a chave "service_role"/"secret".
 */
window.APP_CONFIG = {
  supabaseUrl: "https://pwakqfuvrsmcrflnpnee.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YWtxZnV2cnNtY3JmbG5wbmVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyOTgzOTcsImV4cCI6MjEwODg3NDM5N30.K4j-2WoWBYmRHijGlt7gJuZAN2L36gXcFDkQ_OL4gcg", // anon (pública; os dados são protegidos pelo RLS)
};
