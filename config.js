// Public configuration for the athlete app. These two values are PUBLIC by design:
// the anon key only ever grants what Row-Level Security allows, so it is safe to ship and to
// commit to a public repo. The SECRET service-role key lives only in the coach app, never here.
window.IRONMAN_CONFIG = {
  SUPABASE_URL: "https://biowfnuwktaquwynctms.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpb3dmbnV3a3RhcXV3eW5jdG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTAxNzMsImV4cCI6MjEwNzI4NjE3M30.TKtdAggBeOtflHvdGlP_VxI_Zp_stRIA2YFrvuq1xMU",
};
