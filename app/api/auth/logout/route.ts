import { signOut } from "../../../lib/access";

export async function POST() {
  return signOut();
}
