import { createFileRoute } from "@tanstack/react-router";
import { ChatView } from "@/components/chat/ChatView";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "FinAgent — Chat" },
      { name: "description", content: "Chat with the FinAgent autonomous research agent." },
    ],
  }),
  component: () => <ChatView />,
});
