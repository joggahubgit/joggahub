// Feature switches for the gestor panel.

// "Confirmar pagamento" (mark a booking as paid outside the app, e.g. cash at the
// club). Off: every payment must go through the app (Stripe). Turning it back on
// also needs the player side updated: the "Pagamento pendente" banner and the 2h
// expiry cron read game_players.paid, which this button does not change.
export const GESTOR_CAN_MARK_PAID = false;
