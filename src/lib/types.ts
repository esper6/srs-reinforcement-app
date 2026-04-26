export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
}

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}
