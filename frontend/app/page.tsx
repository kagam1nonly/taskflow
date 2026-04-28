import { redirect } from "next/navigation";

export default function Home() {
  // We don't have a landing page yet, so just redirect to login/board
  redirect("/login");
}
