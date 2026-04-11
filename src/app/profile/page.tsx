import { AuthGuard } from "@/components/auth-guard";
import { ProfileForm } from "@/components/profile/profile-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プロフィール",
};

export default function ProfilePage() {
  return (
    <AuthGuard>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          プロフィール
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          表示名は Firebase Authentication と Firestore の users コレクションに保存されます。
        </p>
        <ProfileForm />
      </div>
    </AuthGuard>
  );
}
