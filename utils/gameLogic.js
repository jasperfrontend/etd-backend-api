/**
 * Apply effects from a chance card to a player
 * @param {string} player_id - The player receiving effects
 * @param {Object} effects - JSON of effects to apply
 */
export async function applyEffects(player_id, effects) {
  const updates = {};

  if (effects.streamer_moves) {
    updates.position = supabase.raw("position + ?", effects.streamer_moves);
  }
  if (effects.streamer_health) {
    updates.health = supabase.raw("GREATEST(0, health + ?)", effects.streamer_health);
  }
  if (effects.immune) {
    updates.is_immune = true;
    updates.immune_turns = effects.duration || 1;
  }
  if (effects.void_owner) {
    updates.is_voided = true;
    updates.voided_rounds = effects.void_turns || 1;
  }

  const { data, error } = await supabase
    .from("players")
    .update(updates)
    .eq("id", player_id)
    .select();

  if (error) throw error;
  return { message: "Effects applied successfully", effects };
}
