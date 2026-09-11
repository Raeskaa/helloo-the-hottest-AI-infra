import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  redirect((await currentOwner()) ? "/overview" : "/login");
}
