import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/**
 * Add an item to a player's inventory
 * @param {string} player_id - The player's ID
 * @param {string} item_id - The inventory item ID
 * @param {number} quantity - The quantity to add (or remove if negative)
 */
router.post("/addItem", async (req, res) => {
  const { player_id, item_id, quantity } = req.body;

  if (!player_id || !item_id || quantity === undefined) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Fetch item details
    const { data: item, error: itemError } = await supabase
      .from("inventory")
      .select("title, available, quantity")
      .eq("id", item_id)
      .single();

    if (itemError) throw itemError;
    if (!item) return res.status(404).json({ error: "Item not found" });

    // Prevent exceeding limits
    const newQuantity = Math.min(
      Math.max((item.quantity || 0) + quantity, 0), // Ensure no negatives
      item.available // Cap at the available limit
    );

    // Update inventory
    const { data, error } = await supabase
      .from("inventory")
      .update({ quantity: newQuantity })
      .eq("id", item_id)
      .select();

    if (error) throw error;
    return res.json({ message: `Updated inventory: ${item.title}`, newQuantity });
  } catch (error) {
    console.error("Error updating inventory:", error.message);
    res.status(500).json({ error: "Failed to update inventory" });
  }
});

/**
 * Use an item from a player's inventory
 * @param {string} player_id - The player's ID
 * @param {string} item_id - The inventory item ID
 */
router.post("/useItem", async (req, res) => {
  const { player_id, item_id } = req.body;

  if (!player_id || !item_id) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Fetch item details
    const { data: item, error: itemError } = await supabase
      .from("inventory")
      .select("title, quantity, effects")
      .eq("id", item_id)
      .single();

    if (itemError) throw itemError;
    if (!item || item.quantity < 1) {
      return res.status(400).json({ error: "Item not available" });
    }

    // Apply item effects
    const { data: effectResult, error: effectError } = await supabase.rpc(
      "processCardEffects",
      { player_id, effects: item.effects }
    );

    if (effectError) throw effectError;

    // Reduce item quantity
    const { data, error } = await supabase
      .from("inventory")
      .update({ quantity: item.quantity - 1 })
      .eq("id", item_id)
      .select();

    if (error) throw error;
    return res.json({ message: `Used ${item.title}`, newQuantity: data.quantity });
  } catch (error) {
    console.error("Error using inventory item:", error.message);
    res.status(500).json({ error: "Failed to use item" });
  }
});


export default router;
