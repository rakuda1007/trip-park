import type { Timestamp } from "firebase/firestore";

export type UserProfile = {
  email: string | null;
  displayName: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};
