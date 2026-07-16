import type { Metadata } from "next";
import { InviteCreator } from "../invites/create/InviteCreator";

export const metadata: Metadata = {
  title: "Create a sales invite",
  robots: { index: false, follow: false },
};

export default function CreateLinkPage() {
  return <InviteCreator />;
}
