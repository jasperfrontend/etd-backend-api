import supabase from "./supabase.js";
export async function getActiveGameId() {
  const { data, error } = await supabase
      .from("game_state")
      .select("id")
      .eq("status", "active")
      .order("last_updated", { ascending: false })
      .limit(1)
      .single();

  if (error) {
      console.error("Error fetching active game:", error.message);
      return null;
  }
  return data ? data.id : null;
}
