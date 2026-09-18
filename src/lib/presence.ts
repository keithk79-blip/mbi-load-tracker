/**
 * Small fixed crew list + a Supabase Realtime Presence channel so everyone
 * can see who else currently has the app open (green dot) vs not (red dot).
 * "Online" means "has this app open in a browser tab right now" — not
 * clocked-in status or anything else.
 */

import { getSupabase } from "./supabase";

export const CREW_ROSTER: { email: string; name: string }[] = [
  { email: "klawson@mrbults.com", name: "K Lawson" },
  { email: "treyling@mrbults.com", name: "T Reyling" },
  { email: "mburklow@mrbults.com", name: "M Burklow" },
  { email: "jlanenga2@mrbults.com", name: "J Lanenga" },
];

export function crewDisplayName(email: string): string {
  const match = CREW_ROSTER.find(
    (person) => person.email.toLowerCase() === email.toLowerCase(),
  );
  return match?.name ?? email.split("@")[0];
}

const PRESENCE_CHANNEL_NAME = "crew-presence";

/**
 * Joins the shared presence channel as `email`, and calls `onChange` with the
 * set of currently-online emails whenever presence state changes. Returns an
 * unsubscribe function.
 */
export function joinCrewPresence(
  email: string,
  onChange: (onlineEmails: Set<string>) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const key = email.toLowerCase();

  const channel = supabase.channel(PRESENCE_CHANNEL_NAME, {
    config: { presence: { key } },
  });

  const emitState = () => {
    const state = channel.presenceState();
    onChange(new Set(Object.keys(state)));
  };

  channel
    .on("presence", { event: "sync" }, emitState)
    .on("presence", { event: "join" }, emitState)
    .on("presence", { event: "leave" }, emitState)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ online_at: new Date().toISOString() });
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
