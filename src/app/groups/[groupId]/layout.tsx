import { AccessRecorder } from "@/components/trip/access-recorder";
import { TripBottomNav } from "@/components/trip/trip-bottom-nav";
import { TripNavHint } from "@/components/trip/trip-nav-hint";
import { TripStepNavBarWrapper } from "@/components/trip/trip-step-nav-bar";
import { GroupRouteProvider } from "@/contexts/group-route-context";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
};

export default async function GroupLayout({ children, params }: LayoutProps) {
  const { groupId } = await params;
  return (
    <GroupRouteProvider groupId={groupId}>
      <AccessRecorder />
      <TripStepNavBarWrapper />
      <TripNavHint />
      {/* モバイルボトムナビ分の余白 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
      <TripBottomNav />
    </GroupRouteProvider>
  );
}
