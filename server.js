import supabase from "./supabase.js";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import pg from "pg"; // PostgreSQL client
import { getActiveGameId } from "./getActiveGameId.js";

dotenv.config();

const { Pool } = pg; // Extract Pool from pg

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Supabase PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// 🔹 Test Route
app.get("/", (req, res) => {
  res.json({ message: "Escape The Danger API is running!" });
});

// 🔹 Fetch Players
app.get("/players", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error fetching players." });
  }
});

// 🔹 Fetch Game State
app.get("/game-state", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM game_state WHERE status = 'active' LIMIT 1");
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error fetching game state." });
  }
});

// 🔹 Start a New Game
app.post("/start-game", async (req, res) => {
  // Create the Streamer & The Danger in 'players' table
  const { data: streamer, error: streamerError } = await supabase
      .from("players")
      .insert([{ type: "streamer", position: 0, health: 100 }])
      .select()
      .single();

  if (streamerError) return res.status(500).json({ error: "Failed to create Streamer." });

  const { data: danger, error: dangerError } = await supabase
      .from("players")
      .insert([{ type: "danger", position: -2, health: 100 }])
      .select()
      .single();

  if (dangerError) return res.status(500).json({ error: "Failed to create The Danger." });

  // Start a new game session and assign the players
  const { data: game, error: gameError } = await supabase
      .from("game_state")
      .insert([{ streamer_id: streamer.id, danger_id: danger.id, turn: 0, status: "active" }])
      .select()
      .single();

  if (gameError) return res.status(500).json({ error: "Failed to start the game." });

  res.json({ message: "Game started successfully!", game });
});



// 🔹 Process a Game Turn
app.post("/process-turn", async (req, res) => {
  try {
    const { vote_choice } = req.body; // Chat's vote (1, 2, or 3)
    
    // Get active game & turn
    const gameState = await pool.query("SELECT id, turn FROM game_state WHERE status = 'active' LIMIT 1");
    if (gameState.rows.length === 0) {
      return res.status(400).json({ error: "No active game found." });
    }

    const gameId = gameState.rows[0].id;
    let currentTurn = gameState.rows[0].turn;

    // Move The Danger based on chat vote
    if (vote_choice === 1) {
      await pool.query("UPDATE players SET position = position + 1 WHERE type = 'danger'");
      await pool.query(
        "INSERT INTO game_events (game_id, event_type, details) VALUES ($1, $2, $3)",
        [gameId, "move", { message: "The Danger moved 1 street" }]
      );
    } else if (vote_choice === 3) {
      // Draw a Chance Card for The Danger
      const card = await pool.query(
        "SELECT title, description, effects FROM chance_cards WHERE owner = 'danger' ORDER BY random() LIMIT 1"
      );

      await pool.query(
        "INSERT INTO game_events (game_id, event_type, details) VALUES ($1, $2, $3)",
        [gameId, "draw_card", { message: `${card.rows[0].title} - ${card.rows[0].description}`, card: card.rows[0].effects }]
      );
    }

    // Streamer draws a card on turn 0, 5, 10, 15
    if ([0, 5, 10, 15].includes(currentTurn)) {
      const streamerCard = await pool.query(
        "SELECT title, description, effects FROM chance_cards WHERE owner = 'streamer' ORDER BY random() LIMIT 1"
      );

      await pool.query(
        "INSERT INTO game_events (game_id, event_type, details) VALUES ($1, $2, $3)",
        [gameId, "draw_card", { message: `${streamerCard.rows[0].title} - ${streamerCard.rows[0].description}`, card: streamerCard.rows[0].effects }]
      );
    }

    // End Game Check
    const streamerHealth = await pool.query("SELECT health FROM players WHERE type = 'streamer'");
    const dangerHealth = await pool.query("SELECT health FROM players WHERE type = 'danger'");

    if (streamerHealth.rows[0].health <= 0) {
      await pool.query("UPDATE game_state SET status = 'finished' WHERE id = $1", [gameId]);
      await pool.query(
        "INSERT INTO game_events (game_id, event_type, details) VALUES ($1, $2, $3)",
        [gameId, "game_finished", { message: "The Danger won! The Streamer has fallen!" }]
      );
    } else if (dangerHealth.rows[0].health <= 0) {
      await pool.query("UPDATE game_state SET status = 'finished' WHERE id = $1", [gameId]);
      await pool.query(
        "INSERT INTO game_events (game_id, event_type, details) VALUES ($1, $2, $3)",
        [gameId, "game_finished", { message: "The Streamer won! The Danger is defeated!" }]
      );
    }

    // Increment turn
    await pool.query("UPDATE game_state SET turn = turn + 1 WHERE id = $1", [gameId]);

    res.json({ success: "Turn processed.", turn: currentTurn + 1 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process turn." });
  }
});

// 🔹 End the Game
app.post("/end-game", async (req, res) => {
  try {
    const gameState = await pool.query("SELECT id FROM game_state WHERE status = 'active' LIMIT 1");
    if (gameState.rows.length === 0) {
      return res.status(400).json({ error: "No active game found." });
    }

    const gameId = gameState.rows[0].id;

    await pool.query("UPDATE game_state SET status = 'finished' WHERE id = $1", [gameId]);
    await pool.query(
      "INSERT INTO game_events (game_id, event_type, details) VALUES ($1, $2, $3)",
      [gameId, "game_finished", { message: "Game manually ended." }]
    );

    res.json({ success: "Game ended." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to end game." });
  }
});


// 🔹 Add item to inventory
app.post("/inventory/add", async (req, res) => {
  try {
    const { player_id, item_id, amount } = req.body;

    // Check if the item exists in inventory
    const item = await pool.query("SELECT available FROM inventory WHERE id = $1", [item_id]);
    if (item.rows.length === 0) {
      return res.status(404).json({ error: "Item not found." });
    }

    // Get current quantity
    const currentItem = await pool.query(
      "SELECT quantity FROM inventory WHERE player_id = $1 AND id = $2",
      [player_id, item_id]
    );

    const newQuantity = (currentItem.rows[0]?.quantity || 0) + amount;

    // Ensure it does not exceed available amount
    if (newQuantity > item.rows[0].available) {
      return res.status(400).json({ error: "Cannot exceed item limit." });
    }

    if (currentItem.rows.length > 0) {
      // Update existing item quantity
      await pool.query("UPDATE inventory SET quantity = $1 WHERE player_id = $2 AND id = $3", [
        newQuantity,
        player_id,
        item_id,
      ]);
    } else {
      // Insert new item
      await pool.query(
        "INSERT INTO inventory (id, player_id, title, quantity, effects) VALUES ($1, $2, (SELECT title FROM inventory WHERE id = $1), $3, (SELECT effects FROM inventory WHERE id = $1))",
        [item_id, player_id, amount]
      );
    }

    res.json({ success: "Item added to inventory.", item_id, new_quantity: newQuantity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add item to inventory." });
  }
});

app.post("/inventory/remove", async (req, res) => {
  const { playerId, itemId, amount } = req.body;

  const { data: item, error: fetchError } = await supabase
      .from("inventory")
      .select("title, quantity")
      .eq("id", itemId)
      .single();

  if (fetchError || !item) return res.status(400).json({ error: "Item not found" });

  // Prevent negative inventory
  const newQuantity = Math.max(item.quantity - amount, 0);

  const { error: updateError } = await supabase
      .from("inventory")
      .update({ quantity: newQuantity })
      .eq("id", itemId);

  if (updateError) return res.status(500).json({ error: updateError.message });

  res.json({ message: `Removed ${amount}x ${item.title} from inventory.` });
});

app.post("/inventory/use", async (req, res) => {
  const { playerId, itemId } = req.body;

  const { data: item, error: fetchError } = await supabase
      .from("inventory")
      .select("title, quantity, effects")
      .eq("id", itemId)
      .single();

  if (fetchError || !item) return res.status(400).json({ error: "Item not found" });
  if (item.quantity < 1) return res.status(400).json({ error: "No items left to use" });

  // Apply item effects (if any)
  await applyItemEffects(playerId, item.effects);

  // Reduce inventory count
  await supabase
      .from("inventory")
      .update({ quantity: item.quantity - 1 })
      .eq("id", itemId);

  res.json({ message: `Used ${item.title}.` });
});

async function applyItemEffects(playerId, effects) {
  if (!effects) return;

  const updateFields = {};

  if (effects.health) updateFields.health = `health + ${effects.health}`;
  if (effects.streamer_moves) updateFields.position = `position + ${effects.streamer_moves}`;

  if (Object.keys(updateFields).length > 0) {
      await supabase
          .from("players")
          .update(updateFields)
          .eq("id", playerId);
  }

  // Log inventory usage
  await supabase.from("game_events").insert([
      {
          game_id: getActiveGameId,
          player_id: playerId,
          event_type: "inventory_used",
          details: {
              message: "Used an inventory item",
              effects: effects
          }
      }
  ]);
}


// 🔹 Get a player's inventory
app.get("/inventory/:player_id", async (req, res) => {
  try {
    const { player_id } = req.params;
    const inventory = await pool.query("SELECT id, title, quantity FROM inventory WHERE player_id = $1", [
      player_id,
    ]);

    res.json(inventory.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to retrieve inventory." });
  }
});

// 🔹 Process a Donation
app.post("/donate", async (req, res) => {
  try {
    const { username, bits } = req.body;
    const player = await pool.query("SELECT id FROM players WHERE type = 'streamer' LIMIT 1");

    if (player.rows.length === 0) {
      return res.status(400).json({ error: "Streamer not found." });
    }

    const streamerId = player.rows[0].id;

    // Log the donation
    await pool.query(
      "INSERT INTO donations (username, bits, created_at) VALUES ($1, $2, NOW())",
      [username, bits]
    );

    // Find eligible inventory items
    const items = await pool.query("SELECT id, title, cost FROM inventory WHERE cost <= $1", [bits]);

    for (let item of items.rows) {
      await pool.query("CALL add_inventory($1, $2, 1)", [streamerId, item.id]); // Calls stored procedure
    }

    res.json({ success: "Donation processed.", items_granted: items.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process donation." });
  }
});

// 🔹 Move a Player
app.post("/move", async (req, res) => {
  const { player } = req.body;
  let distance = Number(req.body.distance); // 🔥 Convert to number & validate

  if (!["streamer", "danger"].includes(player) || isNaN(distance)) {
      return res.status(400).json({ error: "Invalid player type or distance." });
  }

  try {
      // Get current player position
      const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("id, position")
          .eq("type", player)
          .single();

      if (playerError || !playerData) {
          throw new Error("Failed to fetch player data.");
      }

      const playerId = playerData.id;
      let newPosition = Number(playerData.position) + Number(distance);

      if (isNaN(newPosition)) {
          throw new Error(`Invalid position calculation: player=${player}, position=${playerData.position}, distance=${distance}`);
      }

      if (player === "danger") {
          // Prevent The Danger from overtaking The Streamer
          const { data: streamerData } = await supabase
              .from("players")
              .select("position")
              .eq("type", "streamer")
              .single();

          if (newPosition >= streamerData.position) {
              newPosition = streamerData.position - 1;
              await supabase
                  .from("players")
                  .update({ health: supabase.raw("GREATEST(0, health - 25)") })
                  .eq("type", "streamer");
          }
      }

      // Update the player's position safely
      const { error: updateError } = await supabase
          .from("players")
          .update({ position: newPosition })
          .eq("id", playerId);

      if (updateError) throw updateError;

      // Log move in game_events
      await supabase.from("game_events").insert([
          {
              game_id: (await getActiveGameId()),
              player_id: playerId,
              event_type: "move",
              details: {
                  message: `${player} moved ${distance} streets.`,
                  new_position: newPosition,
              },
          },
      ]);

      return res.json({ success: true, player, new_position: newPosition });
  } catch (error) {
      console.error("Move Error:", error);
      return res.status(500).json({ error: "Failed to move player." });
  }
});


// 🔹 Move a Player
app.post("/move", async (req, res) => {
  const { player } = req.body;
  let distance = Number(req.body.distance); // Convert to number

  if (!["streamer", "danger"].includes(player) || isNaN(distance)) {
    console.error("Invalid /move request:", { player, distance });
    return res.status(400).json({ error: "Invalid player type or distance." });
}

  try {
      // Get current positions
      const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("id, position")
          .eq("type", player)
          .single();

      if (playerError || !playerData) {
          throw new Error("Failed to fetch player data.");
      }

      const playerId = playerData.id;
      let newPosition = playerData.position + distance;

      if (player === "danger") {
          // Check Streamer's position to prevent overtaking
          const { data: streamerData } = await supabase
              .from("players")
              .select("position")
              .eq("type", "streamer")
              .single();

          if (newPosition >= streamerData.position) {
              newPosition = streamerData.position - 1; // Move Danger back
              // Apply damage to the Streamer
              await supabase
                  .from("players")
                  .update({ health: supabase.raw("GREATEST(0, health - 25)") })
                  .eq("type", "streamer");
          }
      }

      // Update the player's position
      const { error: updateError } = await supabase
          .from("players")
          .update({ position: newPosition })
          .eq("id", playerId);

      if (updateError) throw updateError;

      // Log the move in game_events
      await supabase.from("game_events").insert([
          {
              game_id: (await getActiveGameId()), // Ensure there's an active game
              player_id: playerId,
              event_type: "move",
              details: {
                  message: `${player} moved ${distance} streets.`,
                  new_position: newPosition,
              },
          },
      ]);

      return res.json({ success: true, player, new_position: newPosition });
  } catch (error) {
      console.error("Move Error:", error);
      return res.status(500).json({ error: "Failed to move player." });
  }
});


// 🔹 Apply Void Effect
app.post("/void", async (req, res) => {
  try {
    const { player_id, rounds } = req.body;

    // Set the void effect
    await pool.query(
      "UPDATE players SET is_voided = true, voided_rounds = $1 WHERE id = $2",
      [rounds, player_id]
    );

    // Log event
    await pool.query(
      "INSERT INTO game_events (game_id, player_id, event_type, details) VALUES ((SELECT id FROM game_state WHERE status = 'active' LIMIT 1), $1, 'void', $2)",
      [player_id, { message: `Player is voided for ${rounds} turns.` }]
    );

    res.json({ success: `Player voided for ${rounds} turns.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to void player." });
  }
});

// 🔹 Reduce Void Rounds
app.post("/void/process", async (req, res) => {
  try {
    // Reduce voided_rounds for all voided players
    await pool.query(
      "UPDATE players SET voided_rounds = voided_rounds - 1 WHERE is_voided = true AND voided_rounds > 0"
    );

    // Remove void status when rounds hit 0
    await pool.query("UPDATE players SET is_voided = false WHERE voided_rounds <= 0");

    res.json({ success: "Processed void reductions." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process voids." });
  }
});

// 🔹 Apply Immunity Effect
app.post("/immune", async (req, res) => {
  try {
    const { player_id, rounds } = req.body;

    // Set immunity effect
    await pool.query(
      "UPDATE players SET is_immune = true, immune_rounds = $1 WHERE id = $2",
      [rounds, player_id]
    );

    // Log event
    await pool.query(
      "INSERT INTO game_events (game_id, player_id, event_type, details) VALUES ((SELECT id FROM game_state WHERE status = 'active' LIMIT 1), $1, 'immune', $2)",
      [player_id, { message: `Player is immune for ${rounds} turns.` }]
    );

    res.json({ success: `Player granted immunity for ${rounds} turns.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to grant immunity." });
  }
});

// 🔹 Reduce Immunity Rounds
app.post("/immune/process", async (req, res) => {
  try {
    // Reduce immune_rounds for all immune players
    await pool.query(
      "UPDATE players SET immune_rounds = immune_rounds - 1 WHERE is_immune = true AND immune_rounds > 0"
    );

    // Remove immunity when rounds hit 0
    await pool.query("UPDATE players SET is_immune = false WHERE immune_rounds <= 0");

    res.json({ success: "Processed immunity reductions." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process immunity." });
  }
});

// 🔹 Adjust Player Health (Respects Max Health Limit)
app.post("/health/:player_id/:amount", async (req, res) => {
  try {
    const { player_id, amount } = req.params; // Read from URL params
    const healthChange = Number(amount);

    if (isNaN(healthChange)) {
      return res.status(400).json({ error: "Invalid health change value." });
    }

    // Get player's current health
    const playerQuery = await pool.query("SELECT health FROM players WHERE id = $1", [player_id]);

    if (playerQuery.rows.length === 0) {
      return res.status(404).json({ error: "Player not found." });
    }

    const currentHealth = playerQuery.rows[0].health;
    const newHealth = Math.max(0, currentHealth + healthChange); // Ensure health never drops below 0

    // Update health in the database
    await pool.query("UPDATE players SET health = $1 WHERE id = $2", [newHealth, player_id]);

    // Log event
    await pool.query(
      "INSERT INTO game_events (game_id, player_id, event_type, details) VALUES ((SELECT id FROM game_state WHERE status = 'active' LIMIT 1), $1, 'health_change', $2)",
      [player_id, { message: `Health changed by ${healthChange}, new health: ${newHealth}` }]
    );

    res.json({ success: `Player's health adjusted by ${healthChange}.`, new_health: newHealth });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to adjust health." });
  }
});

// 🔹 Draw & Apply Chance Card
app.post("/chance-card", async (req, res) => {
  try {
    const { player_id } = req.body;

    // Get player type (streamer or danger)
    const player = await pool.query("SELECT type FROM players WHERE id = $1", [player_id]);

    if (player.rows.length === 0) {
      return res.status(404).json({ error: "Player not found." });
    }

    const playerType = player.rows[0].type;

    // Select an unplayed Chance Card
    const cardQuery = await pool.query(
      "SELECT id, title, description, effects FROM chance_cards WHERE owner = $1 AND is_played = false ORDER BY random() LIMIT 1",
      [playerType]
    );

    if (cardQuery.rows.length === 0) {
      return res.json({ message: "No available chance cards left for this player." });
    }

    const { id: cardId, title, description, effects } = cardQuery.rows[0];

    // Apply the Chance Card effects
    await applyCardEffects(player_id, effects);

    // Mark the card as played
    await pool.query("UPDATE chance_cards SET is_played = true WHERE id = $1", [cardId]);

    // Log event
    await pool.query(
      "INSERT INTO game_events (game_id, player_id, event_type, details) VALUES ((SELECT id FROM game_state WHERE status = 'active' LIMIT 1), $1, 'chance_card', $2)",
      [player_id, { message: `${title} - ${description}`, card: effects }]
    );

    res.json({ success: `Chance Card applied: ${title}`, effects });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to draw Chance Card." });
  }
});

// 🔹 Draw & Apply Chance Card
app.post("/chance-card", async (req, res) => {
  try {
    const { player_id } = req.body;

    // Get player type (streamer or danger)
    const player = await pool.query("SELECT type FROM players WHERE id = $1", [player_id]);

    if (player.rows.length === 0) {
      return res.status(404).json({ error: "Player not found." });
    }

    const playerType = player.rows[0].type;

    // Select an unplayed Chance Card
    const cardQuery = await pool.query(
      "SELECT id, title, description, effects FROM chance_cards WHERE owner = $1 AND is_played = false ORDER BY random() LIMIT 1",
      [playerType]
    );

    if (cardQuery.rows.length === 0) {
      return res.json({ message: "No available chance cards left for this player." });
    }

    const { id: cardId, title, description, effects } = cardQuery.rows[0];

    // Apply the Chance Card effects
    await applyCardEffects(player_id, effects);

    // Mark the card as played
    await pool.query("UPDATE chance_cards SET is_played = true WHERE id = $1", [cardId]);

    // Log event
    await pool.query(
      "INSERT INTO game_events (game_id, player_id, event_type, details) VALUES ((SELECT id FROM game_state WHERE status = 'active' LIMIT 1), $1, 'chance_card', $2)",
      [player_id, { message: `${title} - ${description}`, card: effects }]
    );

    res.json({ success: `Chance Card applied: ${title}`, effects });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to draw Chance Card." });
  }
});

// 🔹 Process the Next Turn
app.post("/next-turn", async (req, res) => {
  try {
    // Get the current active game
    const gameQuery = await pool.query("SELECT id, turn FROM game_state WHERE status = 'active' LIMIT 1");

    if (gameQuery.rows.length === 0) {
      return res.status(400).json({ error: "No active game found." });
    }

    const { id: gameId, turn: currentTurn } = gameQuery.rows[0];
    const newTurn = currentTurn + 1;

    // Get the Streamer & Danger positions
    const playersQuery = await pool.query("SELECT id, type, position FROM players");
    const players = Object.fromEntries(playersQuery.rows.map((p) => [p.type, p]));

    if (!players.streamer || !players.danger) {
      return res.status(400).json({ error: "Streamer or Danger not found." });
    }

    const { id: streamerId, position: streamerPos } = players.streamer;
    const { id: dangerId, position: dangerPos } = players.danger;

    // 🔹 Handle Delayed Card Effects
    await processDelayedEffects(streamerId);
    await processDelayedEffects(dangerId);

    // 🔹 Draw Chance Card for Streamer at turns 0, 5, 10, 15
    if ([0, 5, 10, 15].includes(currentTurn)) {
      await drawChanceCard(streamerId);
    }

    // 🔹 Draw Chance Card for The Danger at turn 20
    if (currentTurn === 20) {
      await drawChanceCard(dangerId);
    }

    // 🔹 Prevent The Danger from Overtaking the Streamer
    const updatedDanger = await pool.query("SELECT position FROM players WHERE id = $1", [dangerId]);
    const newDangerPos = updatedDanger.rows[0].position;

    if (newDangerPos >= streamerPos) {
      await pool.query("UPDATE players SET position = $1 WHERE id = $2", [streamerPos - 1, dangerId]);

      // Log bounce event
      await pool.query(
        "INSERT INTO game_events (game_id, player_id, event_type, details) VALUES ($1, $2, 'bounce_back', $3)",
        [gameId, dangerId, { message: "The Danger reached the Streamer and bounced back!" }]
      );
    }

    // 🔹 Update Turn Counter
    await pool.query("UPDATE game_state SET turn = $1 WHERE id = $2", [newTurn, gameId]);

    // 🔹 Log Turn End
    await pool.query(
      "INSERT INTO game_events (game_id, event_type, details) VALUES ($1, 'turn_end', $2)",
      [gameId, { turn: newTurn, streamer_position: streamerPos, danger_position: newDangerPos }]
    );

    res.json({ success: `Turn ${newTurn} processed.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process turn." });
  }
});

// 🔹 Process Delayed Chance Card Effects
async function processDelayedEffects() {
  const { data: delayedPlayers } = await supabase
      .from("players")
      .select("id, delayed_rounds, delayed_effects")
      .gt("delayed_rounds", 0); // Fetch players with active delays

  for (const player of delayedPlayers) {
      if (player.delayed_rounds === 1) {
          // 🎯 Time to apply the effect!
          await processCardEffects(player.id, player.delayed_effects);

          // Clear delayed effect after applying
          await supabase
              .from("players")
              .update({
                  delayed_rounds: 0,
                  delayed_effects: null
              })
              .eq("id", player.id);

          // Log the effect execution
          await supabase.from("game_events").insert([
              {
                  game_id: activeGameId,
                  player_id: player.id,
                  event_type: "chance_card_executed",
                  details: {
                      message: `Delayed effect executed!`,
                      effects: player.delayed_effects
                  }
              }
          ]);
      } else {
          // ⏳ Just decrease countdown
          await supabase
              .from("players")
              .update({
                  delayed_rounds: player.delayed_rounds - 1
              })
              .eq("id", player.id);
      }
  }
}



// 🔹 Draw & Apply Chance Card
async function drawChanceCard(player_id) {
  try {
    // Get player type (streamer or danger)
    const player = await pool.query("SELECT type FROM players WHERE id = $1", [player_id]);

    if (player.rows.length === 0) return;
    const playerType = player.rows[0].type;

    // Select an unplayed Chance Card
    const cardQuery = await pool.query(
      "SELECT id, title, description, effects FROM chance_cards WHERE owner = $1 AND is_played = false ORDER BY random() LIMIT 1",
      [playerType]
    );

    if (cardQuery.rows.length === 0) return;

    const { id: cardId, title, description, effects } = cardQuery.rows[0];

    // Apply the Chance Card effects
    await applyCardEffects(player_id, effects);

    // Mark the card as played
    await pool.query("UPDATE chance_cards SET is_played = true WHERE id = $1", [cardId]);

    // Store card ID for delayed effects
    if (effects.delay) {
      await pool.query("UPDATE players SET last_card_id = $1, card_delay = $2 WHERE id = $3", [cardId, effects.delay, player_id]);
    }

    // Log event
    await pool.query(
      "INSERT INTO game_events (game_id, player_id, event_type, details) VALUES ((SELECT id FROM game_state WHERE status = 'active' LIMIT 1), $1, 'chance_card', $2)",
      [player_id, { message: `${title} - ${description}`, card: effects }]
    );
  } catch (error) {
    console.error("Error drawing Chance Card:", error);
  }
}

// 🔹 Check for Game Over
app.post("/gameover/check", async (req, res) => {
  try {
    const game = await pool.query("SELECT id FROM game_state WHERE status = 'active' LIMIT 1");
    if (game.rows.length === 0) return res.json({ error: "No active game." });

    const players = await pool.query("SELECT id, type, health FROM players");

    for (let player of players.rows) {
      if (player.health <= 0) {
        // Update game state
        await pool.query("UPDATE game_state SET status = 'finished' WHERE id = $1", [
          game.rows[0].id,
        ]);

        // Log winner event
        await pool.query(
          "INSERT INTO game_events (game_id, event_type, details) VALUES ($1, 'game_finished', $2)",
          [game.rows[0].id, { message: `${player.type} lost!`, winner: player.type === "streamer" ? "danger" : "streamer" }]
        );

        return res.json({ game_over: true, loser: player.type });
      }
    }

    res.json({ game_over: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to check game over status." });
  }
});

async function applyChanceCard(playerId, card) {
  const { inventory_item, inventory_item_amount } = card;

  if (inventory_item && inventory_item_amount) {
      // Add the inventory item to the player
      await supabase
          .from("inventory")
          .insert([
              {
                  player_id: playerId,
                  title: (await supabase.from("inventory").select("title").eq("id", inventory_item).single()).data.title,
                  quantity: inventory_item_amount
              }
          ]);

      // Log inventory gain
      await supabase.from("game_events").insert([
          {
              game_id: activeGameId,
              player_id: playerId,
              event_type: "inventory_gain",
              details: {
                  message: `Gained ${inventory_item_amount}x new item!`,
                  item_id: inventory_item
              }
          }
      ]);
  }

  // Apply the rest of the card effects as normal
  return await processCardEffects(playerId, card.effects);
}


app.get("/inventory/:playerId", async (req, res) => {
  const { playerId } = req.params;

  const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .eq("player_id", playerId);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});



// 🔹 Start the Server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
