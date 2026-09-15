import GuitarRoom from "@/components/guitar-room";
import { getChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  return <GuitarRoom signedIn={!!user} />;
}
