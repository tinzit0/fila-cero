/*
  FILA CERO — v0.10 / Supabase compartido + administración

  Este proyecto usa tablas y recursos EXCLUSIVOS de Fila Cero.
  No uses aquí service_role ni secret keys.
*/
window.FC_CONFIG = {
  googleMapsApiKey: "",
  supabaseUrl: "https://kxldsjodgfonrrlwjbws.supabase.co",
  supabasePublishableKey: "sb_publishable_J5s_2YqtASIYSqu2k00SGA_copdr39x",
  appBaseUrl: "https://fila-cero.concepcion.workers.dev/",
  maps: {
    fallbackProvider: "openstreetmap",
    geocoderUrl: "https://nominatim.openstreetmap.org/search"
  },
  db: {
    businessesTable: "fila_cero_businesses",
    slotsTable: "fila_cero_slots",
    reservationsTable: "fila_cero_reservations",
    bookingRpc: "fila_cero_book_slot",
    cancelReservationRpc: "fila_cero_cancel_reservation",
    deleteReservationRpc: "fila_cero_delete_reservation",
    deleteMyBusinessRpc: "fila_cero_delete_my_business",
    adminStatusRpc: "fila_cero_is_admin",
    blockedStatusRpc: "fila_cero_is_current_user_blocked",
    adminListBusinessesRpc: "fila_cero_admin_list_businesses",
    adminDeleteBusinessRpc: "fila_cero_admin_delete_business",
    adminListBlockedRpc: "fila_cero_admin_list_blocked",
    adminUnblockRpc: "fila_cero_admin_unblock_owner",
    portfolioBucket: "fila-cero-portfolio"
  }
};
