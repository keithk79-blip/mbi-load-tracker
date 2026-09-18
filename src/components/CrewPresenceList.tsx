import { useEffect, useState } from "react";
import { CREW_ROSTER, crewDisplayName, joinCrewPresence } from "../lib/presence";
import { useAuth } from "../store/AuthContext";

export function CrewPresenceList() {
  const { configured, user } = useAuth();
  const [onlineEmails, setOnlineEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!configured || !user?.email) return;
    return joinCrewPresence(user.email, setOnlineEmails);
  }, [configured, user?.email]);

  if (!configured || !user?.email) return null;

  const others = CREW_ROSTER.filter(
    (person) => person.email.toLowerCase() !== user.email!.toLowerCase(),
  );
  if (!others.length) return null;

  return (
    <div className="crew-presence">
      {others.map((person) => {
        const online = onlineEmails.has(person.email.toLowerCase());
        return (
          <span key={person.email} className="crew-presence-row">
            <span
              className={online ? "crew-dot is-online" : "crew-dot is-offline"}
              aria-hidden="true"
            />
            {crewDisplayName(person.email)}
            <span className="sr-only">{online ? " — online" : " — offline"}</span>
          </span>
        );
      })}
    </div>
  );
}
