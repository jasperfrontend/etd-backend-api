router.post("/nextTurn", async (req, res) => {
  const { player_id } = req.body;

  try {
    const { data: player } = await supabase
      .from("players")
      .select("delayed_effects")
      .eq("id", player_id)
      .single();

    if (player?.delayed_effects?.length) {
      for (const effect of player.delayed_effects) {
        await applyEffects(player_id, effect);
      }

      await supabase
        .from("players")
        .update({ delayed_effects: "[]" }) // Clear effects
        .eq("id", player_id);
    }

    return res.json({ message: "Turn advanced, delayed effects applied" });
  } catch (error) {
    console.error("Error advancing turn:", error.message);
    res.status(500).json({ error: "Failed to advance turn" });
  }
});
