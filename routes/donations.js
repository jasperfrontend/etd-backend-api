import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/**
 * Process a Twitch donation (bits -> inventory items)
 * @param {string} player_id - The Streamer’s player ID
 * @param {number} bits - Amount of bits donated
 * @param {string} donor - Name of the donor (for logging)
 */
router.post("/donate", async (req, res) => {
  const { player_id, bits, donor } = req.body;

  if (!player_id || !bits) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Find an inventory item that matches the bit cost
    const { data: item, error: itemError } = await supabase
      .from("inventory")
      .select("id, title, cost")
      .lte("cost", bits) // Find the most expensive item the donation can afford
      .order("cost", { ascending: false }) // Prioritize higher-cost items
      .limit(1)
      .single();

    if (itemError) throw itemError;
    if (!item) return res.status(400).json({ error: "No matching inventory item for donation amount" });

    // Add the item to the Streamer’s inventory
    const { data, error } = await supabase
      .from("inventory")
      .update({ quantity: supabase.raw("quantity + 1") })
      .eq("id", item.id)
      .select();

    if (error) throw error;

    // Log donation
    await supabase.from("game_events").insert([
      {
        game_id: (await supabase.from("game_state").select("id").eq("status", "active").single()).data.id,
        event_type: "donation",
        details: { message: `${donor} donated ${bits} bits and gifted a ${item.title}!` }
      }
    ]);

    return res.json({ message: `${donor} gifted ${item.title}!`, item });
  } catch (error) {
    console.error("Error processing donation:", error.message);
    res.status(500).json({ error: "Failed to process donation" });
  }
});

export default router;
