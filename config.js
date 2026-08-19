/*
  FILA CERO — v0.13 / plataforma completa

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
    adminListBusinessesRpc: "fila_cero_admin_list_businesses_v13",
    adminDeleteBusinessRpc: "fila_cero_admin_delete_business",
    adminListBlockedRpc: "fila_cero_admin_list_blocked",
    adminUnblockRpc: "fila_cero_admin_unblock_owner",
    favoritesTable: "fila_cero_favorites",
    reviewsTable: "fila_cero_reviews",
    alertsTable: "fila_cero_alert_preferences",
    notificationsTable: "fila_cero_notifications",
    reportsTable: "fila_cero_reports",
    submitReviewRpc: "fila_cero_submit_review",
    claimReservationsRpc: "fila_cero_claim_reservations",
    businessStatsRpc: "fila_cero_business_stats",
    recordProfileViewRpc: "fila_cero_record_profile_view",
    adminSetVerifiedRpc: "fila_cero_admin_set_verified",
    adminListReportsRpc: "fila_cero_admin_list_reports",
    adminUpdateReportRpc: "fila_cero_admin_update_report",
    portfolioBucket: "fila-cero-portfolio"
  }
};
