import express from "express";
import { supabase } from "../supabaseClient.js";
import { applyEffects } from "../utils/gameLogic.js";

const router = express.Router();

/**
 * Apply Chance Card effects (immediate or delayed)
 * @param {string} player_id - The player receiving the effects
 * @param {Object} effects - The JSON effects from the card
 */
router.post("/processCardEffects", async (req, res) => {
  const { player_id, effects } = req.body;

  if (!player_id || !effects) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // If card has a delay, store it in `delayed_effects` JSONB column
    if (effects.delay && effects.delay > 0) {
      const { data, error } = await supabase
        .from("players")
        .update({
          delayed_effects: supabase
            .raw("delayed_effects || ?", JSON.stringify([effects])) // Append to array
        })
        .eq("id", player_id)
        .select();

      if (error) throw error;
      return res.json({ message: "Effect delayed for future turns", effects });
    }

    // Otherwise, apply immediately
    const result = await applyEffects(player_id, effects);
    return res.json(result);
  } catch (error) {
    console.error("Error processing card effects:", error.message);
    res.status(500).json({ error: "Failed to process card effects" });
  }
});

export default router;
