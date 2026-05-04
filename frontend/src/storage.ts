const DISPLAY = "adept_displayName";
const PARTICIPANT = "adept_participantId";
const HOST_SECRET = "adept_hostSecret";

export function getOrCreateParticipantId(): string {
  let id = localStorage.getItem(PARTICIPANT)?.trim();
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PARTICIPANT, id);
  }
  return id;
}

export function getDisplayName(): string {
  return localStorage.getItem(DISPLAY)?.trim() ?? "";
}

export function setDisplayName(name: string): void {
  localStorage.setItem(DISPLAY, name.trim().slice(0, 64));
}

export function getHostSecret(): string {
  return localStorage.getItem(HOST_SECRET)?.trim() ?? "";
}

export function setHostSecret(secret: string): void {
  localStorage.setItem(HOST_SECRET, secret);
}
