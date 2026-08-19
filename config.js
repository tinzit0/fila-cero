/*
  FILA CERO — v0.7 / Supabase compartido

  Este proyecto usa tablas y recursos EXCLUSIVOS de Fila Cero.
  No uses aquí service_role ni secret keys.
*/
window.FC_CONFIG = {
  googleMapsApiKey: "",
  supabaseUrl: "https://kxldsjodgfonrrlwjbws.supabase.co",
  supabasePublishableKey: "sb_publishable_J5s_2YqtASIYSqu2k00SGA_copdr39x",
  appBaseUrl: "https://fila-cero.concepcion.workers.dev/",
  db: {
    businessesTable: "fila_cero_businesses",
    slotsTable: "fila_cero_slots",
    reservationsTable: "fila_cero_reservations",
    bookingRpc: "fila_cero_book_slot",
    portfolioBucket: "fila-cero-portfolio"
  }
};
