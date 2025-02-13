require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(express.json());

// Start a new game
app.post('/game/start', async (req, res) => {
    const { data: activeGame } = await supabase.from('game_state').select('*').eq('status', 'active').single();
    if (activeGame) return res.status(400).json({ error: 'A game is already in progress!' });
    
    const { data: newGame, error } = await supabase.from('game_state').insert([{ turn: 1, status: 'active' }]).select().single();
    if (error) return res.status(500).json({ error });
    return res.json({ success: 'Game started!', game: newGame });
});

// End the game
app.post('/game/end', async (req, res) => {
    const { error } = await supabase.from('game_state').update({ status: 'finished' }).eq('status', 'active');
    if (error) return res.status(500).json({ error });
    return res.json({ success: 'Game ended!' });
});

// Pause the game
app.post('/game/pause', async (req, res) => {
    const { error } = await supabase.from('game_state').update({ status: 'paused' }).eq('status', 'active');
    if (error) return res.status(500).json({ error });
    return res.json({ success: 'Game paused!' });
});

// Move a player
app.post('/move/:player_id/:distance', async (req, res) => {
    const { player_id, distance } = req.params;
    const { error } = await supabase.from('players').update({ position: supabase.raw(`position + ${distance}`) }).eq('id', player_id);
    if (error) return res.status(500).json({ error });
    return res.json({ success: `Player ${player_id} moved ${distance} streets.` });
});

// Draw a chance card
app.post('/pull_card/:player_id', async (req, res) => {
    const { player_id } = req.params;
    const { data: card, error } = await supabase.from('chance_cards').select('*').eq('is_played', false).order('random').limit(1).single();
    if (error || !card) return res.status(404).json({ error: 'No cards available' });
    await supabase.from('chance_cards').update({ is_played: true }).eq('id', card.id);
    return res.json({ success: 'Card drawn!', card });
});

// Apply card effects
app.post('/apply_effects/:player_id', async (req, res) => {
    const { player_id } = req.params;
    const { effects } = req.body;
    
    let updates = {};
    if (effects.streamer_moves) updates.position = supabase.raw(`position + ${effects.streamer_moves}`);
    if (effects.streamer_health) updates.health = supabase.raw(`health + ${effects.streamer_health}`);
    
    const { error } = await supabase.from('players').update(updates).eq('id', player_id);
    if (error) return res.status(500).json({ error });
    return res.json({ success: 'Effects applied!', effects });
});

// Modify health
app.post('/health/:player_id/:amount', async (req, res) => {
    const { player_id, amount } = req.params;
    const { error } = await supabase.from('players').update({ health: supabase.raw(`health + ${amount}`) }).eq('id', player_id);
    if (error) return res.status(500).json({ error });
    return res.json({ success: `Player ${player_id} health changed by ${amount}.` });
});

// Inventory manipulation
app.post('/inventory/:player_id/:item_id/:amount', async (req, res) => {
    const { player_id, item_id, amount } = req.params;
    const { error } = await supabase.from('inventory').update({ quantity: supabase.raw(`quantity + ${amount}`) }).eq('player_id', player_id).eq('id', item_id);
    if (error) return res.status(500).json({ error });
    return res.json({ success: `Inventory updated! Item ${item_id} changed by ${amount}.` });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
