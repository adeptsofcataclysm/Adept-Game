import { useState } from "react";
import { Link } from "react-router-dom";
import { getOrCreateParticipantId, getDisplayName, setDisplayName } from "@/storage";

export function NameEntryPage() {
  const [name, setName] = useState(getDisplayName());

  function saveAndContinue() {
    setDisplayName(name);
    getOrCreateParticipantId();
  }

  return (
    <div className="card">
      <h1>Name entry</h1>
      <p>
        After entering a display name you join as a <strong>Spectator</strong> (vision: viewer onboarding,
        REQ-14.8). Use <Link to="/admin">/admin</Link> for the Host.
      </p>
      <div className="row" style={{ marginTop: "0.75rem" }}>
        <label>
          Display name{" "}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={64}
          />
        </label>
      </div>
      <div className="row" style={{ marginTop: "1rem" }}>
        <Link to="/show" onClick={saveAndContinue}>
          Continue to show
        </Link>
      </div>
    </div>
  );
}
