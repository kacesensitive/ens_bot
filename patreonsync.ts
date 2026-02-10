import { config } from "dotenv";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import tmi from "tmi.js";

config();

const PATREON_API_BASE = "https://www.patreon.com";
const PATREON_NAMESPACE_UUID = "2f2f5d91-2d2f-4af9-9a6f-9d2a9f6f8f3c";
const PAGE_SIZE = 100;
const UPSERT_CHUNK_SIZE = 500;
const LOG_TWITCH_MATCHES = process.env.PATREON_LOG_TWITCH_MATCHES === "true";
const WEEKLY_RECURRING_CHECK_DAY = 4; // Thursday (0=Sunday)
const WEEKLY_RECURRING_CHECK_HOUR = 9; // 9 AM local time
const CREDIT_ELIGIBLE_TIERS = new Set(
  [
    "Production Crew",
    "Newscasters",
    "Council Members",
    "Hot Dog Standees",
    "Now York Flight Attendants",
  ].map((tier) => tier.toLowerCase())
);

type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type FetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

// Node 18+ provides fetch at runtime, but TypeScript may not include DOM lib types here.
declare const fetch: (input: string, init?: FetchInit) => Promise<FetchResponse>;

type PatreonIdentityResponse = {
  data?: {
    relationships?: {
      campaign?: {
        data?: { id?: string | null } | null;
      } | null;
    } | null;
  } | null;
  included?: Array<{ id?: string | null; type?: string | null }> | null;
};

type PatreonMember = {
  id: string;
  type: "member";
  attributes?: {
    full_name?: string | null;
    last_charge_date?: string | null;
    last_charge_status?: string | null;
    lifetime_support_cents?: number | null;
    currently_entitled_amount_cents?: number | null;
    patron_status?: string | null;
  } | null;
  relationships?: {
    currently_entitled_tiers?: {
      data?: Array<{ id: string; type: "tier" }> | null;
    } | null;
    user?: {
      data?: { id?: string | null; type?: string | null } | null;
    } | null;
  } | null;
};

type PatreonTier = {
  id: string;
  type: "tier";
  attributes?: { title?: string | null } | null;
};

type PatreonMembersResponse = {
  data: PatreonMember[];
  included?: Array<PatreonTier | { id?: string | null; type?: string | null }> | null;
  links?: { next?: string | null } | null;
  meta?: {
    pagination?: {
      cursors?: { next?: string | null } | null;
    } | null;
  } | null;
};

type PatreonPledge = {
  id: string;
  type: "pledge";
  attributes?: {
    amount_cents?: number | null;
    created_at?: string | null;
    declined_since?: string | null;
    patron_pays_fees?: boolean | null;
    pledge_cap_cents?: number | null;
  } | null;
  relationships?: {
    patron?: {
      data?: { id?: string | null; type?: string | null } | null;
    } | null;
  } | null;
};

type PatreonUser = {
  id: string;
  type: "user";
  attributes?: {
    full_name?: string | null;
    email?: string | null;
    social_connections?: {
      twitch?: { url?: string; user_id?: string } | null;
      twitter?: { url?: string; user_id?: string } | null;
      discord?: { user_id?: string } | null;
      youtube?: { url?: string; user_id?: string } | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
};

type PatreonPledgesResponse = {
  data: PatreonPledge[];
  included?: Array<PatreonUser | { id?: string | null; type?: string | null }> | null;
  links?: {
    first?: string | null;
    next?: string | null;
  } | null;
  meta?: {
    count?: number | null;
  } | null;
};

type PatronRow = {
  id: string;
  full_name: string;
  is_follower: boolean;
  last_charge_date: string | null;
  last_charge_status: string | null;
  lifetime_support_cents: number | null;
  currently_entitled_amount_cents: number | null;
  patron_status: string | null;
  currently_entitled_tiers: Array<{ id: string; title: string }>;
  twitch_username: string | null;
  last_credit_given: string | null;
};

type PatronInsert = Omit<PatronRow, "last_credit_given"> & {
  last_credit_given?: string | null;
};

type PatronEligibilitySnapshot = {
  id: string;
  twitch_username: string | null;
  currently_entitled_tiers: unknown;
  is_follower: boolean;
  currently_entitled_amount_cents: number | null;
  patron_status: string | null;
};

type PatronCreditSnapshot = {
  id: string;
  last_credit_given: string | null;
};

type SubscriberRow = {
  id: number;
  username: string | null;
  from_patreon: boolean | null;
};

type PatronCreditHistory = {
  patron_id: string;
  last_credit_date: string;
  credit_count: number;
};

type Database = {
  public: {
    Tables: {
      patrons: {
        Row: PatronRow;
        Insert: PatronInsert;
        Update: Partial<PatronRow>;
      };
      subscribers: {
        Row: SubscriberRow;
        Insert: { username: string; from_patreon: boolean };
        Update: Partial<SubscriberRow>;
      };
    };
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const getSupabaseKey = (): string => {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    ""
  );
};

const toStringOrEmpty = (value: unknown): string =>
  typeof value === "string" ? value : "";

const toStringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const toNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" ? value : null;

const uuidToBytes = (uuid: string): Uint8Array => {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID namespace: ${uuid}`);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    const byte = hex.slice(i * 2, i * 2 + 2);
    bytes[i] = Number.parseInt(byte, 16);
  }
  return bytes;
};

const PATREON_NAMESPACE_BYTES = uuidToBytes(PATREON_NAMESPACE_UUID);

const bytesToUuid = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
};

const uuidv5 = (name: string, namespaceBytes: Uint8Array): string => {
  const nameBytes = new Uint8Array(Buffer.from(name, "utf8"));
  const hash = createHash("sha1")
    .update(namespaceBytes)
    .update(nameBytes)
    .digest();
  const bytes = new Uint8Array(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // RFC 4122 version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  return bytesToUuid(bytes);
};

const patreonFetchJson = async (
  url: string,
  token: string,
  attempt = 1
): Promise<unknown> => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "patreonsync/1.0",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
      const backoffMs = 500 * attempt;
      console.warn(
        `Patreon API ${response.status} on attempt ${attempt}. Retrying in ${backoffMs}ms.`
      );
      await sleep(backoffMs);
      return patreonFetchJson(url, token, attempt + 1);
    }
    throw new Error(
      `Patreon API request failed (${response.status} ${response.statusText}): ${body}`
    );
  }

  return response.json();
};

const fetchCampaignId = async (token: string): Promise<string> => {
  const url = `${PATREON_API_BASE}/api/oauth2/v2/identity?include=campaign`;
  const payload = (await patreonFetchJson(
    url,
    token
  )) as PatreonIdentityResponse;

  const directId = payload.data?.relationships?.campaign?.data?.id || null;
  const includedCampaign =
    payload.included?.find((item) => item?.type === "campaign")?.id || null;

  const campaignId = directId ?? includedCampaign;
  if (!campaignId) {
    throw new Error("Patreon identity response missing campaign id.");
  }

  return campaignId;
};

const buildMembersUrl = (campaignId: string): string => {
  const url = new URL(
    `${PATREON_API_BASE}/api/oauth2/v2/campaigns/${campaignId}/members`
  );
  url.searchParams.set("include", "currently_entitled_tiers,user");
  url.searchParams.set(
    "fields[member]",
    [
      "full_name",
      "last_charge_date",
      "last_charge_status",
      "lifetime_support_cents",
      "currently_entitled_amount_cents",
      "patron_status",
    ].join(",")
  );
  url.searchParams.set("fields[tier]", "title");
  url.searchParams.set("fields[user]", "social_connections");
  url.searchParams.set("page[count]", PAGE_SIZE.toString());
  return url.toString();
};

const getNextUrl = (
  currentUrl: string,
  response: PatreonMembersResponse
): string | null => {
  const link = response.links?.next;
  if (typeof link === "string" && link.length > 0) {
    return link;
  }

  const cursor = response.meta?.pagination?.cursors?.next;
  if (typeof cursor === "string" && cursor.length > 0) {
    const url = new URL(currentUrl);
    url.searchParams.set("page[cursor]", cursor);
    return url.toString();
  }

  return null;
};

const buildPledgesUrl = (campaignId: string): string => {
  const url = new URL(
    `${PATREON_API_BASE}/api/oauth2/api/campaigns/${campaignId}/pledges`
  );
  url.searchParams.set("include", "patron");
  url.searchParams.set("page[count]", PAGE_SIZE.toString());
  return url.toString();
};

const getNextPledgesUrl = (
  currentUrl: string,
  response: PatreonPledgesResponse
): string | null => {
  const link = response.links?.next;
  if (typeof link === "string" && link.length > 0) {
    return link;
  }
  return null;
};

const fetchTwitchUsernames = async (
  token: string,
  campaignId: string
): Promise<Map<string, string>> => {
  console.log("Fetching Twitch usernames from Patreon pledges...");
  const twitchMap = new Map<string, string>();
  let nextUrl: string | null = buildPledgesUrl(campaignId);
  let page = 1;

  while (nextUrl) {
    try {
      const payload = (await patreonFetchJson(
        nextUrl,
        token
      )) as PatreonPledgesResponse;

      if (payload.included) {
        payload.included.forEach((item) => {
          if (item?.type === "user" && typeof item.id === "string") {
            const user = item as PatreonUser;
            const twitch = user.attributes?.social_connections?.twitch;
            let twitchUsername: string | null = null;
            
            if (twitch && typeof twitch === "object" && twitch.url) {
              // Extract username from URL like "https://twitch.tv/username"
              const urlMatch = twitch.url.match(/twitch\.tv\/([^\/\?]+)/i);
              if (urlMatch && urlMatch[1]) {
                twitchUsername = urlMatch[1].toLowerCase();
              }
            }
            
            if (twitchUsername) {
              twitchMap.set(item.id, twitchUsername);
              if (LOG_TWITCH_MATCHES) {
                console.log(
                  `Found Twitch username: ${twitchUsername} for user ${item.id}`
                );
              }
            }
          }
        });
      }

      nextUrl = getNextPledgesUrl(nextUrl, payload);
      page += 1;
    } catch (error) {
      console.warn(
        `Error fetching Patreon pledges on page ${page}. Continuing...`,
        error
      );
      break;
    }
  }

  console.log(`Fetched ${twitchMap.size} Twitch usernames from Patreon pledges.`);
  return twitchMap;
};

const buildTierMap = (
  included?: PatreonMembersResponse["included"]
): Map<string, string> => {
  const map = new Map<string, string>();
  if (!included) {
    return map;
  }
  included.forEach((item) => {
    if (item?.type === "tier" && typeof item.id === "string") {
      const title = toStringOrEmpty((item as PatreonTier).attributes?.title);
      map.set(item.id, title);
    }
  });
  return map;
};

const buildUserTwitchMap = (
  included?: PatreonMembersResponse["included"]
): Map<string, string> => {
  const map = new Map<string, string>();
  if (!included) {
    return map;
  }
  included.forEach((item) => {
    if (item?.type === "user" && typeof item.id === "string") {
      const user = item as PatreonUser;
      const twitch = user.attributes?.social_connections?.twitch;
      let twitchUsername: string | null = null;
      
      if (twitch && typeof twitch === "object" && twitch.url) {
        // Extract username from URL like "https://twitch.tv/username"
        const urlMatch = twitch.url.match(/twitch\.tv\/([^\/\?]+)/i);
        if (urlMatch && urlMatch[1]) {
          twitchUsername = urlMatch[1].toLowerCase();
        }
      }
      
      if (twitchUsername) {
        map.set(item.id, twitchUsername);
      }
    }
  });
  return map;
};

const toPatronRow = (
  member: PatreonMember,
  tierMap: Map<string, string>,
  twitchUsernameMap: Map<string, string>,
  userTwitchMap?: Map<string, string>
): PatronInsert => {
  const attributes = member.attributes ?? {};
  const entitledAmount = toNumberOrNull(
    attributes.currently_entitled_amount_cents
  );
  const entitledTiers =
    member.relationships?.currently_entitled_tiers?.data ?? [];

  // Try to get Twitch username from multiple sources:
  // 1. From members API included users (using user relationship) - most reliable
  // 2. From pledges API (using user.id from member relationship)
  let twitchUsername = null;
  
  // First, try to get user ID from member relationship
  const userId = member.relationships?.user?.data?.id;
  
  if (userId) {
    // Try members API included users first (most reliable)
    if (userTwitchMap) {
      twitchUsername = userTwitchMap.get(userId) || null;
    }
    
    // Fallback to pledges API map
    if (!twitchUsername) {
      twitchUsername = twitchUsernameMap.get(userId) || null;
    }
  }
  
  // Debug logging
  if (twitchUsername && LOG_TWITCH_MATCHES) {
    console.log(
      `Matched Twitch username ${twitchUsername} for member ${member.id} (user ${userId})`
    );
  }

  return {
    id: uuidv5(member.id, PATREON_NAMESPACE_BYTES),
    full_name: toStringOrEmpty(attributes.full_name),
    // Patreon does not provide an explicit "is_follower" flag; treat zero entitlement as follower.
    is_follower: (entitledAmount ?? 0) === 0,
    last_charge_date: toStringOrNull(attributes.last_charge_date),
    last_charge_status: toStringOrNull(attributes.last_charge_status),
    lifetime_support_cents: toNumberOrNull(attributes.lifetime_support_cents),
    currently_entitled_amount_cents: entitledAmount,
    patron_status: toStringOrNull(attributes.patron_status),
    // Patreon returns tiers via relationships + included; stitch them together for storage.
    currently_entitled_tiers: entitledTiers
      .filter((tier) => tier?.id)
      .map((tier) => ({
        id: tier.id,
        title: tierMap.get(tier.id) ?? "",
      })),
    twitch_username: twitchUsername,
  };
};

const transformMembers = (
  response: PatreonMembersResponse,
  twitchUsernameMap: Map<string, string>
): { rows: PatronInsert[]; skipped: number } => {
  const tierMap = buildTierMap(response.included ?? undefined);
  const userTwitchMap = buildUserTwitchMap(response.included ?? undefined);
  let skipped = 0;
  const rows: PatronInsert[] = [];
  for (const member of response.data) {
    if (!member?.id) {
      skipped += 1;
      continue;
    }
    rows.push(toPatronRow(member, tierMap, twitchUsernameMap, userTwitchMap));
  }

  return { rows, skipped };
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const fetchExistingIds = async (
  supabase: SupabaseClient<Database, "public">,
  ids: string[]
): Promise<Set<string>> => {
  const existing = new Set<string>();
  const chunks = chunkArray(ids, UPSERT_CHUNK_SIZE);
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from("patrons")
      .select("id")
      .in("id", chunk);

    if (error) {
      throw error;
    }

    data?.forEach((row: { id: string }) => {
      existing.add(row.id);
    });
  }
  return existing;
};

const upsertPatronRows = async (
  supabase: SupabaseClient<Database, "public">,
  rows: PatronInsert[]
): Promise<{ inserted: number; updated: number }> => {
  if (rows.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const ids = rows.map((row) => row.id);
  const existingIds = await fetchExistingIds(supabase, ids);
  const inserted = rows.filter((row) => !existingIds.has(row.id)).length;
  const updated = rows.length - inserted;

  const chunks = chunkArray(rows, UPSERT_CHUNK_SIZE);
  for (const chunk of chunks) {
    const { error } = await supabase
      .from("patrons")
      .upsert(chunk, { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  return { inserted, updated };
};

const normalizeTierTitle = (title: string): string =>
  title.trim().toLowerCase();

const parseEntitledTiers = (
  value: unknown
): Array<{ id: string; title: string }> => {
  const coerceTier = (
    item: unknown
  ): { id: string; title: string } | null => {
    if (!item || typeof item !== "object") {
      return null;
    }
    const record = item as { id?: unknown; title?: unknown };
    if (typeof record.id !== "string" || typeof record.title !== "string") {
      return null;
    }
    return { id: record.id, title: record.title };
  };

  const fromArray = (items: unknown[]): Array<{ id: string; title: string }> =>
    items
      .map(coerceTier)
      .filter((tier): tier is { id: string; title: string } => tier !== null);

  if (Array.isArray(value)) {
    return fromArray(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return fromArray(parsed);
      }
    } catch {
      return [];
    }
  }

  return [];
};

type PatronEligibilityFields = {
  is_follower: boolean;
  currently_entitled_tiers: unknown;
  currently_entitled_amount_cents: number | null;
  patron_status: string | null;
};

const isCreditEligible = (patron: PatronEligibilityFields): boolean => {
  // Must be active, paying, and in an eligible tier.
  if (patron.is_follower) {
    return false;
  }

  const tiers = parseEntitledTiers(patron.currently_entitled_tiers);
  const hasEligibleTier = tiers.some((tier) =>
    CREDIT_ELIGIBLE_TIERS.has(normalizeTierTitle(tier.title || ""))
  );
  const isPaying = (patron.currently_entitled_amount_cents ?? 0) > 0;
  const isActive = patron.patron_status === "active_patron";

  return hasEligibleTier && isPaying && isActive;
};

const getPatronCreditHistory = async (
  supabase: SupabaseClient<Database, "public">,
  patronId: string
): Promise<PatronCreditHistory | null> => {
  // We'll use a simple approach: check subscribers table for from_patreon=true
  // and track by patron_id in a separate table or use a JSON field
  // For now, we'll check the subscribers table for the patron's twitch_username
  const { data: patronData } = await supabase
    .from("patrons")
    .select("twitch_username")
    .eq("id", patronId)
    .single();

  if (!patronData?.twitch_username) {
    return null;
  }

  // Count how many credits this patron has received
  const { data: subscriberData } = await supabase
    .from("subscribers")
    .select("id")
    .eq("username", patronData.twitch_username.toLowerCase())
    .eq("from_patreon", true);

  // Get the most recent credit date (we'll track this via a separate mechanism)
  // For simplicity, we'll use a separate tracking approach
  return {
    patron_id: patronId,
    last_credit_date: new Date().toISOString(), // This will be tracked properly
    credit_count: subscriberData?.length ?? 0,
  };
};

const giveSubmissionCredit = async (
  supabase: SupabaseClient<Database, "public">,
  patron: Pick<PatronRow, "id" | "full_name" | "twitch_username">,
  twitchClient: tmi.Client | null,
  channel: string,
  sendChatMessage: boolean = true
): Promise<boolean> => {
  if (!patron.twitch_username) {
    console.log(`Skipping patron ${patron.full_name} - no Twitch username`);
    return false;
  }

  try {
    // Add subscriber with from_patreon flag
    const { error } = await supabase.from("subscribers").insert({
      username: patron.twitch_username.toLowerCase(),
      from_patreon: true,
    });

    if (error) {
      console.error(
        `Error giving credit to ${patron.twitch_username}:`,
        error
      );
      return false;
    }

    const creditedAt = new Date().toISOString();
    const { error: creditUpdateError } = await supabase
      .from("patrons")
      .update({ last_credit_given: creditedAt })
      .eq("id", patron.id);

    if (creditUpdateError) {
      console.warn(
        `Failed to update last_credit_given for ${patron.twitch_username}:`,
        creditUpdateError
      );
    }

    // Send message to chat
    if (twitchClient && sendChatMessage) {
      try {
        await twitchClient.say(
          channel,
          `🎉 Thank you ${patron.twitch_username} for being a Patreon supporter! You've earned a bonus submission credit! Btw, unlike normal submissions credits, these credits don't expire after the show!`
        );
      } catch (chatError) {
        console.warn(
          `Failed to send chat message for ${patron.twitch_username}:`,
          chatError
        );
      }
    }

    console.log(
      `Gave submission credit to ${patron.twitch_username} (${patron.full_name})`
    );
    return true;
  } catch (error) {
    console.error(
      `Error giving credit to ${patron.twitch_username}:`,
      error
    );
    return false;
  }
};

const fetchExistingPatronsSnapshot = async (
  supabase: SupabaseClient<Database, "public">
): Promise<PatronEligibilitySnapshot[]> => {
  const { data, error } = await supabase
    .from("patrons")
    .select(
      "id, twitch_username, currently_entitled_tiers, is_follower, currently_entitled_amount_cents, patron_status"
    );

  if (error) {
    throw error;
  }

  return (data ?? []) as PatronEligibilitySnapshot[];
};

const checkAndGiveCreditsToNewPatrons = async (
  supabase: SupabaseClient<Database, "public">,
  token: string,
  campaignId: string,
  twitchClient: tmi.Client | null,
  channel: string,
  isInitialSync: boolean = false,
  existingPatronsSnapshot?: PatronEligibilitySnapshot[]
): Promise<void> => {
  if (isInitialSync) {
    console.log("Checking all credit-eligible patrons for initial credit assignment...");
  } else {
    console.log("Checking for new patrons...");
  }
  
  // Get all current patrons from database (or use snapshot from before sync)
  const existingPatrons: PatronEligibilitySnapshot[] =
    existingPatronsSnapshot ??
    (await fetchExistingPatronsSnapshot(supabase));

  const existingPatronIds = new Set(existingPatrons?.map((p) => p.id) ?? []);
  const existingPatronById = new Map(
    existingPatrons?.map((p) => [p.id, p]) ?? []
  );

  // Fetch all current patrons from Patreon
  let nextUrl: string | null = buildMembersUrl(campaignId);
  const allPatrons: PatronInsert[] = [];

  while (nextUrl) {
    try {
      const payload = (await patreonFetchJson(
        nextUrl,
        token
      )) as PatreonMembersResponse;
      
      if (!Array.isArray(payload.data)) {
        break;
      }
      
      const { rows } = transformMembers(payload, new Map<string, string>());
      allPatrons.push(...rows);
      
      nextUrl = getNextUrl(nextUrl, payload);
    } catch (error) {
      console.error("Error fetching patrons for credit check:", error);
      break;
    }
  }

  // Check for credit-eligible patrons
  for (const patron of allPatrons) {
    const existingPatron = existingPatronById.get(patron.id);
    const wasEligible =
      existingPatron != null && isCreditEligible(existingPatron);
    const isEligibleNow = isCreditEligible(patron);

    if (!isEligibleNow) {
      continue;
    }

    if (!patron.twitch_username) {
      continue;
    }

    const isNewPatron = !existingPatronIds.has(patron.id);
    
    if (isInitialSync) {
      // On initial sync, give one credit to ALL eligible patrons (if they don't already have one)
      const { data: existingCredits } = await supabase
        .from("subscribers")
        .select("id")
        .eq("username", patron.twitch_username.toLowerCase())
        .eq("from_patreon", true)
        .limit(1);

      // Only give credit if they don't already have one
      if (!existingCredits || existingCredits.length === 0) {
        await giveSubmissionCredit(supabase, patron, twitchClient, channel);
      }
    } else if (isNewPatron || !wasEligible) {
      // On subsequent syncs, give credits to new patrons or those who became eligible again
      await giveSubmissionCredit(supabase, patron, twitchClient, channel);
    }
  }
};

const checkRecurringCredits = async (
  supabase: SupabaseClient<Database, "public">,
  token: string,
  campaignId: string,
  twitchClient: tmi.Client | null,
  channel: string
): Promise<void> => {
  console.log("Checking for recurring credits (7-day check)...");
  const nowMs = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // Get all patrons with last credit timestamp
  const { data: allPatrons, error: patronsError } = await supabase
    .from("patrons")
    .select("id, last_credit_given");

  if (patronsError) {
    console.error("Error fetching patrons for recurring credits:", patronsError);
    return;
  }

  if (!allPatrons) {
    return;
  }

  const patronCredits = allPatrons as PatronCreditSnapshot[];

  // Fetch fresh data from Patreon to check current status
  let nextUrl: string | null = buildMembersUrl(campaignId);
  const freshPatronsMap = new Map<string, PatronInsert>();

  while (nextUrl) {
    try {
      const payload = (await patreonFetchJson(
        nextUrl,
        token
      )) as PatreonMembersResponse;
      
      if (!Array.isArray(payload.data)) {
        break;
      }
      
      const { rows } = transformMembers(payload, new Map<string, string>());
      for (const patron of rows) {
        freshPatronsMap.set(patron.id, patron);
      }
      
      nextUrl = getNextUrl(nextUrl, payload);
    } catch (error) {
      console.error("Error fetching fresh patron data:", error);
      break;
    }
  }

  // Check each patron in our database
  for (const dbPatron of patronCredits) {
    const freshPatron = freshPatronsMap.get(dbPatron.id);
    if (!freshPatron) {
      continue;
    }

    // Check if still eligible and active
    if (!isCreditEligible(freshPatron)) {
      continue;
    }

    if (!freshPatron.twitch_username) {
      continue;
    }

    const lastCreditMs = dbPatron.last_credit_given
      ? Date.parse(dbPatron.last_credit_given)
      : Number.NaN;
    const shouldGiveCredit =
      Number.isNaN(lastCreditMs) || nowMs - lastCreditMs >= sevenDaysMs;

    if (shouldGiveCredit) {
      await giveSubmissionCredit(
        supabase,
        freshPatron,
        twitchClient,
        channel,
        false
      );
    }
  }
};

const getNextWeeklyRun = (base: Date = new Date()): Date => {
  const next = new Date(base);
  const currentDay = next.getDay();
  const daysUntilTarget =
    (WEEKLY_RECURRING_CHECK_DAY - currentDay + 7) % 7;
  next.setDate(next.getDate() + daysUntilTarget);
  next.setHours(WEEKLY_RECURRING_CHECK_HOUR, 0, 0, 0);

  if (next.getTime() <= base.getTime()) {
    next.setDate(next.getDate() + 7);
  }

  return next;
};

const scheduleWeeklyRecurringCredits = (
  supabase: SupabaseClient<Database, "public">,
  token: string,
  campaignId: string,
  twitchClient: tmi.Client | null,
  channel: string
): void => {
  const scheduleNext = () => {
    const nextRun = getNextWeeklyRun();
    const delayMs = Math.max(0, nextRun.getTime() - Date.now());
    console.log(
      `Next recurring credit check scheduled for ${nextRun.toLocaleString()}`
    );

    setTimeout(async () => {
      try {
        await checkRecurringCredits(
          supabase,
          token,
          campaignId,
          twitchClient,
          channel
        );
      } catch (error) {
        console.error("Error in recurring credit check:", error);
      } finally {
        scheduleNext();
      }
    }, delayMs);
  };

  scheduleNext();
};

const performFullSync = async (
  supabase: SupabaseClient<Database, "public">,
  token: string,
  campaignId: string,
  twitchUsernameMap: Map<string, string>
): Promise<void> => {
  let nextUrl: string | null = buildMembersUrl(campaignId);
  let page = 1;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalProcessed = 0;
  let totalSkipped = 0;

  while (nextUrl) {
    try {
      const payload = (await patreonFetchJson(
        nextUrl,
        token
      )) as PatreonMembersResponse;
      if (!Array.isArray(payload.data)) {
        throw new Error("Patreon members response missing data array.");
      }
      const { rows, skipped } = transformMembers(payload, twitchUsernameMap);

      if (rows.length > 0) {
        const { inserted, updated } = await upsertPatronRows(supabase, rows);
        totalInserted += inserted;
        totalUpdated += updated;
        totalProcessed += rows.length;
        totalSkipped += skipped;
        console.log(
          `Synced Patreon page ${page}: ${rows.length} rows (${inserted} inserted, ${updated} updated).`
        );
      } else {
        totalSkipped += skipped;
        console.log(`Synced Patreon page ${page}: no rows returned.`);
      }

      nextUrl = getNextUrl(nextUrl, payload);
      page += 1;
    } catch (error) {
      console.error(
        `Error syncing Patreon members on page ${page}. Stopping further pagination.`,
        error
      );
      break;
    }
  }

  console.log(
    `Patreon sync complete. Processed ${totalProcessed} rows (${totalInserted} inserted, ${totalUpdated} updated). Skipped ${totalSkipped}.`
  );
};

export const syncPatrons = async (giveInitialCredits: boolean = false): Promise<void> => {
  const token = getRequiredEnv("PATREON_ACCESS_TOKEN");
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseKey = getSupabaseKey();

  if (!supabaseKey) {
    throw new Error(
      "Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY."
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  // Initialize Twitch client if credentials are available
  const twitchUsername = process.env.USERNAME;
  const twitchOAuth = process.env.OAUTH;
  const twitchChannel = process.env.CHANNEL?.split(",")[0] || "ollama";
  
  let twitchClient: tmi.Client | null = null;
  
  if (twitchUsername && twitchOAuth) {
    const opts = {
      identity: {
        username: twitchUsername,
        password: twitchOAuth,
      },
      channels: [twitchChannel],
    };
    
    twitchClient = new tmi.Client(opts);
    await twitchClient.connect();
    console.log(`Connected to Twitch chat in channel: ${twitchChannel}`);
  } else {
    console.warn("Twitch credentials not found. Chat messages will be disabled.");
  }

  const campaignId = await fetchCampaignId(token);
  console.log(`Campaign ID: ${campaignId}`);

  const existingPatronsSnapshot = await fetchExistingPatronsSnapshot(supabase);
  const initialSnapshotForCredits =
    existingPatronsSnapshot.length > 0 ? existingPatronsSnapshot : undefined;

  // Fetch Twitch usernames from pledges API
  const twitchUsernameMap = await fetchTwitchUsernames(token, campaignId);

  // Perform initial full sync
  console.log("Performing initial Patreon sync...");
  await performFullSync(supabase, token, campaignId, twitchUsernameMap);

  // Only give credits to all tier 2+ patrons if flag is set
  if (giveInitialCredits) {
    console.log("Giving initial credits to all credit-eligible patrons...");
    await checkAndGiveCreditsToNewPatrons(
      supabase,
      token,
      campaignId,
      twitchClient,
      twitchChannel,
      true, // isInitialSync = true
      initialSnapshotForCredits
    );
  } else {
    console.log("Skipping initial credit assignment. Use --initial-credits flag to enable.");
    // Still check for new patrons (those not in database yet)
    await checkAndGiveCreditsToNewPatrons(
      supabase,
      token,
      campaignId,
      twitchClient,
      twitchChannel,
      false, // isInitialSync = false
      initialSnapshotForCredits
    );
  }

  // Poll for new patrons every 5 minutes
  const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  setInterval(async () => {
    try {
      const pollExistingPatronsSnapshot =
        await fetchExistingPatronsSnapshot(supabase);
      const pollSnapshotForCredits =
        pollExistingPatronsSnapshot.length > 0
          ? pollExistingPatronsSnapshot
          : undefined;
      // Fetch fresh Twitch usernames on each poll
      const freshTwitchUsernameMap = await fetchTwitchUsernames(token, campaignId);
      await performFullSync(supabase, token, campaignId, freshTwitchUsernameMap);
      await checkAndGiveCreditsToNewPatrons(
        supabase,
        token,
        campaignId,
        twitchClient,
        twitchChannel,
        false, // isInitialSync = false (only check for new patrons)
        pollSnapshotForCredits
      );
    } catch (error) {
      console.error("Error in polling interval:", error);
    }
  }, POLL_INTERVAL_MS);

  // Check for recurring credits weekly on Thursday at 9am local time
  scheduleWeeklyRecurringCredits(
    supabase,
    token,
    campaignId,
    twitchClient,
    twitchChannel
  );

  console.log("Patreon sync service started. Polling every 5 minutes for new patrons.");
  console.log(
    "Recurring credit checks will run weekly on Thursdays at 9:00 AM (local time)."
  );
};

if (require.main === module) {
  // Check for --initial-credits flag
  const giveInitialCredits = process.argv.includes("--initial-credits");
  
  syncPatrons(giveInitialCredits).catch((error) => {
    console.error("Patreon sync failed:", error);
    process.exitCode = 1;
  });
}
