import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { EventEmitter } from "events";

// Load environment variables
config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_KEY || ""
);

// Export the RaffleUser interface
export interface RaffleUser {
  id: number;
  username: string;
  tickets: number;
  created_at: string;
  updated_at: string;
}

// Event emitter to handle raffle events
class RaffleEventEmitter extends EventEmitter {}
export const raffleEvents = new RaffleEventEmitter();

// Initialize the database (no-op for Supabase since table is created via migrations)
export function initializeRaffleDB(): Promise<void> {
  return new Promise((resolve) => {
    console.log("🎲 Raffle database initialized successfully (Supabase)");
    resolve();
  });
}

// Add tickets to a user
export async function addTickets(
  username: string,
  count: number = 1
): Promise<void> {
  const now = new Date().toISOString();
  const lowerUsername = username.toLowerCase();

  try {
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from("raffle_users")
      .select("*")
      .eq("username", lowerUsername)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 is "not found" error, which is expected for new users
      throw fetchError;
    }

    if (existingUser) {
      // User exists, update ticket count
      const { error: updateError } = await supabase
        .from("raffle_users")
        .update({
          tickets: existingUser.tickets + count,
          updated_at: now,
        })
        .eq("username", lowerUsername);

      if (updateError) {
        throw updateError;
      }
    } else {
      // User doesn't exist, create new entry
      const { error: insertError } = await supabase
        .from("raffle_users")
        .insert([
          {
            username: lowerUsername,
            tickets: count,
            created_at: now,
            updated_at: now,
          },
        ]);

      if (insertError) {
        throw insertError;
      }
    }

    // Emit event for ticket added
    raffleEvents.emit("ticketsAdded", {
      username: lowerUsername,
      count,
    });
  } catch (error) {
    console.error("Error adding tickets:", error);
    throw error;
  }
}

// Get user tickets
export async function getUserTickets(username: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("raffle_users")
      .select("tickets")
      .eq("username", username.toLowerCase())
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data?.tickets || 0;
  } catch (error) {
    console.error("Error getting user tickets:", error);
    return 0;
  }
}

// Get all users with tickets
export async function getAllUsers(): Promise<RaffleUser[]> {
  try {
    const { data, error } = await supabase
      .from("raffle_users")
      .select("id, username, tickets, created_at, updated_at")
      .order("tickets", { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Error getting all users:", error);
    return [];
  }
}

// Draw a random winner from the raffle
export async function drawWinner(
  removeTicket: boolean = true
): Promise<RaffleUser | null> {
  try {
    // Get all users with their tickets
    const users = await getAllUsers();

    // No users with tickets
    if (users.length === 0 || users.every((user) => user.tickets === 0)) {
      return null;
    }

    // Create weighted array based on tickets
    const weightedUsers: string[] = [];
    users.forEach((user) => {
      for (let i = 0; i < user.tickets; i++) {
        weightedUsers.push(user.username);
      }
    });

    // Randomly select a winner
    const winnerUsername =
      weightedUsers[Math.floor(Math.random() * weightedUsers.length)];

    // If removeTicket is true, deduct a ticket from the winner
    if (removeTicket) {
      // First get the current user data
      const { data: currentUser, error: fetchError } = await supabase
        .from("raffle_users")
        .select("id, username, tickets, created_at, updated_at")
        .eq("username", winnerUsername)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      if (currentUser && currentUser.tickets > 0) {
        // Update the ticket count
        const { data: winner, error: updateError } = await supabase
          .from("raffle_users")
          .update({
            tickets: currentUser.tickets - 1,
            updated_at: new Date().toISOString(),
          })
          .eq("username", winnerUsername)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        if (winner) {
          raffleEvents.emit("winnerDrawn", winner);
          return winner;
        }
      }
    } else {
      // Just get the winner's data without modifying tickets
      const { data: winner, error: fetchError } = await supabase
        .from("raffle_users")
        .select("id, username, tickets, created_at, updated_at")
        .eq("username", winnerUsername)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      if (winner) {
        raffleEvents.emit("winnerDrawn", winner);
        return winner;
      }
    }

    return null;
  } catch (error) {
    console.error("Error drawing winner:", error);
    return null;
  }
}

// Reset all tickets
export async function resetAllTickets(): Promise<void> {
  try {
    const { error } = await supabase
      .from("raffle_users")
      .update({
        tickets: 0,
        updated_at: new Date().toISOString(),
      })
      .gte("tickets", 0); // Update all records where tickets >= 0 (which is all records)

    if (error) {
      throw error;
    }

    raffleEvents.emit("ticketsReset");
  } catch (error) {
    console.error("Error resetting tickets:", error);
    throw error;
  }
}

// Get top ticket holders
export async function getTopTicketHolders(
  limit: number = 10
): Promise<RaffleUser[]> {
  try {
    const { data, error } = await supabase
      .from("raffle_users")
      .select("id, username, tickets, created_at, updated_at")
      .order("tickets", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Error getting top ticket holders:", error);
    return [];
  }
}

// Close the database connection (no-op for Supabase)
export function closeDatabase(): Promise<void> {
  return Promise.resolve();
}
